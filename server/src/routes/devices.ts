import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, requireOneOf, optionalString, optionalOneOf, validateMac } from '../validation.js';
import { sanitizeRichText } from '../sanitizeHtml.js';
import type { CreateDeviceRequest } from 'shared/types.js';

const DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone'];
const HOSTING_TYPES = ['baremetal', 'vm', 'hypervisor'];
const STATUS_VALUES = ['up', 'down', 'warning', 'unknown'];

const router = Router({ mergeParams: true });

const DEVICE_SORT_MAP: Record<string, string> = {
  name: 'd.name', type: 'd.type', hosting_type: 'd.hosting_type',
  os: 'd.os', subnet_name: 's.name', status: 'd.status', primary_ip: 'primary_ip',
};

// Turn a user-typed string into an FTS5 MATCH expression. We split on
// whitespace, strip anything that isn't an FTS-safe token character, add
// a prefix wildcard to each term, and AND them together. Returns null if
// nothing usable is left — callers fall back to no search in that case.
function buildFtsMatchQuery(raw: string): string | null {
  if (!raw) return null;
  const terms = raw
    .split(/\s+/)
    .map(t => t.replace(/[^\p{L}\p{N}._:-]/gu, ''))
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`);
  return terms.length > 0 ? terms.join(' AND ') : null;
}

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;

  const selectCols = `d.*,
    s.name as subnet_name,
    h.name as hypervisor_name,
    (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
    (SELECT GROUP_CONCAT(tag) FROM device_tags WHERE device_id = d.id) as tags_csv,
    (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) as credential_count,
    (SELECT COUNT(*) FROM credentials WHERE device_id = d.id AND used = 1) > 0 as any_credential_used`;

  const search = ((req.query.search as string) || '').trim();
  const ftsQuery = buildFtsMatchQuery(search);

  const fromClause = ftsQuery
    ? `FROM devices d
       JOIN devices_fts ON devices_fts.rowid = d.id
       LEFT JOIN subnets s ON d.subnet_id = s.id
       LEFT JOIN devices h ON d.hypervisor_id = h.id
       WHERE d.project_id = ? AND devices_fts MATCH ?`
    : `FROM devices d
       LEFT JOIN subnets s ON d.subnet_id = s.id
       LEFT JOIN devices h ON d.hypervisor_id = h.id
       WHERE d.project_id = ?`;
  const searchParams: any[] = ftsQuery ? [ftsQuery] : [];

  const sortCol = DEVICE_SORT_MAP[req.query.sort as string] || 'd.name';
  const sortDir = req.query.order === 'desc' ? 'DESC' : 'ASC';

  // Paginated mode: return { items, total, page, limit, totalPages }
  if (req.query.page !== undefined) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const baseParams = [projectId, ...searchParams];
    const { total } = db.prepare(`SELECT COUNT(*) as total ${fromClause}`).get(...baseParams) as { total: number };
    const rows = db.prepare(`SELECT ${selectCols} ${fromClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...baseParams, limit, offset) as any[];
    return res.json({
      items: rows.map(d => ({ ...d, tags: d.tags_csv ? d.tags_csv.split(',') : [], tags_csv: undefined })),
      total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }

  // Unpaginated mode (legacy — used by diagram "add device" dropdown etc.)
  const rows = db.prepare(`SELECT ${selectCols} ${fromClause} ORDER BY ${sortCol} ${sortDir}`).all(projectId, ...searchParams) as any[];
  res.json(rows.map(d => ({ ...d, tags: d.tags_csv ? d.tags_csv.split(',') : [], tags_csv: undefined })));
});

router.get('/hypervisors', (_req, res) => {
  const projectId = res.locals.projectId;
  const hypervisors = db.prepare(
    `SELECT id, name FROM devices WHERE hosting_type = 'hypervisor' AND project_id = ? ORDER BY name`
  ).all(projectId);
  res.json(hypervisors);
});

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const device = db.prepare(
    `SELECT d.*,
      s.name as subnet_name,
      h.name as hypervisor_name
     FROM devices d
     LEFT JOIN subnets s ON d.subnet_id = s.id
     LEFT JOIN devices h ON d.hypervisor_id = h.id
     WHERE d.id = ? AND d.project_id = ?`
  ).get(req.params.id, projectId);

  if (!device) return res.status(404).json({ error: 'Device not found' });

  const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(req.params.id);
  const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(req.params.id) as { tag: string }[]).map(r => r.tag);
  const vms = db.prepare(
    `SELECT d.id, d.name, d.type, d.os,
       (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) AS primary_ip
     FROM devices d
     WHERE d.hypervisor_id = ?
     ORDER BY d.name`
  ).all(req.params.id);
  res.json({ ...device, ips, tags, vms });
});

const insertDevice = db.prepare(
  'INSERT INTO devices (name, type, mac_address, os, hostname, domain, location, notes, subnet_id, hosting_type, hypervisor_id, project_id, section_config, rich_notes, av, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertIp = db.prepare(
  'INSERT INTO device_ips (device_id, ip_address, label, is_primary, dhcp) VALUES (?, ?, ?, ?, ?)'
);
const insertTag = db.prepare(
  'INSERT INTO device_tags (device_id, tag) VALUES (?, ?)'
);

const createDevice = db.transaction((body: CreateDeviceRequest, projectId: number) => {
  const result = insertDevice.run(
    body.name, body.type,
    body.mac_address ?? null, body.os ?? null,
    body.hostname ?? null, body.domain ?? null,
    body.location ?? null, body.notes ?? null,
    body.subnet_id ?? null,
    body.hosting_type ?? null, body.hypervisor_id ?? null,
    projectId,
    body.section_config ?? null, body.rich_notes ?? null, body.av ?? null, body.status ?? null
  );
  const deviceId = result.lastInsertRowid as number;

  if (body.ips && body.ips.length > 0) {
    for (const ip of body.ips) {
      insertIp.run(deviceId, ip.ip_address, ip.label ?? null, ip.is_primary ? 1 : 0, ip.dhcp ? 1 : 0);
    }
  }

  if (body.tags && body.tags.length > 0) {
    for (const tag of body.tags) {
      insertTag.run(deviceId, tag);
    }
  }

  return deviceId;
});

function validateDeviceBody(body: any) {
  requireString(body.name, 'name', 200);
  requireOneOf(body.type, 'type', DEVICE_TYPES);
  if (body.mac_address) body.mac_address = validateMac(body.mac_address);
  if (body.os !== undefined) body.os = optionalString(body.os, 200);
  if (body.hostname !== undefined) body.hostname = optionalString(body.hostname, 253);
  if (body.domain !== undefined) body.domain = optionalString(body.domain, 253);
  if (body.location !== undefined) body.location = optionalString(body.location, 200);
  if (body.notes !== undefined) body.notes = optionalString(body.notes, 5000);
  if (body.hosting_type !== undefined) body.hosting_type = optionalOneOf(body.hosting_type, HOSTING_TYPES);
  if (body.status !== undefined) body.status = optionalOneOf(body.status, STATUS_VALUES);
  // rich_notes is user-authored HTML. Sanitize server-side — the client runs DOMPurify
  // but API callers can bypass that, so we must scrub before storing.
  if (body.rich_notes != null) {
    if (typeof body.rich_notes !== 'string') {
      throw new ValidationError('rich_notes must be a string');
    }
    if (body.rich_notes.length > 200_000) {
      throw new ValidationError('rich_notes must be at most 200000 characters');
    }
    body.rich_notes = sanitizeRichText(body.rich_notes);
  }
}

router.post('/', (req, res) => {
  try {
    validateDeviceBody(req.body);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
  const projectId = res.locals.projectId;
  try {
    const deviceId = createDevice(req.body as CreateDeviceRequest, projectId);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Record<string, unknown>;
    const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(deviceId);
    const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as { tag: string }[]).map(r => r.tag);
    logActivity({ projectId, action: 'created', resourceType: 'device', resourceId: deviceId, resourceName: (req.body as CreateDeviceRequest).name });
    res.status(201).json({ ...device, ips, tags });
  } catch (err: any) {
    if (err.message?.includes('cannot be its own hypervisor')) return res.status(400).json({ error: err.message });
    console.error('Device creation failed:', err);
    res.status(500).json({ error: 'Failed to create device' });
  }
});

// Walk the hypervisor chain up from `startId` and return 1 if `targetId` appears
// anywhere in the ancestor chain. Used to reject updates that would create a cycle.
const hypervisorChainContains = db.prepare(`
  WITH RECURSIVE chain(id, hypervisor_id) AS (
    SELECT id, hypervisor_id FROM devices WHERE id = ?
    UNION ALL
    SELECT d.id, d.hypervisor_id FROM devices d
    JOIN chain c ON d.id = c.hypervisor_id
  )
  SELECT 1 AS hit FROM chain WHERE id = ? LIMIT 1
`);

const updateDevice = db.transaction((id: string, body: CreateDeviceRequest) => {
  db.prepare(
    `UPDATE devices SET name = ?, type = ?, mac_address = ?, os = ?, hostname = ?, domain = ?, location = ?, notes = ?, subnet_id = ?, hosting_type = ?, hypervisor_id = ?, section_config = ?, rich_notes = ?, av = ?, status = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(body.name, body.type, body.mac_address ?? null, body.os ?? null, body.hostname ?? null, body.domain ?? null, body.location ?? null, body.notes ?? null, body.subnet_id ?? null, body.hosting_type ?? null, body.hypervisor_id ?? null, body.section_config ?? null, body.rich_notes ?? null, body.av ?? null, body.status ?? null, id);

  db.prepare('DELETE FROM device_ips WHERE device_id = ?').run(id);
  if (body.ips && body.ips.length > 0) {
    for (const ip of body.ips) {
      insertIp.run(Number(id), ip.ip_address, ip.label ?? null, ip.is_primary ? 1 : 0, ip.dhcp ? 1 : 0);
    }
  }

  db.prepare('DELETE FROM device_tags WHERE device_id = ?').run(id);
  if (body.tags && body.tags.length > 0) {
    for (const tag of body.tags) {
      insertTag.run(Number(id), tag);
    }
  }
});

router.put('/:id', (req, res) => {
  try {
    validateDeviceBody(req.body);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id, updated_at FROM devices WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { id: number; updated_at: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Device not found' });

  // Optimistic locking: reject if the record was modified since the client last fetched it
  if (req.body.updated_at && existing.updated_at !== req.body.updated_at) {
    return res.status(409).json({ error: 'This device was modified by another session. Please refresh and try again.' });
  }

  // Hypervisor cycle check: if A is being set under B, B must not already be a
  // descendant of A (otherwise A would end up as its own ancestor).
  if (req.body.hypervisor_id != null) {
    const proposedHv = Number(req.body.hypervisor_id);
    const selfId = Number(req.params.id);
    if (proposedHv === selfId) {
      return res.status(400).json({ error: 'A device cannot be its own hypervisor' });
    }
    const hit = hypervisorChainContains.get(proposedHv, selfId) as { hit: number } | undefined;
    if (hit) {
      return res.status(400).json({ error: 'Hypervisor assignment would create a cycle' });
    }
  }

  try {
    updateDevice(req.params.id, req.body as CreateDeviceRequest);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(req.params.id);
    const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(req.params.id) as { tag: string }[]).map(r => r.tag);
    logActivity({ projectId, action: 'updated', resourceType: 'device', resourceId: Number(req.params.id), resourceName: (req.body as CreateDeviceRequest).name });
    res.json({ ...device, ips, tags });
  } catch (err: any) {
    if (err.message?.includes('cannot be its own hypervisor')) return res.status(400).json({ error: err.message });
    console.error('Device update failed:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT name FROM devices WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { name: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Device not found' });
  db.prepare('DELETE FROM devices WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'device', resourceId: Number(req.params.id), resourceName: existing.name });
  res.status(204).send();
});

export default router;
