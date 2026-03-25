import { Router } from 'express';
import db from '../db/connection.js';
import { sanitizeFilename } from '../validation.js';

const router = Router({ mergeParams: true });

const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10MB

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
    'SELECT filename, mime_type, data FROM device_attachments WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(attachmentId, deviceId, projectId) as { filename: string; mime_type: string; data: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Attachment not found' });

  const buffer = Buffer.from(row.data, 'base64');
  res.setHeader('Content-Type', row.mime_type);
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.filename)}"`);
  res.send(buffer);
});

router.post('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const { filename, mime_type, size, data } = req.body as { filename: string; mime_type: string; size: number; data: string };

  if (!filename || !data) {
    return res.status(400).json({ error: 'filename and data are required' });
  }
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length > MAX_ATTACHMENT_SIZE) {
    return res.status(400).json({ error: 'Attachment exceeds 10 MB limit' });
  }
  const safeName = sanitizeFilename(filename);

  const result = db.prepare(
    'INSERT INTO device_attachments (device_id, project_id, filename, mime_type, size, data) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(deviceId, projectId, safeName, mime_type ?? 'application/octet-stream', decoded.length, data);

  const attachment = db.prepare(
    'SELECT id, device_id, filename, mime_type, size, created_at FROM device_attachments WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(attachment);
});

router.delete('/:attachmentId', (req, res) => {
  const { deviceId, attachmentId } = req.params as { deviceId: string; attachmentId: string };
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    'SELECT id FROM device_attachments WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(attachmentId, deviceId, projectId);

  if (!existing) return res.status(404).json({ error: 'Attachment not found' });

  db.prepare('DELETE FROM device_attachments WHERE id = ?').run(attachmentId);
  res.status(204).send();
});

export default router;
