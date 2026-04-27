import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';
import { writeBlob, readBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { SMALL_IMAGE_MAX_BYTES as MAX_IMAGE_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

type BlobRow = { mime_type: string; file_path: string | null; data: string | null };

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT id, project_id, filename, mime_type, size, created_at FROM image_library WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
  res.json(rows);
});

router.get('/:imageId/image', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT mime_type, file_path, data FROM image_library WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as BlobRow | undefined;
  if (!row) return res.status(404).json({ error: 'Image not found' });
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (row.file_path) return res.sendFile(absolutePath(row.file_path));
  if (row.data) return res.send(Buffer.from(row.data, 'base64'));
  return res.status(404).json({ error: 'Image payload missing' });
});

router.get('/:imageId/data', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const row = db.prepare(
    'SELECT filename, mime_type, file_path, data FROM image_library WHERE id = ? AND project_id = ?'
  ).get(imageId, projectId) as { filename: string; mime_type: string; file_path: string | null; data: string | null } | undefined;
  if (!row) return res.status(404).json({ error: 'Image not found' });
  const base64 = row.file_path ? readBlob(row.file_path).toString('base64') : (row.data ?? '');
  res.json({ filename: row.filename, mime_type: row.mime_type, data: base64 });
});

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
  const result = db.prepare(
    `INSERT INTO image_library (project_id, filename, mime_type, size)
     VALUES (?, ?, ?, ?)`
  ).run(projectId, safeName, mime_type, decoded.length);
  const id = Number(result.lastInsertRowid);
  const relPath = writeBlob(projectId, 'image_library', id, mime_type, decoded);
  db.prepare('UPDATE image_library SET file_path = ? WHERE id = ?').run(relPath, id);
  const image = db.prepare(
    'SELECT id, project_id, filename, mime_type, size, created_at FROM image_library WHERE id = ?'
  ).get(id);
  res.status(201).json(image);
});

router.delete('/:imageId', (req, res) => {
  const projectId = res.locals.projectId;
  const { imageId } = req.params;
  const existing = db.prepare('SELECT id, file_path FROM image_library WHERE id = ? AND project_id = ?').get(imageId, projectId) as { id: number; file_path: string | null } | undefined;
  if (!existing) return res.status(404).json({ error: 'Image not found' });
  db.prepare('DELETE FROM image_library WHERE id = ?').run(imageId);
  deleteBlob(existing.file_path);
  res.status(204).send();
});

export default router;
