import { Router } from 'express';
import db from '../db/connection.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { writeBlob, deleteBlob, absolutePath } from '../storage/blobStore.js';
import { sanitizeFilename } from '../validation.js';
import { publishSafe } from '../events/bus.js';
import { logActivity } from '../db/activityLog.js';
import { SMALL_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

type ImageBlobRow = { mime_type: string | null; file_path: string | null };

const router = Router({ mergeParams: true });

function getViewId(projectId: number, requestedViewId?: string | number): number {
  if (requestedViewId) {
    const vid = Number(requestedViewId);
    const view = db.prepare('SELECT id FROM agent_diagram_views WHERE id = ? AND project_id = ?').get(vid, projectId) as { id: number } | undefined;
    if (view) return view.id;
  }
  let defaultView = db.prepare('SELECT id FROM agent_diagram_views WHERE project_id = ? AND is_default = 1').get(projectId) as { id: number } | undefined;
  if (!defaultView) {
    const result = db.prepare('INSERT INTO agent_diagram_views (project_id, name, is_default) VALUES (?, ?, 1)').run(projectId, 'Default');
    return result.lastInsertRowid as number;
  }
  return defaultView.id;
}

// Views CRUD
router.get('/views', asyncHandler((_req, res) => {
  const projectId = res.locals.projectId;
  const views = db.prepare('SELECT * FROM agent_diagram_views WHERE project_id = ? ORDER BY is_default DESC, name').all(projectId);
  res.json(views);
}));

router.post('/views', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { name } = req.body;
  const result = db.prepare('INSERT INTO agent_diagram_views (project_id, name, is_default) VALUES (?, ?, 0)').run(projectId, name || 'New View');
  const view = db.prepare('SELECT * FROM agent_diagram_views WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(view);
}));

router.put('/views/:viewId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM agent_diagram_views WHERE id = ? AND project_id = ?').get(req.params.viewId, projectId);
  if (!existing) return res.status(404).json({ error: 'View not found' });
  const { name } = req.body;
  if (name) db.prepare('UPDATE agent_diagram_views SET name = ? WHERE id = ?').run(name, req.params.viewId);
  const view = db.prepare('SELECT * FROM agent_diagram_views WHERE id = ?').get(req.params.viewId);
  res.json(view);
}));

router.delete('/views/:viewId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id, is_default FROM agent_diagram_views WHERE id = ? AND project_id = ?').get(req.params.viewId, projectId) as { id: number; is_default: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'View not found' });
  if (existing.is_default) return res.status(400).json({ error: 'Cannot delete the default view' });
  // FK cascades handle child rows (positions, annotations, images).
  db.prepare('DELETE FROM agent_diagram_views WHERE id = ?').run(req.params.viewId);
  res.status(204).send();
}));

// Main GET — return agents on the current view + all agents for the add-to-map dropdown.
router.get('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);

  const agents = db.prepare(
    `SELECT a.*, d.name as device_name, d.os as device_os, p.x, p.y
     FROM agents a
     INNER JOIN agent_diagram_positions p ON a.id = p.agent_id AND p.view_id = ?
     LEFT JOIN devices d ON a.device_id = d.id
     WHERE a.project_id = ?
     ORDER BY a.name`
  ).all(viewId, projectId);

  const all_agents = db.prepare(
    `SELECT a.*, d.name as device_name, d.os as device_os
     FROM agents a
     LEFT JOIN devices d ON a.device_id = d.id
     WHERE a.project_id = ?
     ORDER BY a.name`
  ).all(projectId);

  const connections = db.prepare(
    `SELECT * FROM agent_connections WHERE project_id = ? ORDER BY created_at`
  ).all(projectId);

  const annotations = db.prepare(
    `SELECT * FROM agent_diagram_annotations WHERE project_id = ? AND view_id = ? ORDER BY created_at`
  ).all(projectId, viewId);

  const images = db.prepare(
    `SELECT * FROM agent_diagram_images WHERE project_id = ? AND view_id = ? ORDER BY created_at`
  ).all(projectId, viewId);

  const agent_types = db.prepare(
    `SELECT id, project_id, key, label, icon_source, icon_builtin_key, filename, mime_type,
            CASE WHEN icon_source = 'upload' AND file_path IS NOT NULL THEN 1 ELSE 0 END AS has_upload,
            sort_order, created_at, updated_at
     FROM agent_types WHERE project_id = ? ORDER BY sort_order, label`
  ).all(projectId);

  const views = db.prepare(
    `SELECT * FROM agent_diagram_views WHERE project_id = ? ORDER BY is_default DESC, name`
  ).all(projectId);

  const legendRow = db.prepare(
    'SELECT items FROM agent_diagram_legend WHERE project_id = ?'
  ).get(projectId) as { items: string } | undefined;
  let legend_items: unknown[] = [];
  if (legendRow) {
    try { legend_items = JSON.parse(legendRow.items); } catch { /* skip bad json */ }
  }

  res.json({ agents, all_agents, connections, annotations, images, agent_types, views, current_view_id: viewId, legend_items });
}));

router.put('/legend', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { items } = req.body as { items: unknown[] };
  db.prepare(
    `INSERT INTO agent_diagram_legend (project_id, items) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET items = excluded.items`
  ).run(projectId, JSON.stringify(items || []));
  res.status(204).send();
}));

// Debounced position save
const upsertAgentPos = db.prepare(
  `INSERT INTO agent_diagram_positions (agent_id, view_id, x, y) VALUES (?, ?, ?, ?)
   ON CONFLICT(agent_id, view_id) DO UPDATE SET x = excluded.x, y = excluded.y`
);

const updateAgentPositions = db.transaction((agents: { id: number; x: number; y: number }[], viewId: number) => {
  for (const a of agents) upsertAgentPos.run(a.id, viewId, a.x, a.y);
});

router.put('/positions', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  const agents = Array.isArray(req.body.agents) ? req.body.agents : [];
  updateAgentPositions(agents, viewId);
  publishSafe(projectId, 'agent_diagram', 'updated');
  res.json({ ok: true });
}));

// Add an agent to the current view's map.
router.post('/agents/:agentId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id ?? req.query.view_id);
  const agentId = Number(req.params.agentId);
  const agent = db.prepare('SELECT id, name FROM agents WHERE id = ? AND project_id = ?').get(agentId, projectId) as { id: number; name: string } | undefined;
  if (!agent) return res.status(404).json({ error: 'Agent not found in this project' });
  const x = Number(req.body.x) || 0;
  const y = Number(req.body.y) || 0;
  upsertAgentPos.run(agentId, viewId, x, y);
  publishSafe(projectId, 'agent_diagram', 'updated');
  res.status(201).json({ agent_id: agentId, view_id: viewId, x, y });
}));

// Remove an agent from a view's map (does not delete the agent itself).
router.delete('/agents/:agentId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);
  const agentId = Number(req.params.agentId);
  // Verify ownership before deleting
  const agent = db.prepare('SELECT id FROM agents WHERE id = ? AND project_id = ?').get(agentId, projectId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare('DELETE FROM agent_diagram_positions WHERE agent_id = ? AND view_id = ?').run(agentId, viewId);
  publishSafe(projectId, 'agent_diagram', 'updated');
  res.status(204).send();
}));

// Annotations CRUD
router.post('/annotations', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  const { x = 0, y = 0, text = 'Text', font_size = 14, color = null } = req.body;
  const result = db.prepare(
    'INSERT INTO agent_diagram_annotations (project_id, view_id, x, y, text, font_size, color) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, viewId, x, y, text, font_size, color);
  const ann = db.prepare('SELECT * FROM agent_diagram_annotations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(ann);
}));

router.put('/annotations/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT * FROM agent_diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { text: string; x: number; y: number; font_size: number; color: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: 'Annotation not found' });
  const text = req.body.text !== undefined ? req.body.text : existing.text;
  const x = req.body.x !== undefined ? req.body.x : existing.x;
  const y = req.body.y !== undefined ? req.body.y : existing.y;
  const font_size = req.body.font_size !== undefined ? req.body.font_size : existing.font_size;
  const color = req.body.color !== undefined ? req.body.color : existing.color;
  db.prepare('UPDATE agent_diagram_annotations SET text = ?, x = ?, y = ?, font_size = ?, color = ? WHERE id = ?').run(text, x, y, font_size, color, req.params.id);
  const ann = db.prepare('SELECT * FROM agent_diagram_annotations WHERE id = ?').get(req.params.id);
  res.json(ann);
}));

router.delete('/annotations/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const annotation = db.prepare('SELECT * FROM agent_diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as Record<string, unknown> | undefined;
  if (!annotation) return res.status(404).json({ error: 'Annotation not found' });
  db.prepare('DELETE FROM agent_diagram_annotations WHERE id = ?').run(req.params.id);
  logActivity({
    projectId, action: 'deleted', resourceType: 'agent_annotation',
    resourceId: Number(req.params.id),
    resourceName: typeof annotation.text === 'string' ? annotation.text.slice(0, 80) : null,
    previousState: { annotation },
    canUndo: true,
  });
  res.status(204).send();
}));

// ── Diagram images ────────────────────────────────────────────

router.get('/images/:imageId/image', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const row = db.prepare(
    'SELECT mime_type, file_path FROM agent_diagram_images WHERE id = ? AND project_id = ?'
  ).get(req.params.imageId, projectId) as ImageBlobRow | undefined;
  if (!row || !row.file_path) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(absolutePath(row.file_path));
}));

router.post('/images', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  const { x, y, width, height, filename, mime_type, data, label } = req.body;
  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_IMAGE_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_IMAGE_SIZE) {
    return res.status(400).json({ error: 'Image exceeds 2 MB limit' });
  }
  const safeName = sanitizeFilename(filename);
  const clampedWidth = Math.min(Math.max(Number(width) || 200, 10), 2000);
  const clampedHeight = Math.min(Math.max(Number(height) || 150, 10), 2000);
  const result = db.prepare(
    `INSERT INTO agent_diagram_images (project_id, view_id, x, y, width, height, filename, mime_type, label, file_path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '')`
  ).run(projectId, viewId, Number(x) || 0, Number(y) || 0, clampedWidth, clampedHeight, safeName, mime_type, label || null);
  const id = Number(result.lastInsertRowid);
  const relPath = writeBlob(projectId, 'agent_diagram_images', id, mime_type, decoded);
  db.prepare('UPDATE agent_diagram_images SET file_path = ? WHERE id = ?').run(relPath, id);
  const image = db.prepare(
    'SELECT id, project_id, view_id, x, y, width, height, filename, mime_type, label, label_placement_v, label_placement_h, file_path, created_at FROM agent_diagram_images WHERE id = ?'
  ).get(id);
  res.status(201).json(image);
}));

const LABEL_PLACEMENT_V = new Set(['above', 'middle', 'below']);
const LABEL_PLACEMENT_H = new Set(['left', 'middle', 'right']);

router.put('/images/:imageId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM agent_diagram_images WHERE id = ? AND project_id = ?').get(req.params.imageId, projectId);
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  const { x, y, label } = req.body;
  const width = req.body.width != null ? Math.min(Math.max(Number(req.body.width), 10), 2000) : null;
  const height = req.body.height != null ? Math.min(Math.max(Number(req.body.height), 10), 2000) : null;
  const labelPlacementV = req.body.label_placement_v;
  const labelPlacementH = req.body.label_placement_h;
  if (labelPlacementV != null && !LABEL_PLACEMENT_V.has(labelPlacementV)) {
    return res.status(400).json({ error: 'Invalid label_placement_v' });
  }
  if (labelPlacementH != null && !LABEL_PLACEMENT_H.has(labelPlacementH)) {
    return res.status(400).json({ error: 'Invalid label_placement_h' });
  }
  db.prepare(
    `UPDATE agent_diagram_images SET
       x = COALESCE(?, x),
       y = COALESCE(?, y),
       width = COALESCE(?, width),
       height = COALESCE(?, height),
       label = COALESCE(?, label),
       label_placement_v = COALESCE(?, label_placement_v),
       label_placement_h = COALESCE(?, label_placement_h)
     WHERE id = ? AND project_id = ?`
  ).run(x ?? null, y ?? null, width, height, label ?? null, labelPlacementV ?? null, labelPlacementH ?? null, req.params.imageId, projectId);
  const image = db.prepare(
    'SELECT id, project_id, view_id, x, y, width, height, filename, mime_type, label, label_placement_v, label_placement_h, file_path, created_at FROM agent_diagram_images WHERE id = ? AND project_id = ?'
  ).get(req.params.imageId, projectId);
  res.json(image);
}));

router.delete('/images/:imageId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id, file_path FROM agent_diagram_images WHERE id = ? AND project_id = ?').get(req.params.imageId, projectId) as { id: number; file_path: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM agent_diagram_images WHERE id = ?').run(req.params.imageId);
  deleteBlob(existing.file_path);
  res.status(204).send();
}));

export default router;
