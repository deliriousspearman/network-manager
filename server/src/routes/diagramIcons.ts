import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_ICON_SIZE = 512 * 1024; // 512KB for icons
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB for standalone diagram images
const VALID_DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone', 'hypervisor'];
const VALID_AGENT_TYPES = ['wazuh', 'zabbix', 'elk', 'prometheus', 'grafana', 'nagios', 'datadog', 'splunk', 'ossec', 'custom'];

// ── Type default icons ───────────────────────────────────────

// List which device types have custom icons (metadata only)
router.get('/type-defaults', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT id, device_type, filename, created_at FROM device_type_icons WHERE project_id = ?'
  ).all(projectId);
  res.json(rows);
});

// Serve a type default icon as binary
router.get('/type-defaults/:deviceType/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  const row = db.prepare(
    'SELECT mime_type, data FROM device_type_icons WHERE project_id = ? AND device_type = ?'
  ).get(projectId, deviceType) as { mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'No custom icon for this type' });
  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Upload/replace a type default icon
router.put('/type-defaults/:deviceType', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  if (!VALID_DEVICE_TYPES.includes(deviceType)) {
    return res.status(400).json({ error: 'Invalid device type' });
  }
  const { filename, mime_type, data } = req.body as { filename: string; mime_type: string; data: string };
  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_ICON_SIZE) {
    return res.status(400).json({ error: 'Icon exceeds 512 KB limit' });
  }
  const safeName = sanitizeFilename(filename);
  try {
    db.prepare(
      `INSERT INTO device_type_icons (project_id, device_type, filename, mime_type, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, device_type) DO UPDATE SET filename = excluded.filename, mime_type = excluded.mime_type, data = excluded.data, created_at = datetime('now')`
    ).run(projectId, deviceType, safeName, mime_type, data);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error('Failed to upload type default icon:', err);
    const msg = err instanceof Error ? err.message : 'Database error';
    res.status(500).json({ error: msg });
  }
});

// Delete a type default icon
router.delete('/type-defaults/:deviceType', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  db.prepare('DELETE FROM device_type_icons WHERE project_id = ? AND device_type = ?').run(projectId, deviceType);
  res.status(204).send();
});

// ── Agent type default icons ─────────────────────────────────

// List which agent types have custom icons (metadata only)
router.get('/agent-type-defaults', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT id, agent_type, filename, created_at FROM agent_type_icons WHERE project_id = ?'
  ).all(projectId);
  res.json(rows);
});

// Serve an agent type default icon as binary
router.get('/agent-type-defaults/:agentType/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { agentType } = req.params;
  const row = db.prepare(
    'SELECT mime_type, data FROM agent_type_icons WHERE project_id = ? AND agent_type = ?'
  ).get(projectId, agentType) as { mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'No custom icon for this agent type' });
  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Upload/replace an agent type default icon
router.put('/agent-type-defaults/:agentType', (req, res) => {
  const projectId = res.locals.projectId;
  const { agentType } = req.params;
  if (!VALID_AGENT_TYPES.includes(agentType)) {
    return res.status(400).json({ error: 'Invalid agent type' });
  }
  const { filename, mime_type, data } = req.body as { filename: string; mime_type: string; data: string };
  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_ICON_SIZE) {
    return res.status(400).json({ error: 'Icon exceeds 512 KB limit' });
  }
  const safeName = sanitizeFilename(filename);
  try {
    db.prepare(
      `INSERT INTO agent_type_icons (project_id, agent_type, filename, mime_type, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(project_id, agent_type) DO UPDATE SET filename = excluded.filename, mime_type = excluded.mime_type, data = excluded.data, created_at = datetime('now')`
    ).run(projectId, agentType, safeName, mime_type, data);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error('Failed to upload agent type default icon:', err);
    const msg = err instanceof Error ? err.message : 'Database error';
    res.status(500).json({ error: msg });
  }
});

// Delete an agent type default icon
router.delete('/agent-type-defaults/:agentType', (req, res) => {
  const projectId = res.locals.projectId;
  const { agentType } = req.params;
  db.prepare('DELETE FROM agent_type_icons WHERE project_id = ? AND agent_type = ?').run(projectId, agentType);
  res.status(204).send();
});

// ── Per-device icon overrides ────────────────────────────────

// Serve a per-device icon override as binary
router.get('/device/:deviceId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, data FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId) as { mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'No icon override for this device' });
  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Upload/replace a per-device icon override
router.put('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  const { filename, mime_type, data } = req.body as { filename: string; mime_type: string; data: string };
  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_ICON_SIZE) {
    return res.status(400).json({ error: 'Icon exceeds 512 KB limit' });
  }
  const safeName = sanitizeFilename(filename);
  try {
    db.prepare(
      `INSERT INTO device_icon_overrides (device_id, project_id, filename, mime_type, data)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(device_id, project_id) DO UPDATE SET filename = excluded.filename, mime_type = excluded.mime_type, data = excluded.data, created_at = datetime('now')`
    ).run(deviceId, projectId, safeName, mime_type, data);
    res.json({ ok: true });
  } catch (err: unknown) {
    console.error('Failed to upload device icon override:', err);
    const msg = err instanceof Error ? err.message : 'Database error';
    res.status(500).json({ error: msg });
  }
});

// Delete a per-device icon override
router.delete('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  db.prepare('DELETE FROM device_icon_overrides WHERE device_id = ? AND project_id = ?').run(deviceId, projectId);
  res.status(204).send();
});

// ── Standalone diagram images ────────────────────────────────

// List diagram images for a view (metadata only, no blob)
router.get('/images', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = req.query.view_id;
  const rows = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId || null);
  res.json(rows);
});

// Serve a diagram image as binary
router.get('/images/:imageId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, data FROM diagram_images WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as { mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Image not found' });
  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Create a standalone diagram image
router.post('/images', (req, res) => {
  const projectId = res.locals.projectId;
  const { x, y, width, height, filename, mime_type, data, label, view_id } = req.body;
  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_IMAGE_SIZE) {
    return res.status(400).json({ error: 'Image exceeds 2 MB limit' });
  }
  const safeName = sanitizeFilename(filename);
  try {
    const clampedWidth = Math.min(Math.max(width || 128, 10), 2000);
    const clampedHeight = Math.min(Math.max(height || 128, 10), 2000);
    const result = db.prepare(
      `INSERT INTO diagram_images (project_id, x, y, width, height, filename, mime_type, data, label, view_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(projectId, x || 0, y || 0, clampedWidth, clampedHeight, safeName, mime_type, data, label || null, view_id || null);
    const image = db.prepare(
      'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE id = ?'
    ).get(result.lastInsertRowid);
    res.status(201).json(image);
  } catch (err: unknown) {
    console.error('Failed to create diagram image:', err);
    const msg = err instanceof Error ? err.message : 'Database error';
    res.status(500).json({ error: msg });
  }
});

// Update diagram image position/size/label
router.put('/images/:imageId', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const existing = db.prepare('SELECT id FROM diagram_images WHERE id = ? AND project_id = ?').get(imageId, projectId);
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  const { x, y, label } = req.body;
  const width = req.body.width != null ? Math.min(Math.max(Number(req.body.width), 10), 2000) : null;
  const height = req.body.height != null ? Math.min(Math.max(Number(req.body.height), 10), 2000) : null;
  db.prepare(
    `UPDATE diagram_images SET
       x = COALESCE(?, x),
       y = COALESCE(?, y),
       width = COALESCE(?, width),
       height = COALESCE(?, height),
       label = COALESCE(?, label)
     WHERE id = ? AND project_id = ?`
  ).run(x ?? null, y ?? null, width, height, label ?? null, imageId, projectId);
  const image = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE id = ?'
  ).get(imageId);
  res.json(image);
});

// Delete a diagram image
router.delete('/images/:imageId', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const existing = db.prepare('SELECT id FROM diagram_images WHERE id = ? AND project_id = ?').get(imageId, projectId);
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM diagram_images WHERE id = ?').run(imageId);
  res.status(204).send();
});

export default router;
