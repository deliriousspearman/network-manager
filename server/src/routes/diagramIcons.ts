import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';
import { writeBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { isValidLibraryIcon } from '../iconLibraries.js';
import { ICON_MAX_BYTES as MAX_ICON_SIZE, SMALL_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const VALID_DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone', 'hypervisor'];

type BlobRow = {
  mime_type: string | null;
  file_path: string | null;
  data: string | null;
  icon_source?: string;
  library_id?: string | null;
  library_icon_key?: string | null;
};

function sendBlobRow(res: import('express').Response, row: BlobRow | undefined, notFoundMessage: string) {
  if (!row) return res.status(404).json({ error: notFoundMessage });
  if (row.icon_source === 'library' && row.library_id && row.library_icon_key) {
    // Library-source row: redirect to the static asset.
    return res.redirect(307, `/icon-libraries/${row.library_id}/${row.library_icon_key}.svg`);
  }
  if (row.mime_type) res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (row.file_path) return res.sendFile(absolutePath(row.file_path));
  if (row.data) return res.send(Buffer.from(row.data, 'base64'));
  return res.status(404).json({ error: 'Image payload missing' });
}

interface LibraryPayload { icon_source: 'library'; library_id: string; library_icon_key: string; color?: string | null }
interface UploadPayload { icon_source?: 'upload'; filename: string; mime_type: string; data: string; color?: string | null }
type IconPayload = LibraryPayload | UploadPayload;

function isLibraryPayload(p: unknown): p is LibraryPayload {
  return !!p && typeof p === 'object' && (p as { icon_source?: string }).icon_source === 'library';
}

// Accept #rgb / #rrggbb hex; reject anything else to keep the column clean.
const HEX_COLOR = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function normalizeColor(c: unknown): string | null {
  if (c == null || c === '') return null;
  if (typeof c !== 'string') return null;
  return HEX_COLOR.test(c) ? c.toLowerCase() : null;
}

// ── Type default icons ───────────────────────────────────────

router.get('/type-defaults', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT id, device_type, filename, icon_source, library_id, library_icon_key, color, created_at FROM device_type_icons WHERE project_id = ?'
  ).all(projectId);
  res.json(rows);
});

router.get('/type-defaults/:deviceType/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  const row = db.prepare(
    'SELECT mime_type, file_path, data, icon_source, library_id, library_icon_key FROM device_type_icons WHERE project_id = ? AND device_type = ?'
  ).get(projectId, deviceType) as BlobRow | undefined;
  sendBlobRow(res, row, 'No custom icon for this type');
});

router.put('/type-defaults/:deviceType', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  if (!VALID_DEVICE_TYPES.includes(deviceType)) {
    return res.status(400).json({ error: 'Invalid device type' });
  }
  const payload = req.body as IconPayload;

  if (isLibraryPayload(payload)) {
    if (!payload.library_id || !payload.library_icon_key) {
      return res.status(400).json({ error: 'library_id and library_icon_key are required' });
    }
    if (!isValidLibraryIcon(payload.library_id, payload.library_icon_key)) {
      return res.status(400).json({ error: 'Unknown icon library or icon key' });
    }
    const color = normalizeColor(payload.color);
    const existing = db.prepare(
      'SELECT id, file_path FROM device_type_icons WHERE project_id = ? AND device_type = ?'
    ).get(projectId, deviceType) as { id: number; file_path: string | null } | undefined;
    db.prepare(
      `INSERT INTO device_type_icons (project_id, device_type, icon_source, library_id, library_icon_key, filename, mime_type, data, file_path, color)
       VALUES (?, ?, 'library', ?, ?, NULL, NULL, NULL, NULL, ?)
       ON CONFLICT(project_id, device_type) DO UPDATE SET
         icon_source = 'library',
         library_id = excluded.library_id,
         library_icon_key = excluded.library_icon_key,
         filename = NULL, mime_type = NULL, data = NULL, file_path = NULL,
         color = excluded.color,
         created_at = datetime('now')`
    ).run(projectId, deviceType, payload.library_id, payload.library_icon_key, color);
    if (existing?.file_path) deleteBlob(existing.file_path);
    return res.json({ ok: true });
  }

  // Upload payload
  const { filename, mime_type, data } = payload as UploadPayload;
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

  const existing = db.prepare(
    'SELECT id, file_path FROM device_type_icons WHERE project_id = ? AND device_type = ?'
  ).get(projectId, deviceType) as { id: number; file_path: string | null } | undefined;

  const color = normalizeColor((payload as UploadPayload).color);
  db.prepare(
    `INSERT INTO device_type_icons (project_id, device_type, filename, mime_type, icon_source, library_id, library_icon_key, color)
     VALUES (?, ?, ?, ?, 'upload', NULL, NULL, ?)
     ON CONFLICT(project_id, device_type) DO UPDATE SET
       filename = excluded.filename, mime_type = excluded.mime_type,
       icon_source = 'upload', library_id = NULL, library_icon_key = NULL,
       color = excluded.color,
       created_at = datetime('now')`
  ).run(projectId, deviceType, safeName, mime_type, color);

  const row = db.prepare(
    'SELECT id FROM device_type_icons WHERE project_id = ? AND device_type = ?'
  ).get(projectId, deviceType) as { id: number };
  const relPath = writeBlob(projectId, 'device_type_icons', row.id, mime_type, decoded);
  db.prepare('UPDATE device_type_icons SET file_path = ?, data = NULL WHERE id = ?').run(relPath, row.id);
  if (existing?.file_path && existing.file_path !== relPath) deleteBlob(existing.file_path);
  res.json({ ok: true });
});

router.delete('/type-defaults/:deviceType', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceType } = req.params;
  const existing = db.prepare(
    'SELECT file_path FROM device_type_icons WHERE project_id = ? AND device_type = ?'
  ).get(projectId, deviceType) as { file_path: string | null } | undefined;
  db.prepare('DELETE FROM device_type_icons WHERE project_id = ? AND device_type = ?').run(projectId, deviceType);
  if (existing) deleteBlob(existing.file_path);
  res.status(204).send();
});

// ── Per-device icon overrides ────────────────────────────────

router.get('/device/:deviceId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, file_path, data, icon_source, library_id, library_icon_key FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId) as BlobRow | undefined;
  sendBlobRow(res, row, 'No icon override for this device');
});

router.put('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  const payload = req.body as IconPayload;

  if (isLibraryPayload(payload)) {
    if (!payload.library_id || !payload.library_icon_key) {
      return res.status(400).json({ error: 'library_id and library_icon_key are required' });
    }
    if (!isValidLibraryIcon(payload.library_id, payload.library_icon_key)) {
      return res.status(400).json({ error: 'Unknown icon library or icon key' });
    }
    const color = normalizeColor(payload.color);
    const existing = db.prepare(
      'SELECT id, file_path FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
    ).get(deviceId, projectId) as { id: number; file_path: string | null } | undefined;
    db.prepare(
      `INSERT INTO device_icon_overrides (device_id, project_id, icon_source, library_id, library_icon_key, filename, mime_type, data, file_path, color)
       VALUES (?, ?, 'library', ?, ?, NULL, NULL, NULL, NULL, ?)
       ON CONFLICT(device_id, project_id) DO UPDATE SET
         icon_source = 'library',
         library_id = excluded.library_id,
         library_icon_key = excluded.library_icon_key,
         filename = NULL, mime_type = NULL, data = NULL, file_path = NULL,
         color = excluded.color,
         created_at = datetime('now')`
    ).run(deviceId, projectId, payload.library_id, payload.library_icon_key, color);
    if (existing?.file_path) deleteBlob(existing.file_path);
    return res.json({ ok: true });
  }

  const { filename, mime_type, data } = payload as UploadPayload;
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

  const existing = db.prepare(
    'SELECT id, file_path FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId) as { id: number; file_path: string | null } | undefined;

  const color = normalizeColor((payload as UploadPayload).color);
  db.prepare(
    `INSERT INTO device_icon_overrides (device_id, project_id, filename, mime_type, icon_source, library_id, library_icon_key, color)
     VALUES (?, ?, ?, ?, 'upload', NULL, NULL, ?)
     ON CONFLICT(device_id, project_id) DO UPDATE SET
       filename = excluded.filename, mime_type = excluded.mime_type,
       icon_source = 'upload', library_id = NULL, library_icon_key = NULL,
       color = excluded.color,
       created_at = datetime('now')`
  ).run(deviceId, projectId, safeName, mime_type, color);

  const row = db.prepare(
    'SELECT id FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId) as { id: number };
  const relPath = writeBlob(projectId, 'device_icon_overrides', row.id, mime_type, decoded);
  db.prepare('UPDATE device_icon_overrides SET file_path = ?, data = NULL WHERE id = ?').run(relPath, row.id);
  if (existing?.file_path && existing.file_path !== relPath) deleteBlob(existing.file_path);
  res.json({ ok: true });
});

router.delete('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const { deviceId } = req.params;
  const existing = db.prepare(
    'SELECT file_path FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId) as { file_path: string | null } | undefined;
  db.prepare('DELETE FROM device_icon_overrides WHERE device_id = ? AND project_id = ?').run(deviceId, projectId);
  if (existing) deleteBlob(existing.file_path);
  res.status(204).send();
});

// ── Standalone diagram images ────────────────────────────────

router.get('/images', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = req.query.view_id;
  const rows = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId || null);
  res.json(rows);
});

router.get('/images/:imageId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, file_path, data FROM diagram_images WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as BlobRow | undefined;
  sendBlobRow(res, row, 'Image not found');
});

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
  const clampedWidth = Math.min(Math.max(width || 128, 10), 2000);
  const clampedHeight = Math.min(Math.max(height || 128, 10), 2000);
  const result = db.prepare(
    `INSERT INTO diagram_images (project_id, x, y, width, height, filename, mime_type, label, view_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(projectId, x || 0, y || 0, clampedWidth, clampedHeight, safeName, mime_type, label || null, view_id || null);
  const id = Number(result.lastInsertRowid);
  const relPath = writeBlob(projectId, 'diagram_images', id, mime_type, decoded);
  db.prepare('UPDATE diagram_images SET file_path = ? WHERE id = ?').run(relPath, id);
  const image = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE id = ?'
  ).get(id);
  res.status(201).json(image);
});

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
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId);
  res.json(image);
});

router.delete('/images/:imageId', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const existing = db.prepare('SELECT id, file_path FROM diagram_images WHERE id = ? AND project_id = ?').get(imageId, projectId) as { id: number; file_path: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM diagram_images WHERE id = ? AND project_id = ?').run(imageId, projectId);
  deleteBlob(existing.file_path);
  res.status(204).send();
});

export default router;
