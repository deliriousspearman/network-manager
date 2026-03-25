import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { sanitizeFilename, requireString, optionalString, optionalOneOf } from '../validation.js';
import type { CreateCredentialRequest } from 'shared/types.js';

const MAX_CREDENTIAL_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const CREDENTIAL_TYPES = ['SSH', 'RDP', 'HTTP', 'SNMP', 'SQL', 'VPN', 'SSH Key', 'Other'];

const router = Router({ mergeParams: true });

const listSelect = `
  SELECT c.id, c.device_id, c.host, c.username, c.password, c.type, c.source,
         c.file_name, c.created_at, c.updated_at, c.project_id,
         d.name AS device_name,
         (c.file_name IS NOT NULL) AS has_file
  FROM credentials c
  LEFT JOIN devices d ON c.device_id = d.id
`;

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id } = req.query;
  if (device_id) {
    const credentials = db.prepare(`${listSelect} WHERE c.project_id = ? AND c.device_id = ? ORDER BY c.created_at DESC`).all(projectId, device_id);
    res.json(credentials);
  } else {
    const credentials = db.prepare(`${listSelect} WHERE c.project_id = ? ORDER BY c.created_at DESC`).all(projectId);
    res.json(credentials);
  }
});

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const credential = db.prepare(`${listSelect} WHERE c.id = ? AND c.project_id = ?`).get(req.params.id, projectId);
  if (!credential) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }
  res.json(credential);
});

router.get('/:id/file', (req, res) => {
  const projectId = res.locals.projectId;
  const row = db.prepare('SELECT file_name, file_data FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { file_name: string | null; file_data: Buffer | null } | undefined;
  if (!row || !row.file_data || !row.file_name) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.file_name)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(row.file_data);
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id, host, username, password, type, source, file_name, file_data } = req.body as CreateCredentialRequest;
  if (!username?.trim()) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  const fileBuffer = file_data ? Buffer.from(file_data, 'base64') : null;
  if (fileBuffer && fileBuffer.length > MAX_CREDENTIAL_FILE_SIZE) {
    res.status(400).json({ error: 'File exceeds 5 MB limit' });
    return;
  }
  const safeFileName = file_name ? sanitizeFilename(file_name) : null;
  const result = db.prepare(
    `INSERT INTO credentials (device_id, host, username, password, type, source, file_name, file_data, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    device_id ?? null, optionalString(host, 500), requireString(username, 'username', 200), optionalString(password, 500),
    optionalOneOf(type, CREDENTIAL_TYPES), optionalString(source, 500),
    safeFileName, fileBuffer,
    projectId
  );
  const credential = db.prepare(`${listSelect} WHERE c.id = ?`).get(result.lastInsertRowid);
  logActivity({ projectId, action: 'created', resourceType: 'credential', resourceId: result.lastInsertRowid as number, resourceName: username.trim() });
  res.status(201).json(credential);
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id, host, username, password, type, source, file_name, file_data } = req.body as CreateCredentialRequest;
  if (!username?.trim()) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  const existing = db.prepare('SELECT id FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }
  const validUser = requireString(username, 'username', 200);
  const validHost = optionalString(host, 500);
  const validPass = optionalString(password, 500);
  const validType = optionalOneOf(type, CREDENTIAL_TYPES);
  const validSource = optionalString(source, 500);

  // If file_data is provided, update file fields; if file_name is explicitly empty string, clear file
  if (file_data) {
    const fileBuffer = Buffer.from(file_data, 'base64');
    if (fileBuffer.length > MAX_CREDENTIAL_FILE_SIZE) {
      res.status(400).json({ error: 'File exceeds 5 MB limit' });
      return;
    }
    db.prepare(
      `UPDATE credentials SET device_id=?, host=?, username=?, password=?, type=?, source=?, file_name=?, file_data=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      device_id ?? null, validHost, validUser, validPass,
      validType, validSource,
      file_name ? sanitizeFilename(file_name) : null, fileBuffer,
      req.params.id
    );
  } else if (file_name === '') {
    // Explicitly clear file
    db.prepare(
      `UPDATE credentials SET device_id=?, host=?, username=?, password=?, type=?, source=?, file_name=NULL, file_data=NULL, updated_at=datetime('now') WHERE id=?`
    ).run(
      device_id ?? null, validHost, validUser, validPass,
      validType, validSource,
      req.params.id
    );
  } else {
    // No file change
    db.prepare(
      `UPDATE credentials SET device_id=?, host=?, username=?, password=?, type=?, source=?, updated_at=datetime('now') WHERE id=?`
    ).run(
      device_id ?? null, validHost, validUser, validPass,
      validType, validSource,
      req.params.id
    );
  }
  const credential = db.prepare(`${listSelect} WHERE c.id = ?`).get(req.params.id);
  logActivity({ projectId, action: 'updated', resourceType: 'credential', resourceId: Number(req.params.id), resourceName: username.trim() });
  res.json(credential);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT username FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { username: string } | undefined;
  if (!existing) return res.status(204).send();
  db.prepare('DELETE FROM credentials WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'credential', resourceId: Number(req.params.id), resourceName: existing.username });
  res.status(204).send();
});

export default router;
