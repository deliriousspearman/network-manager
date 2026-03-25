import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';

const router = Router({ mergeParams: true });

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

// List images for a device (metadata only, no blob)
router.get('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const images = db.prepare(
    'SELECT id, device_id, filename, mime_type, created_at FROM device_images WHERE device_id = ? AND project_id = ? ORDER BY created_at ASC'
  ).all(deviceId, projectId);
  res.json(images);
});

// Serve a single image as binary (for use in <img src>)
router.get('/:imageId', (req, res) => {
  const { deviceId, imageId } = req.params as { deviceId: string; imageId: string };
  const projectId = res.locals.projectId;
  const row = db.prepare(
    'SELECT mime_type, data FROM device_images WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(imageId, deviceId, projectId) as { mime_type: string; data: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Image not found' });

  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Upload a new image
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
    'INSERT INTO device_images (device_id, project_id, filename, mime_type, data) VALUES (?, ?, ?, ?, ?)'
  ).run(deviceId, projectId, safeName, mime_type, data);

  const image = db.prepare(
    'SELECT id, device_id, filename, mime_type, created_at FROM device_images WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(image);
});

// Delete an image
router.delete('/:imageId', (req, res) => {
  const { deviceId, imageId } = req.params as { deviceId: string; imageId: string };
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    'SELECT id FROM device_images WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(imageId, deviceId, projectId);

  if (!existing) return res.status(404).json({ error: 'Image not found' });

  db.prepare('DELETE FROM device_images WHERE id = ?').run(imageId);
  res.status(204).send();
});

export default router;
