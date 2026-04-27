import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { sanitizeFilename, requireString, optionalString, optionalOneOf } from '../validation.js';
import { pagedResponse } from '../utils/pagination.js';
import { buildListQuery } from '../utils/listQuery.js';
import { publishSafe } from '../events/bus.js';
import { CREDENTIAL_FILE_MAX_BYTES as MAX_CREDENTIAL_FILE_SIZE } from '../config/limits.js';
import type { CreateCredentialRequest, CredentialPasswordHistoryStatus } from 'shared/types.js';

const CREDENTIAL_TYPES = ['SSH', 'RDP', 'HTTP', 'SNMP', 'SQL', 'VPN', 'SSH Key', 'Other'];

const router = Router({ mergeParams: true });

const listSelect = `
  SELECT c.id, c.device_id, c.host, c.username, c.password, c.type, c.source,
         c.file_name, c.used, c.hidden, c.created_at, c.updated_at, c.last_used_at, c.project_id,
         d.name AS device_name,
         (c.file_name IS NOT NULL) AS has_file
  FROM credentials c
  LEFT JOIN devices d ON c.device_id = d.id
`;

// Bump last_used_at without touching updated_at — accessing a credential
// shouldn't trip optimistic-locking on the next edit.
const touchCredential = db.prepare("UPDATE credentials SET last_used_at = datetime('now') WHERE id = ? AND project_id = ?");

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id } = req.query;

  // Device-scoped query: never paginate (used from device detail page)
  if (device_id) {
    const credentials = db.prepare(`${listSelect} WHERE c.project_id = ? AND c.device_id = ? ORDER BY c.created_at DESC`).all(projectId, device_id);
    return res.json(credentials);
  }

  let { whereClause, whereParams, orderBy, pagination } = buildListQuery(req, {
    projectId,
    projectColumn: 'c.project_id',
    search: { columns: ['c.host', 'c.username', 'c.password', 'c.type', 'c.source', 'd.name'] },
    filters: {
      used: { column: 'c.used', type: 'bool01' },
      // 'hidden=1' -> only hidden; 'hidden=all' -> both. Default (below) hides soft-hidden rows.
      hidden: {
        column: 'c.hidden',
        type: 'string',
        sentinels: { '1': 'c.hidden = 1', all: '1=1' },
      },
    },
    sort: {
      map: { device_name: 'd.name', host: 'c.host', username: 'c.username', type: 'c.type', source: 'c.source' },
      default: 'c.created_at',
    },
  });

  // Default hidden behavior: when the caller doesn't specify `hidden`, omit soft-hidden rows.
  if (req.query.hidden === undefined) {
    whereClause = `${whereClause} AND c.hidden = 0`;
  }

  if (pagination) {
    const { page, limit, offset } = pagination;
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM credentials c LEFT JOIN devices d ON c.device_id = d.id ${whereClause}`).get(...whereParams) as { total: number };
    const items = db.prepare(`${listSelect} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`).all(...whereParams, limit, offset);
    return res.json(pagedResponse(items, total, page, limit));
  }

  res.json(db.prepare(`${listSelect} ${whereClause} ${orderBy}`).all(...whereParams));
});

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const credential = db.prepare(`${listSelect} WHERE c.id = ? AND c.project_id = ?`).get(req.params.id, projectId);
  if (!credential) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }
  // Detail fetch is a reasonable proxy for "user wanted to see this credential" —
  // bump after the row is loaded so the response still reflects the just-bumped value.
  touchCredential.run(req.params.id, projectId);
  res.json(credential);
});

router.get('/:id/file', (req, res) => {
  const projectId = res.locals.projectId;
  const row = db.prepare('SELECT file_name, file_data FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { file_name: string | null; file_data: Buffer | null } | undefined;
  if (!row || !row.file_data || !row.file_name) {
    res.status(404).json({ error: 'File not found' });
    return;
  }
  touchCredential.run(req.params.id, projectId);
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.file_name)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(row.file_data);
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id, host, username, password, type, source, file_name, file_data, used } = req.body as CreateCredentialRequest;
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
    `INSERT INTO credentials (device_id, host, username, password, type, source, file_name, file_data, used, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    device_id ?? null, optionalString(host, 500), requireString(username, 'username', 200), optionalString(password, 500),
    optionalOneOf(type, CREDENTIAL_TYPES), optionalString(source, 500),
    safeFileName, fileBuffer,
    used ? 1 : 0,
    projectId
  );
  const credential = db.prepare(`${listSelect} WHERE c.id = ?`).get(result.lastInsertRowid);
  logActivity({ projectId, action: 'created', resourceType: 'credential', resourceId: result.lastInsertRowid as number, resourceName: username.trim() });
  publishSafe(projectId, 'credential', 'created', result.lastInsertRowid as number);
  res.status(201).json(credential);
});

// Snapshot the prior password / file payload into credential_password_history
// before an UPDATE overwrites it. Only fires when secret content actually
// changes — same-value or first-set (null → value) updates skip. Caller must
// run this inside the same transaction as the UPDATE so a crash between the
// two can't leave a dangling history row.
type CredentialRow = {
  id: number;
  password: string | null;
  file_name: string | null;
  file_data: Buffer | null;
};
function snapshotIfChanged(prev: CredentialRow, projectId: number, next: { password: string | null; file_name: string | null; file_data: Buffer | null }): boolean {
  const passwordChanged = (prev.password ?? null) !== (next.password ?? null);
  const prevFile = prev.file_data ?? null;
  const nextFile = next.file_data ?? null;
  // Cheap byte-equality check; both columns are typically small
  const fileChanged = (prevFile === null) !== (nextFile === null)
    || (prevFile !== null && nextFile !== null && !prevFile.equals(nextFile));

  if (!passwordChanged && !fileChanged) return false;
  // First-set: nothing worth preserving.
  if (prev.password == null && prev.file_data == null) return false;
  // Nothing in the prior row to record (e.g. password was null and only file_name changed).
  if (prev.password == null && prev.file_data == null && prev.file_name == null) return false;

  db.prepare(
    `INSERT INTO credential_password_history (credential_id, project_id, password, file_name, file_data, status)
     VALUES (?, ?, ?, ?, ?, 'previous')`
  ).run(prev.id, projectId, prev.password ?? null, prev.file_name ?? null, prev.file_data ?? null);
  return true;
}

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const { device_id, host, username, password, type, source, file_name, file_data, used } = req.body as CreateCredentialRequest;
  if (!username?.trim()) {
    res.status(400).json({ error: 'username is required' });
    return;
  }
  const existing = db.prepare('SELECT id, updated_at FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { id: number; updated_at: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }
  if (req.body.updated_at && req.body.updated_at !== existing.updated_at) {
    res.status(409).json({ error: 'Record was modified by another user. Please refresh and try again.' });
    return;
  }
  const validUser = requireString(username, 'username', 200);
  const validHost = optionalString(host, 500);
  const validPass = optionalString(password, 500);
  const validType = optionalOneOf(type, CREDENTIAL_TYPES);
  const validSource = optionalString(source, 500);
  const validUsed = used ? 1 : 0;

  // Prepare the next file fields. Three cases mirror the original: explicit
  // payload, explicit clear, or "leave file alone".
  let nextFileBuffer: Buffer | null | 'KEEP' = 'KEEP';
  let nextFileName: string | null | 'KEEP' = 'KEEP';
  if (file_data) {
    const fileBuffer = Buffer.from(file_data, 'base64');
    if (fileBuffer.length > MAX_CREDENTIAL_FILE_SIZE) {
      res.status(400).json({ error: 'File exceeds 5 MB limit' });
      return;
    }
    nextFileBuffer = fileBuffer;
    nextFileName = file_name ? sanitizeFilename(file_name) : null;
  } else if (file_name === '') {
    nextFileBuffer = null;
    nextFileName = null;
  }

  const idNum = Number(req.params.id);
  const applyUpdate = db.transaction(() => {
    // Re-read the full prior row INSIDE the transaction so concurrent PUTs
    // can't both snapshot the same prior state.
    const prev = db.prepare('SELECT id, password, file_name, file_data FROM credentials WHERE id = ? AND project_id = ?').get(idNum, projectId) as CredentialRow | undefined;
    if (!prev) throw new Error('NOT_FOUND');

    const effectiveFileBuffer = nextFileBuffer === 'KEEP' ? (prev.file_data ?? null) : nextFileBuffer;
    const effectiveFileName = nextFileName === 'KEEP' ? (prev.file_name ?? null) : nextFileName;

    snapshotIfChanged(prev, projectId, {
      password: validPass ?? null,
      file_name: effectiveFileName,
      file_data: effectiveFileBuffer,
    });

    if (nextFileBuffer === 'KEEP') {
      db.prepare(
        `UPDATE credentials SET device_id=?, host=?, username=?, password=?, type=?, source=?, used=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        device_id ?? null, validHost, validUser, validPass,
        validType, validSource,
        validUsed, idNum
      );
    } else {
      db.prepare(
        `UPDATE credentials SET device_id=?, host=?, username=?, password=?, type=?, source=?, file_name=?, file_data=?, used=?, updated_at=datetime('now') WHERE id=?`
      ).run(
        device_id ?? null, validHost, validUser, validPass,
        validType, validSource,
        nextFileName === 'KEEP' ? (prev.file_name ?? null) : nextFileName,
        nextFileBuffer,
        validUsed, idNum
      );
    }
  });

  try {
    applyUpdate();
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Credential not found' });
      return;
    }
    throw err;
  }

  const credential = db.prepare(`${listSelect} WHERE c.id = ?`).get(idNum);
  logActivity({ projectId, action: 'updated', resourceType: 'credential', resourceId: idNum, resourceName: username.trim() });
  publishSafe(projectId, 'credential', 'updated', idNum);
  res.json(credential);
});

router.patch('/:id/hidden', (req, res) => {
  const projectId = res.locals.projectId;
  const { hidden } = req.body as { hidden: boolean };
  const existing = db.prepare('SELECT id FROM credentials WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) {
    res.status(404).json({ error: 'Credential not found' });
    return;
  }
  db.prepare('UPDATE credentials SET hidden = ?, updated_at = datetime(\'now\') WHERE id = ?').run(hidden ? 1 : 0, req.params.id);
  const credential = db.prepare(`${listSelect} WHERE c.id = ?`).get(req.params.id);
  res.json(credential);
});

// Snapshot + DELETE + activity log in one transaction. Throws 'NOT_FOUND'
// if the credential doesn't exist in this project. The snapshot also embeds
// the credential's password history rows so undo can replay them — without
// this, ON DELETE CASCADE would discard the history with no way to restore.
const deleteCredentialRow = db.transaction((credentialId: number, projectId: number) => {
  const existing = db.prepare('SELECT * FROM credentials WHERE id = ? AND project_id = ?').get(credentialId, projectId) as Record<string, unknown> | undefined;
  if (!existing) throw new Error('NOT_FOUND');

  // file_data Buffer doesn't survive JSON.stringify; base64 it for the snapshot.
  const fileBuf = existing.file_data as Buffer | null | undefined;
  const snapshot = { ...existing, file_data: fileBuf ? Buffer.from(fileBuf).toString('base64') : null };

  const historyRows = db.prepare(
    'SELECT id, password, file_name, file_data, status, note, created_at FROM credential_password_history WHERE credential_id = ? AND project_id = ? ORDER BY id ASC'
  ).all(credentialId, projectId) as Array<{ id: number; password: string | null; file_name: string | null; file_data: Buffer | null; status: string; note: string | null; created_at: string }>;
  const historySnapshot = historyRows.map(h => ({
    ...h,
    file_data: h.file_data ? Buffer.from(h.file_data).toString('base64') : null,
  }));

  db.prepare('DELETE FROM credentials WHERE id = ? AND project_id = ?').run(credentialId, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'credential',
    resourceId: credentialId, resourceName: existing.username as string,
    previousState: { credential: snapshot, history: historySnapshot },
    canUndo: true,
  });
  return existing;
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);

  const clientUpdatedAt = (req.body?.updated_at as string | undefined) ?? (req.query.updated_at as string | undefined);
  if (clientUpdatedAt) {
    const existing = db.prepare('SELECT updated_at FROM credentials WHERE id = ? AND project_id = ?').get(credentialId, projectId) as { updated_at: string } | undefined;
    if (existing && clientUpdatedAt !== existing.updated_at) {
      res.status(409).json({ error: 'This credential was modified by another session. Please refresh and try again.' });
      return;
    }
  }

  try {
    deleteCredentialRow(credentialId, projectId);
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      // Match prior behaviour: 204 on missing credential (idempotent delete).
      return res.status(204).send();
    }
    throw err;
  }
  publishSafe(projectId, 'credential', 'deleted', credentialId);
  res.status(204).send();
});

const CREDENTIAL_BULK_MAX_IDS = 500;

router.post('/bulk-delete', (req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    res.status(400).json({ error: 'ids must be a non-empty array' });
    return;
  }
  if (body.ids.length > CREDENTIAL_BULK_MAX_IDS) {
    res.status(400).json({ error: `Cannot delete more than ${CREDENTIAL_BULK_MAX_IDS} credentials at once` });
    return;
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    res.status(400).json({ error: 'ids must be positive integers' });
    return;
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      deleteCredentialRow(id, projectId);
      publishSafe(projectId, 'credential', 'deleted', id);
      deleted.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id, error: msg === 'NOT_FOUND' ? 'Not found' : msg });
    }
  }
  res.json({ deleted, failed });
});

// ---- Password history -----------------------------------------------------
// Per-credential append-only audit. Auto-populated by snapshotIfChanged on
// PUT (status='previous'); also accepts manual insertions via POST for
// 'invalid' (known-bad) entries the user wants to record.

const HISTORY_STATUSES: CredentialPasswordHistoryStatus[] = ['previous', 'invalid'];

// Lookup the credential and verify it belongs to this project. Centralizes
// the 404-cross-project guard for the four history endpoints below.
function loadCredentialOrNull(credentialId: number, projectId: number): { id: number } | null {
  return (db.prepare('SELECT id FROM credentials WHERE id = ? AND project_id = ?').get(credentialId, projectId) as { id: number } | undefined) ?? null;
}

router.get('/:id/history', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);
  if (!loadCredentialOrNull(credentialId, projectId)) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  const rows = db.prepare(
    `SELECT id, credential_id, password, file_name, status, note, created_at,
            (file_name IS NOT NULL AND file_data IS NOT NULL) AS has_file
     FROM credential_password_history
     WHERE credential_id = ? AND project_id = ?
     ORDER BY created_at DESC, id DESC`
  ).all(credentialId, projectId);
  res.json(rows);
});

router.get('/:id/history/:hid/file', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);
  const historyId = Number(req.params.hid);
  if (!loadCredentialOrNull(credentialId, projectId)) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  const row = db.prepare(
    'SELECT file_name, file_data FROM credential_password_history WHERE id = ? AND credential_id = ? AND project_id = ?'
  ).get(historyId, credentialId, projectId) as { file_name: string | null; file_data: Buffer | null } | undefined;
  if (!row || !row.file_data || !row.file_name) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(row.file_name)}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.send(row.file_data);
});

router.post('/:id/history', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);
  if (!loadCredentialOrNull(credentialId, projectId)) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  const body = req.body as { password?: string | null; file_name?: string | null; file_data?: string | null; status?: string; note?: string | null };
  const status = body.status as CredentialPasswordHistoryStatus | undefined;
  if (!status || !HISTORY_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${HISTORY_STATUSES.join(', ')}` });
  }
  const password = body.password ? optionalString(body.password, 500) : null;
  const noteRaw = body.note ?? null;
  const note = noteRaw == null ? null : optionalString(noteRaw, 1000);
  let fileBuffer: Buffer | null = null;
  if (body.file_data) {
    fileBuffer = Buffer.from(body.file_data, 'base64');
    if (fileBuffer.length > MAX_CREDENTIAL_FILE_SIZE) {
      return res.status(400).json({ error: 'File exceeds 5 MB limit' });
    }
  }
  const safeFileName = body.file_name ? sanitizeFilename(body.file_name) : null;
  if (!password && !safeFileName && !note) {
    return res.status(400).json({ error: 'At least one of password, file_name+file_data, or note is required' });
  }

  const result = db.prepare(
    `INSERT INTO credential_password_history (credential_id, project_id, password, file_name, file_data, status, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(credentialId, projectId, password, safeFileName, fileBuffer, status, note);

  const inserted = db.prepare(
    `SELECT id, credential_id, password, file_name, status, note, created_at,
            (file_name IS NOT NULL AND file_data IS NOT NULL) AS has_file
     FROM credential_password_history WHERE id = ?`
  ).get(result.lastInsertRowid);
  logActivity({
    projectId,
    action: 'created',
    resourceType: 'credential_password_history',
    resourceId: Number(result.lastInsertRowid),
    resourceName: `Credential #${credentialId} history (${status})`,
  });
  res.status(201).json(inserted);
});

router.patch('/:id/history/:hid', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);
  const historyId = Number(req.params.hid);
  if (!loadCredentialOrNull(credentialId, projectId)) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  const existing = db.prepare(
    'SELECT id FROM credential_password_history WHERE id = ? AND credential_id = ? AND project_id = ?'
  ).get(historyId, credentialId, projectId);
  if (!existing) return res.status(404).json({ error: 'History entry not found' });

  const body = req.body as { status?: string; note?: string | null };
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.status !== undefined) {
    if (!HISTORY_STATUSES.includes(body.status as CredentialPasswordHistoryStatus)) {
      return res.status(400).json({ error: `status must be one of: ${HISTORY_STATUSES.join(', ')}` });
    }
    sets.push('status = ?');
    params.push(body.status);
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    params.push(body.note == null ? null : optionalString(body.note, 1000));
  }
  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }
  params.push(historyId);
  db.prepare(`UPDATE credential_password_history SET ${sets.join(', ')} WHERE id = ?`).run(...params);

  const updated = db.prepare(
    `SELECT id, credential_id, password, file_name, status, note, created_at,
            (file_name IS NOT NULL AND file_data IS NOT NULL) AS has_file
     FROM credential_password_history WHERE id = ?`
  ).get(historyId);
  logActivity({
    projectId,
    action: 'updated',
    resourceType: 'credential_password_history',
    resourceId: historyId,
    resourceName: `Credential #${credentialId} history`,
  });
  res.json(updated);
});

router.delete('/:id/history/:hid', (req, res) => {
  const projectId = res.locals.projectId;
  const credentialId = Number(req.params.id);
  const historyId = Number(req.params.hid);
  if (!loadCredentialOrNull(credentialId, projectId)) {
    return res.status(404).json({ error: 'Credential not found' });
  }
  const result = db.prepare(
    'DELETE FROM credential_password_history WHERE id = ? AND credential_id = ? AND project_id = ?'
  ).run(historyId, credentialId, projectId);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'History entry not found' });
  }
  logActivity({
    projectId,
    action: 'deleted',
    resourceType: 'credential_password_history',
    resourceId: historyId,
    resourceName: `Credential #${credentialId} history`,
  });
  res.status(204).send();
});

export default router;
