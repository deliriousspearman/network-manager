import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';
import { writeBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { PROFILE_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

router.get('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const images = db.prepare(
    'SELECT id, device_id, filename, mime_type, created_at FROM device_images WHERE device_id = ? AND project_id = ? ORDER BY created_at ASC'
  ).all(deviceId, projectId);
  res.json(images);
});

router.get('/:imageId', (req, res) => {
  const { deviceId, imageId } = req.params as { deviceId: string; imageId: string };
  const projectId = res.locals.projectId;
  const row = db.prepare(
    'SELECT mime_type, file_path, data FROM device_images WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(imageId, deviceId, projectId) as { mime_type: string; file_path: string | null; data: string | null } | undefined;

  if (!row) return res.status(404).json({ error: 'Image not found' });

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  if (row.file_path) return res.sendFile(absolutePath(row.file_path));
  if (row.data) return res.send(Buffer.from(row.data, 'base64'));
  return res.status(404).json({ error: 'Image payload missing' });
});

router.post('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const { filename, mime_type, data } = req.body as { filename: string; mime_type: string; data: string };

  if (!filename || !mime_type || !data) {
    return res.status(400).json({ error: 'filename, mime_type and data are required' });
  }
  if (!ALLOWED_IMAGE_MIMES.includes(mime_type)) {
    return res.status(400).json({ error: `Invalid image type. Allowed: ${ALLOWED_IMAGE_MIMES.join(', ')}` });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_IMAGE_SIZE) {
    return res.status(400).json({ error: 'Image exceeds 5 MB limit' });
  }
  const safeName = sanitizeFilename(filename);

  const result = db.prepare(
    'INSERT INTO device_images (device_id, project_id, filename, mime_type) VALUES (?, ?, ?, ?)'
  ).run(deviceId, projectId, safeName, mime_type);
  const id = Number(result.lastInsertRowid);
  const relPath = writeBlob(projectId, 'device_images', id, mime_type, decoded);
  db.prepare('UPDATE device_images SET file_path = ? WHERE id = ?').run(relPath, id);

  const image = db.prepare(
    'SELECT id, device_id, filename, mime_type, created_at FROM device_images WHERE id = ?'
  ).get(id);

  res.status(201).json(image);
});

router.delete('/:imageId', (req, res) => {
  const { deviceId, imageId } = req.params as { deviceId: string; imageId: string };
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    'SELECT id, file_path FROM device_images WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(imageId, deviceId, projectId) as { id: number; file_path: string | null } | undefined;

  if (!existing) return res.status(404).json({ error: 'Image not found' });

  db.prepare('DELETE FROM device_images WHERE id = ? AND project_id = ?').run(imageId, projectId);
  deleteBlob(existing.file_path);
  res.status(204).send();
});

export default router;
