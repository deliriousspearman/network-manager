import { Router } from 'express';
import db from '../db/connection.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { logActivity } from '../db/activityLog.js';
import { optionalString } from '../validation.js';
import { publishSafe } from '../events/bus.js';

const router = Router({ mergeParams: true });

function verifyAgentOwnership(agentId: number, projectId: number): boolean {
  const row = db.prepare('SELECT 1 FROM agents WHERE id = ? AND project_id = ?').get(agentId, projectId);
  return !!row;
}

function verifyImageOwnership(imageId: number, projectId: number): boolean {
  const row = db.prepare('SELECT 1 FROM agent_diagram_images WHERE id = ? AND project_id = ?').get(imageId, projectId);
  return !!row;
}

function endpointName(agentId: number | null, imageId: number | null): string {
  if (agentId) {
    return (db.prepare('SELECT name FROM agents WHERE id = ?').get(agentId) as { name: string } | undefined)?.name || '?';
  }
  if (imageId) {
    const row = db.prepare('SELECT label, filename FROM agent_diagram_images WHERE id = ?').get(imageId) as { label: string | null; filename: string | null } | undefined;
    return row?.label || row?.filename || `image #${imageId}`;
  }
  return '?';
}

router.get('/', asyncHandler((_req, res) => {
  const projectId = res.locals.projectId;
  const connections = db.prepare(
    `SELECT c.*,
       sa.name AS source_name, ta.name AS target_name,
       si.label AS source_image_label, si.filename AS source_image_filename,
       ti.label AS target_image_label, ti.filename AS target_image_filename
     FROM agent_connections c
     LEFT JOIN agents sa ON c.source_agent_id = sa.id
     LEFT JOIN agents ta ON c.target_agent_id = ta.id
     LEFT JOIN agent_diagram_images si ON c.source_image_id = si.id
     LEFT JOIN agent_diagram_images ti ON c.target_image_id = ti.id
     WHERE c.project_id = ?
     ORDER BY c.created_at DESC`
  ).all(projectId);
  res.json(connections);
}));

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const {
    source_agent_id, target_agent_id,
    source_image_id, target_image_id,
    label, connection_type,
    edge_color, edge_width, label_color, label_bg_color,
    source_handle, target_handle, source_port, target_port,
  } = req.body;

  const srcAgent = source_agent_id ? Number(source_agent_id) : null;
  const tgtAgent = target_agent_id ? Number(target_agent_id) : null;
  const srcImage = source_image_id ? Number(source_image_id) : null;
  const tgtImage = target_image_id ? Number(target_image_id) : null;

  if ((srcAgent ? 1 : 0) + (srcImage ? 1 : 0) !== 1) {
    return res.status(400).json({ error: 'Exactly one of source_agent_id or source_image_id is required' });
  }
  if ((tgtAgent ? 1 : 0) + (tgtImage ? 1 : 0) !== 1) {
    return res.status(400).json({ error: 'Exactly one of target_agent_id or target_image_id is required' });
  }
  if (srcAgent && !verifyAgentOwnership(srcAgent, projectId)) {
    return res.status(400).json({ error: 'Source agent not found in this project' });
  }
  if (tgtAgent && !verifyAgentOwnership(tgtAgent, projectId)) {
    return res.status(400).json({ error: 'Target agent not found in this project' });
  }
  if (srcImage && !verifyImageOwnership(srcImage, projectId)) {
    return res.status(400).json({ error: 'Source image not found in this project' });
  }
  if (tgtImage && !verifyImageOwnership(tgtImage, projectId)) {
    return res.status(400).json({ error: 'Target image not found in this project' });
  }

  const result = db.prepare(
    `INSERT INTO agent_connections
     (project_id, source_agent_id, target_agent_id, source_image_id, target_image_id,
      label, connection_type,
      edge_color, edge_width, label_color, label_bg_color,
      source_handle, target_handle, source_port, target_port)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    projectId, srcAgent, tgtAgent, srcImage, tgtImage,
    optionalString(label, 500), optionalString(connection_type, 50) ?? 'link',
    optionalString(edge_color, 50), edge_width != null ? Number(edge_width) : null,
    optionalString(label_color, 50), optionalString(label_bg_color, 50),
    optionalString(source_handle, 100), optionalString(target_handle, 100),
    optionalString(source_port, 100), optionalString(target_port, 100),
  );

  const connection = db.prepare('SELECT * FROM agent_connections WHERE id = ?').get(result.lastInsertRowid);
  const srcName = endpointName(srcAgent, srcImage);
  const tgtName = endpointName(tgtAgent, tgtImage);
  logActivity({
    projectId, action: 'created', resourceType: 'agent_connection',
    resourceId: result.lastInsertRowid as number, resourceName: `${srcName} → ${tgtName}`,
  });
  publishSafe(projectId, 'agent_connection', 'created', result.lastInsertRowid as number);
  res.status(201).json(connection);
}));

router.put('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT * FROM agent_connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Connection not found' });

  const label = req.body.label !== undefined ? req.body.label : existing.label;
  const connection_type = req.body.connection_type !== undefined ? req.body.connection_type : existing.connection_type;
  const edge_color = req.body.edge_color !== undefined ? req.body.edge_color : (existing.edge_color ?? null);
  const edge_width = req.body.edge_width !== undefined ? req.body.edge_width : (existing.edge_width ?? null);
  const label_color = req.body.label_color !== undefined ? req.body.label_color : (existing.label_color ?? null);
  const label_bg_color = req.body.label_bg_color !== undefined ? req.body.label_bg_color : (existing.label_bg_color ?? null);
  const source_handle = req.body.source_handle !== undefined ? req.body.source_handle : (existing.source_handle ?? null);
  const target_handle = req.body.target_handle !== undefined ? req.body.target_handle : (existing.target_handle ?? null);
  const source_port = req.body.source_port !== undefined ? req.body.source_port : (existing.source_port ?? null);
  const target_port = req.body.target_port !== undefined ? req.body.target_port : (existing.target_port ?? null);

  const endpointTouched =
    req.body.source_agent_id !== undefined || req.body.target_agent_id !== undefined ||
    req.body.source_image_id !== undefined || req.body.target_image_id !== undefined;

  let source_agent_id = existing.source_agent_id as number | null;
  let target_agent_id = existing.target_agent_id as number | null;
  let source_image_id = existing.source_image_id as number | null;
  let target_image_id = existing.target_image_id as number | null;

  if (endpointTouched) {
    if (req.body.source_agent_id !== undefined) source_agent_id = req.body.source_agent_id != null ? Number(req.body.source_agent_id) : null;
    if (req.body.target_agent_id !== undefined) target_agent_id = req.body.target_agent_id != null ? Number(req.body.target_agent_id) : null;
    if (req.body.source_image_id !== undefined) source_image_id = req.body.source_image_id != null ? Number(req.body.source_image_id) : null;
    if (req.body.target_image_id !== undefined) target_image_id = req.body.target_image_id != null ? Number(req.body.target_image_id) : null;

    if ((source_agent_id ? 1 : 0) + (source_image_id ? 1 : 0) !== 1) {
      return res.status(400).json({ error: 'Exactly one of source_agent_id or source_image_id is required' });
    }
    if ((target_agent_id ? 1 : 0) + (target_image_id ? 1 : 0) !== 1) {
      return res.status(400).json({ error: 'Exactly one of target_agent_id or target_image_id is required' });
    }
    if (source_agent_id && !verifyAgentOwnership(source_agent_id, projectId)) {
      return res.status(400).json({ error: 'Source agent not found in this project' });
    }
    if (target_agent_id && !verifyAgentOwnership(target_agent_id, projectId)) {
      return res.status(400).json({ error: 'Target agent not found in this project' });
    }
    if (source_image_id && !verifyImageOwnership(source_image_id, projectId)) {
      return res.status(400).json({ error: 'Source image not found in this project' });
    }
    if (target_image_id && !verifyImageOwnership(target_image_id, projectId)) {
      return res.status(400).json({ error: 'Target image not found in this project' });
    }
  }

  db.prepare(
    `UPDATE agent_connections SET
     source_agent_id = ?, target_agent_id = ?, source_image_id = ?, target_image_id = ?,
     label = ?, connection_type = ?,
     edge_color = ?, edge_width = ?, label_color = ?, label_bg_color = ?,
     source_handle = ?, target_handle = ?, source_port = ?, target_port = ?
     WHERE id = ?`
  ).run(
    source_agent_id, target_agent_id, source_image_id, target_image_id,
    label ?? null, connection_type, edge_color, edge_width, label_color, label_bg_color,
    source_handle, target_handle, source_port, target_port, req.params.id,
  );

  const connection = db.prepare('SELECT * FROM agent_connections WHERE id = ?').get(req.params.id);
  publishSafe(projectId, 'agent_connection', 'updated', Number(req.params.id));
  res.json(connection);
}));

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const connection = db.prepare(
    `SELECT c.*,
       sa.name AS source_name, ta.name AS target_name,
       si.label AS source_image_label, si.filename AS source_image_filename,
       ti.label AS target_image_label, ti.filename AS target_image_filename
     FROM agent_connections c
     LEFT JOIN agents sa ON c.source_agent_id = sa.id
     LEFT JOIN agents ta ON c.target_agent_id = ta.id
     LEFT JOIN agent_diagram_images si ON c.source_image_id = si.id
     LEFT JOIN agent_diagram_images ti ON c.target_image_id = ti.id
     WHERE c.id = ? AND c.project_id = ?`
  ).get(req.params.id, projectId) as Record<string, unknown> & {
    source_name?: string; target_name?: string;
    source_image_label?: string; source_image_filename?: string;
    target_image_label?: string; target_image_filename?: string;
  } | undefined;
  if (!connection) return res.status(404).json({ error: 'Connection not found' });

  const srcLabel = connection.source_name
    || connection.source_image_label
    || connection.source_image_filename
    || '?';
  const tgtLabel = connection.target_name
    || connection.target_image_label
    || connection.target_image_filename
    || '?';

  db.prepare('DELETE FROM agent_connections WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'agent_connection',
    resourceId: Number(req.params.id),
    resourceName: `${srcLabel} → ${tgtLabel}`,
    previousState: { connection },
    canUndo: true,
  });
  res.status(204).send();
}));

export default router;
