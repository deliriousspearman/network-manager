import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';
import { writeBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { ATTACHMENT_MAX_BYTES as MAX_ATTACHMENT_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const attachments = db.prepare(
    'SELECT id, device_id, filename, mime_type, size, created_at FROM device_attachments WHERE device_id = ? AND project_id = ? ORDER BY created_at ASC'
  ).all(deviceId, projectId);
  res.json(attachments);
});

router.get('/:attachmentId', (req, res) => {
  const { deviceId, attachmentId } = req.params as { deviceId: string; attachmentId: string };
  const projectId = res.locals.projectId;
  const row = db.prepare(
    'SELECT filename, mime_type, file_path, data FROM device_attachments WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(attachmentId, deviceId, projectId) as { filename: string; mime_type: string; file_path: string | null; data: string | null } | undefined;

  if (!row) return res.status(404).json({ error: 'Attachment not found' });

  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.filename)}"`);

  if (row.file_path) return res.sendFile(absolutePath(row.file_path));
  if (row.data) return res.send(Buffer.from(row.data, 'base64'));
  return res.status(404).json({ error: 'Attachment payload missing' });
});

router.post('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const { filename, mime_type, data } = req.body as { filename: string; mime_type: string; size: number; data: string };

  if (!filename || !data) {
    return res.status(400).json({ error: 'filename and data are required' });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_ATTACHMENT_SIZE) {
    return res.status(400).json({ error: 'Attachment exceeds 10 MB limit' });
  }
  const safeName = sanitizeFilename(filename);
  const resolvedMime = mime_type ?? 'application/octet-stream';

  const result = db.prepare(
    'INSERT INTO device_attachments (device_id, project_id, filename, mime_type, size) VALUES (?, ?, ?, ?, ?)'
  ).run(deviceId, projectId, safeName, resolvedMime, decoded.length);
  const id = Number(result.lastInsertRowid);
  const relPath = writeBlob(projectId, 'device_attachments', id, resolvedMime, decoded);
  db.prepare('UPDATE device_attachments SET file_path = ? WHERE id = ?').run(relPath, id);

  const attachment = db.prepare(
    'SELECT id, device_id, filename, mime_type, size, created_at FROM device_attachments WHERE id = ?'
  ).get(id);

  res.status(201).json(attachment);
});

router.delete('/:attachmentId', (req, res) => {
  const { deviceId, attachmentId } = req.params as { deviceId: string; attachmentId: string };
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    'SELECT id, file_path FROM device_attachments WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(attachmentId, deviceId, projectId) as { id: number; file_path: string | null } | undefined;

  if (!existing) return res.status(404).json({ error: 'Attachment not found' });

  db.prepare('DELETE FROM device_attachments WHERE id = ? AND project_id = ?').run(attachmentId, projectId);
  deleteBlob(existing.file_path);
  res.status(204).send();
});

export default router;
