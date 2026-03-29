import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

// List library images (metadata only, no blob)
router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT id, project_id, filename, mime_type, size, created_at FROM image_library WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
  res.json(rows);
});

// Serve a library image as binary
router.get('/:imageId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, data FROM image_library WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as { mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Image not found' });
  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(buffer);
});

// Return image data as JSON (for placing on diagram)
router.get('/:imageId/data', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT filename, mime_type, data FROM image_library WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as { filename: string; mime_type: string; data: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Image not found' });
  res.json({ filename: row.filename, mime_type: row.mime_type, data: row.data });
});

// Upload a new image to the library
router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { filename, mime_type, data } = req.body;
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
    const result = db.prepare(
      `INSERT INTO image_library (project_id, filename, mime_type, data, size)
       VALUES (?, ?, ?, ?, ?)`
    ).run(projectId, safeName, mime_type, data, decoded.length);
    const image = db.prepare(
      'SELECT id, project_id, filename, mime_type, size, created_at FROM image_library WHERE id = ?'
    ).get(result.lastInsertRowid);
    res.status(201).json(image);
  } catch (err: unknown) {
    console.error('Failed to upload to image library:', err);
    const msg = err instanceof Error ? err.message : 'Database error';
    res.status(500).json({ error: msg });
  }
});

// Delete an image from the library
router.delete('/:imageId', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const existing = db.prepare('SELECT id FROM image_library WHERE id = ? AND project_id = ?').get(imageId, projectId);
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM image_library WHERE id = ?').run(imageId);
  res.status(204).send();
});

export default router;
