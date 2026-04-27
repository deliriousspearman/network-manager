import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { sanitizeFilename } from '../validation.js';
import { writeBlob, absolutePath, deleteBlob } from '../storage/blobStore.js';
import { ICON_MAX_BYTES as MAX_ICON_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const BUILTIN_KEYS = ['wazuh', 'zabbix', 'elk', 'prometheus', 'grafana', 'nagios', 'datadog', 'splunk', 'ossec', 'custom'];

type AgentTypeRow = {
  id: number;
  project_id: number;
  key: string;
  label: string;
  icon_source: 'builtin' | 'upload';
  icon_builtin_key: string | null;
  filename: string | null;
  mime_type: string | null;
  file_path: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'type';
}

function rowOut(r: AgentTypeRow) {
  return {
    id: r.id,
    project_id: r.project_id,
    key: r.key,
    label: r.label,
    icon_source: r.icon_source,
    icon_builtin_key: r.icon_builtin_key,
    filename: r.filename,
    mime_type: r.mime_type,
    has_upload: r.icon_source === 'upload' && !!r.file_path,
    sort_order: r.sort_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    'SELECT * FROM agent_types WHERE project_id = ? ORDER BY sort_order, label'
  ).all(projectId) as AgentTypeRow[];
  res.json(rows.map(rowOut));
});

router.get('/:id/image', (req, res) => {
  const projectId = res.locals.projectId;
  const row = db.prepare(
    'SELECT mime_type, file_path, icon_source FROM agent_types WHERE id = ? AND project_id = ?'
  ).get(req.params.id, projectId) as { mime_type: string | null; file_path: string | null; icon_source: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Agent type not found' });
  if (row.icon_source !== 'upload' || !row.file_path) {
    return res.status(404).json({ error: 'No uploaded icon for this agent type' });
  }
  res.setHeader('Content-Type', row.mime_type || 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  return res.sendFile(absolutePath(row.file_path));
});

interface BodyShape {
  label?: unknown;
  key?: unknown;
  icon_source?: unknown;
  icon_builtin_key?: unknown;
  filename?: unknown;
  mime_type?: unknown;
  data?: unknown;
  sort_order?: unknown;
}

function validateIconFields(body: BodyShape): { ok: true; payload: { icon_source: 'builtin' | 'upload'; icon_builtin_key: string | null; filename: string | null; mime_type: string | null; buffer: Buffer | null } } | { ok: false; status: number; error: string } {
  const source = body.icon_source;
  if (source !== 'builtin' && source !== 'upload') {
    return { ok: false, status: 400, error: "icon_source must be 'builtin' or 'upload'" };
  }
  if (source === 'builtin') {
    const key = typeof body.icon_builtin_key === 'string' ? body.icon_builtin_key : '';
    if (!BUILTIN_KEYS.includes(key)) {
      return { ok: false, status: 400, error: 'icon_builtin_key must be a known built-in icon key' };
    }
    return { ok: true, payload: { icon_source: 'builtin', icon_builtin_key: key, filename: null, mime_type: null, buffer: null } };
  }
  const filename = typeof body.filename === 'string' ? body.filename : '';
  const mime = typeof body.mime_type === 'string' ? body.mime_type : '';
  const data = typeof body.data === 'string' ? body.data : '';
  if (!filename || !mime || !data) {
    return { ok: false, status: 400, error: 'filename, mime_type and data are required for uploads' };
  }
  if (!ALLOWED_MIMES.includes(mime)) {
    return { ok: false, status: 400, error: `Invalid image type. Allowed: ${ALLOWED_MIMES.join(', ')}` };
  }
  const buffer = Buffer.from(data, 'base64');
  if (buffer.length > MAX_ICON_SIZE) {
    return { ok: false, status: 400, error: 'Icon exceeds 512 KB limit' };
  }
  return { ok: true, payload: { icon_source: 'upload', icon_builtin_key: null, filename: sanitizeFilename(filename), mime_type: mime, buffer } };
}

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as BodyShape;
  const label = typeof body.label === 'string' ? body.label.trim() : '';
  if (!label || label.length > 100) {
    return res.status(400).json({ error: 'label is required (max 100 chars)' });
  }
  const rawKey = typeof body.key === 'string' && body.key.trim() ? body.key.trim() : label;
  const key = slugify(rawKey);
  if (!key) return res.status(400).json({ error: 'key could not be derived from label' });

  const iconResult = validateIconFields(body);
  if (!iconResult.ok) return res.status(iconResult.status).json({ error: iconResult.error });
  const { icon_source, icon_builtin_key, filename, mime_type, buffer } = iconResult.payload;

  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : 0;

  const existing = db.prepare('SELECT id FROM agent_types WHERE project_id = ? AND key = ?').get(projectId, key);
  if (existing) {
    return res.status(409).json({ error: `An agent type with key '${key}' already exists in this project` });
  }

  try {
    const result = db.prepare(
      `INSERT INTO agent_types (project_id, key, label, icon_source, icon_builtin_key, filename, mime_type, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(projectId, key, label, icon_source, icon_builtin_key, filename, mime_type, sortOrder);
    const id = Number(result.lastInsertRowid);

    if (icon_source === 'upload' && buffer) {
      const relPath = writeBlob(projectId, 'agent_types', id, mime_type, buffer);
      db.prepare('UPDATE agent_types SET file_path = ? WHERE id = ?').run(relPath, id);
    }

    const row = db.prepare('SELECT * FROM agent_types WHERE id = ?').get(id) as AgentTypeRow;
    logActivity({ projectId, action: 'created', resourceType: 'agent_type', resourceId: id, resourceName: label });
    res.status(201).json(rowOut(row));
  } catch (err: unknown) {
    if ((err as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: `An agent type with key '${key}' already exists in this project` });
    }
    throw err;
  }
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM agent_types WHERE id = ? AND project_id = ?').get(id, projectId) as AgentTypeRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Agent type not found' });

  const body = req.body as BodyShape;
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : existing.label;
  if (label.length > 100) return res.status(400).json({ error: 'label must be at most 100 chars' });
  const sortOrder = typeof body.sort_order === 'number' ? body.sort_order : existing.sort_order;

  // Icon update is optional — only re-validate if icon_source is supplied.
  let icon_source = existing.icon_source;
  let icon_builtin_key = existing.icon_builtin_key;
  let filename = existing.filename;
  let mime_type = existing.mime_type;
  let newBuffer: Buffer | null = null;
  let oldFilePath: string | null = null;

  if (body.icon_source !== undefined) {
    const r = validateIconFields(body);
    if (!r.ok) return res.status(r.status).json({ error: r.error });
    icon_source = r.payload.icon_source;
    icon_builtin_key = r.payload.icon_builtin_key;
    filename = r.payload.filename ?? existing.filename;
    mime_type = r.payload.mime_type ?? existing.mime_type;
    newBuffer = r.payload.buffer;
    if (existing.icon_source === 'upload' && existing.file_path) {
      oldFilePath = existing.file_path;
    }
  }

  db.prepare(
    `UPDATE agent_types
     SET label = ?, icon_source = ?, icon_builtin_key = ?, filename = ?, mime_type = ?, sort_order = ?, updated_at = datetime('now')
     ${body.icon_source !== undefined ? ', file_path = NULL' : ''}
     WHERE id = ? AND project_id = ?`
  ).run(label, icon_source, icon_builtin_key, filename, mime_type, sortOrder, id, projectId);

  if (icon_source === 'upload' && newBuffer) {
    const relPath = writeBlob(projectId, 'agent_types', id, mime_type, newBuffer);
    db.prepare('UPDATE agent_types SET file_path = ? WHERE id = ?').run(relPath, id);
  }
  if (oldFilePath) deleteBlob(oldFilePath);

  const row = db.prepare('SELECT * FROM agent_types WHERE id = ?').get(id) as AgentTypeRow;
  logActivity({ projectId, action: 'updated', resourceType: 'agent_type', resourceId: id, resourceName: label });
  res.json(rowOut(row));
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM agent_types WHERE id = ? AND project_id = ?').get(id, projectId) as AgentTypeRow | undefined;
  if (!existing) return res.status(404).json({ error: 'Agent type not found' });

  const { in_use_count } = db.prepare(
    'SELECT COUNT(*) AS in_use_count FROM agents WHERE project_id = ? AND agent_type = ?'
  ).get(projectId, existing.key) as { in_use_count: number };
  if (in_use_count > 0) {
    return res.status(409).json({
      error: `${in_use_count} agent${in_use_count === 1 ? '' : 's'} use this type. Change or delete them first.`,
      in_use_count,
    });
  }

  db.prepare('DELETE FROM agent_types WHERE id = ? AND project_id = ?').run(id, projectId);
  if (existing.icon_source === 'upload') deleteBlob(existing.file_path);
  logActivity({ projectId, action: 'deleted', resourceType: 'agent_type', resourceId: id, resourceName: existing.label });
  res.status(204).end();
});

export default router;
