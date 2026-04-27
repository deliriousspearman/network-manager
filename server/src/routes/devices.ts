import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, requireOneOf, optionalString, optionalOneOf, validateMac, validateIpAddress } from '../validation.js';
import { sanitizeRichText } from '../sanitizeHtml.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { parsePagination, pagedResponse } from '../utils/pagination.js';
import { publishSafe } from '../events/bus.js';
import type { CreateDeviceRequest } from 'shared/types.js';
import { UNPAGINATED_DEVICES_CAP } from '../config/limits.js';

const DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone'];
const HOSTING_TYPES = ['baremetal', 'vm', 'hypervisor'];
const STATUS_VALUES = ['up', 'down', 'warning', 'unknown'];

const router = Router({ mergeParams: true });

const DEVICE_SORT_MAP: Record<string, string> = {
  name: 'd.name', type: 'd.type', hosting_type: 'd.hosting_type',
  os: 'd.os', subnet_name: 's.name', status: 'd.status', primary_ip: 'primary_ip',
};

// Shape returned from the device list query. selectCols is dynamic so fields
// are optional; the list route flattens tags_csv into a tags array.
interface DeviceListRow {
  id: number;
  name: string;
  type?: string;
  hosting_type?: string | null;
  os?: string | null;
  subnet_name?: string | null;
  status?: string | null;
  primary_ip?: string | null;
  tags_csv?: string | null;
  [key: string]: unknown;
}

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

  // Aggregated sub-joins (tags + credential stats) replace per-row correlated
  // subqueries. They materialize once per query instead of once per device row.
  const listSelectCols = `d.*,
    s.name as subnet_name,
    h.name as hypervisor_name,
    pip.ip_address as primary_ip,
    t.tags_csv,
    COALESCE(c.credential_count, 0) as credential_count,
    COALESCE(c.any_used, 0) as any_credential_used`;

  const listJoins = `LEFT JOIN subnets s ON d.subnet_id = s.id
    LEFT JOIN devices h ON d.hypervisor_id = h.id
    LEFT JOIN device_ips pip ON pip.device_id = d.id AND pip.is_primary = 1
    LEFT JOIN (
      SELECT device_id, GROUP_CONCAT(tag) AS tags_csv
      FROM device_tags GROUP BY device_id
    ) t ON t.device_id = d.id
    LEFT JOIN (
      SELECT device_id,
             COUNT(*) AS credential_count,
             CASE WHEN SUM(used) > 0 THEN 1 ELSE 0 END AS any_used
      FROM credentials GROUP BY device_id
    ) c ON c.device_id = d.id`;

  // The COUNT query doesn't need the aggregation joins, so keep it lean — it still
  // needs subnets/hypervisor JOINs because sort/filter can reference them.
  const countJoins = `LEFT JOIN subnets s ON d.subnet_id = s.id
    LEFT JOIN devices h ON d.hypervisor_id = h.id`;

  const search = ((req.query.search as string) || '').trim();
  const ftsQuery = buildFtsMatchQuery(search);

  const filterClauses: string[] = [];
  const filterParams: unknown[] = [];
  const typeFilter = req.query.type as string | undefined;
  if (typeFilter && DEVICE_TYPES.includes(typeFilter)) {
    filterClauses.push('d.type = ?');
    filterParams.push(typeFilter);
  }
  const hostingFilter = req.query.hosting_type as string | undefined;
  if (hostingFilter && HOSTING_TYPES.includes(hostingFilter)) {
    filterClauses.push('d.hosting_type = ?');
    filterParams.push(hostingFilter);
  }
  const statusFilter = req.query.status as string | undefined;
  if (statusFilter && STATUS_VALUES.includes(statusFilter)) {
    filterClauses.push('d.status = ?');
    filterParams.push(statusFilter);
  } else if (statusFilter === 'none') {
    filterClauses.push('(d.status IS NULL OR d.status = \'\')');
  }
  // ANY-of tag filter: device matches if it has at least one of the listed tags.
  const tagsParam = (req.query.tags as string | undefined)?.split(',').map(t => t.trim()).filter(Boolean) ?? [];
  if (tagsParam.length > 0) {
    const tagPlaceholders = tagsParam.map(() => '?').join(',');
    filterClauses.push(`d.id IN (SELECT device_id FROM device_tags WHERE tag IN (${tagPlaceholders}))`);
    filterParams.push(...tagsParam);
  }

  const ftsJoin = ftsQuery ? 'JOIN devices_fts ON devices_fts.rowid = d.id' : '';
  const whereClause = ftsQuery
    ? 'WHERE d.project_id = ? AND devices_fts MATCH ?'
    : 'WHERE d.project_id = ?';
  const filterClause = filterClauses.length > 0 ? ` AND ${filterClauses.join(' AND ')}` : '';

  const listFrom = `FROM devices d ${ftsJoin} ${listJoins} ${whereClause}${filterClause}`;
  const countFrom = `FROM devices d ${ftsJoin} ${countJoins} ${whereClause}${filterClause}`;
  const searchParams: unknown[] = ftsQuery ? [ftsQuery, ...filterParams] : [...filterParams];

  const sortCol = DEVICE_SORT_MAP[req.query.sort as string] || 'd.name';
  const sortDir = req.query.order === 'desc' ? 'DESC' : 'ASC';

  // Paginated mode: return { items, total, page, limit, totalPages }
  if (req.query.page !== undefined) {
    const { page, limit, offset } = parsePagination(req);
    const baseParams = [projectId, ...searchParams];
    const { total } = db.prepare(`SELECT COUNT(*) as total ${countFrom}`).get(...baseParams) as { total: number };
    const rows = db.prepare(`SELECT ${listSelectCols} ${listFrom} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...baseParams, limit, offset) as DeviceListRow[];
    const items = rows.map(d => ({ ...d, tags: d.tags_csv ? d.tags_csv.split(',') : [], tags_csv: undefined }));
    return res.json(pagedResponse(items, total, page, limit));
  }

  // Unpaginated mode (legacy — used by diagram "add device" dropdown etc.)
  // Capped to prevent runaway queries on very large projects; callers that need
  // more than UNPAGINATED_DEVICES_CAP rows must switch to paginated mode.
  const rows = db.prepare(`SELECT ${listSelectCols} ${listFrom} ORDER BY ${sortCol} ${sortDir} LIMIT ?`).all(projectId, ...searchParams, UNPAGINATED_DEVICES_CAP) as DeviceListRow[];
  res.json(rows.map(d => ({ ...d, tags: d.tags_csv ? d.tags_csv.split(',') : [], tags_csv: undefined })));
});

router.get('/hypervisors', (_req, res) => {
  const projectId = res.locals.projectId;
  const hypervisors = db.prepare(
    `SELECT id, name FROM devices WHERE hosting_type = 'hypervisor' AND project_id = ? ORDER BY name`
  ).all(projectId);
  res.json(hypervisors);
});

// Distinct tags across all devices in this project. Powers the tag filter
// popover. Defined before GET /:id so '/tags' doesn't get parsed as an id.
router.get('/tags', (_req, res) => {
  const projectId = res.locals.projectId;
  const rows = db.prepare(
    `SELECT DISTINCT t.tag FROM device_tags t
     INNER JOIN devices d ON d.id = t.device_id
     WHERE d.project_id = ? ORDER BY t.tag`
  ).all(projectId) as { tag: string }[];
  res.json(rows.map(r => r.tag));
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

type DeviceBody = Record<string, unknown> & {
  ips?: Array<Record<string, unknown> & { ip_address: string; label?: string | null; is_primary?: unknown; dhcp?: unknown }>;
  tags?: string[];
};

function validateDeviceBody(body: DeviceBody) {
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
  if (Array.isArray(body.ips)) {
    const seen = new Set<string>();
    for (const ip of body.ips) {
      ip.ip_address = validateIpAddress(ip.ip_address);
      if (seen.has(ip.ip_address)) {
        throw new ValidationError(`Duplicate IP address in request: ${ip.ip_address}`);
      }
      seen.add(ip.ip_address);
      if (ip.label !== undefined) ip.label = optionalString(ip.label, 100);
    }
  }
}

router.post('/', asyncHandler((req, res) => {
  validateDeviceBody(req.body);
  const projectId = res.locals.projectId;

  // Hypervisor cycle check: when creating, the new row has no id yet, so a cycle
  // can only form if the proposed hypervisor itself has a chain that wraps back
  // via devices already present. We only need to guard against selecting a
  // hypervisor that is invalid — self-reference is impossible here but ancestor
  // chain validity must still be ensured (the chain itself should not be broken).
  // For consistency with PUT, we verify the hypervisor_id exists and is in the
  // same project, and that its chain doesn't include a null loop.
  if (req.body.hypervisor_id != null) {
    const proposedHv = Number(req.body.hypervisor_id);
    const hvRow = db.prepare('SELECT id FROM devices WHERE id = ? AND project_id = ?').get(proposedHv, projectId);
    if (!hvRow) {
      return res.status(400).json({ error: 'Hypervisor not found in this project' });
    }
  }

  try {
    const deviceId = createDevice(req.body as CreateDeviceRequest, projectId);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Record<string, unknown>;
    const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(deviceId);
    const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as { tag: string }[]).map(r => r.tag);
    logActivity({ projectId, action: 'created', resourceType: 'device', resourceId: deviceId, resourceName: (req.body as CreateDeviceRequest).name });
    publishSafe(projectId, 'device', 'created', deviceId);
    res.status(201).json({ ...device, ips, tags });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('cannot be its own hypervisor')) return res.status(400).json({ error: msg });
    if (msg.includes('UNIQUE constraint failed: device_ips')) return res.status(400).json({ error: 'Duplicate IP address on this device' });
    console.error('Device creation failed:', err);
    res.status(500).json({ error: 'Failed to create device' });
  }
}));

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

router.put('/:id', asyncHandler((req, res) => {
  validateDeviceBody(req.body);
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
    updateDevice(String(req.params.id), req.body as CreateDeviceRequest);
    const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as Record<string, unknown>;
    const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(req.params.id);
    const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(req.params.id) as { tag: string }[]).map(r => r.tag);
    logActivity({ projectId, action: 'updated', resourceType: 'device', resourceId: Number(req.params.id), resourceName: (req.body as CreateDeviceRequest).name });
    publishSafe(projectId, 'device', 'updated', Number(req.params.id));
    res.json({ ...device, ips, tags });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('cannot be its own hypervisor')) return res.status(400).json({ error: msg });
    if (msg.includes('UNIQUE constraint failed: device_ips')) return res.status(400).json({ error: 'Duplicate IP address on this device' });
    console.error('Device update failed:', err);
    res.status(500).json({ error: 'Failed to update device' });
  }
}));

const BULK_MAX_IDS = 500;
const BULK_ALLOWED_FIELDS = ['status', 'subnet_id', 'hypervisor_id', 'hosting_type'] as const;

router.patch('/bulk', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as {
    ids?: unknown;
    updates?: Record<string, unknown>;
    addTags?: unknown;
    removeTags?: unknown;
  };

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot update more than ${BULK_MAX_IDS} devices at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const updates = (body.updates && typeof body.updates === 'object' && !Array.isArray(body.updates)) ? body.updates : {};
  const addTags = Array.isArray(body.addTags)
    ? Array.from(new Set(body.addTags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map(t => t.trim().slice(0, 50))))
    : [];
  const removeTags = Array.isArray(body.removeTags)
    ? Array.from(new Set(body.removeTags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map(t => t.trim().slice(0, 50))))
    : [];

  for (const key of Object.keys(updates)) {
    if (!(BULK_ALLOWED_FIELDS as readonly string[]).includes(key)) {
      return res.status(400).json({ error: `Field not allowed in bulk update: ${key}` });
    }
  }
  if (Object.keys(updates).length === 0 && addTags.length === 0 && removeTags.length === 0) {
    return res.status(400).json({ error: 'Request must include updates, addTags, or removeTags' });
  }
  if (updates.status !== undefined && updates.status !== null && !STATUS_VALUES.includes(updates.status as string)) {
    return res.status(400).json({ error: `status must be one of: ${STATUS_VALUES.join(', ')}` });
  }
  if (updates.hosting_type !== undefined && updates.hosting_type !== null && !HOSTING_TYPES.includes(updates.hosting_type as string)) {
    return res.status(400).json({ error: `hosting_type must be one of: ${HOSTING_TYPES.join(', ')}` });
  }

  const placeholders = ids.map(() => '?').join(',');
  const found = db.prepare(
    `SELECT id, name FROM devices WHERE project_id = ? AND id IN (${placeholders})`
  ).all(projectId, ...ids) as { id: number; name: string }[];
  if (found.length !== ids.length) {
    return res.status(404).json({ error: 'One or more devices not found in this project' });
  }

  if (updates.subnet_id != null) {
    const sid = Number(updates.subnet_id);
    if (!Number.isFinite(sid)) return res.status(400).json({ error: 'Invalid subnet_id' });
    const subnetRow = db.prepare('SELECT id FROM subnets WHERE id = ? AND project_id = ?').get(sid, projectId);
    if (!subnetRow) return res.status(400).json({ error: 'Subnet not found in this project' });
    updates.subnet_id = sid;
  }
  if (updates.hypervisor_id != null) {
    const hid = Number(updates.hypervisor_id);
    if (!Number.isFinite(hid)) return res.status(400).json({ error: 'Invalid hypervisor_id' });
    const hvRow = db.prepare('SELECT id FROM devices WHERE id = ? AND project_id = ?').get(hid, projectId);
    if (!hvRow) return res.status(400).json({ error: 'Hypervisor not found in this project' });
    updates.hypervisor_id = hid;
  }

  // Cycle check: any device whose proposed hypervisor would form a cycle is skipped.
  const skipped: number[] = [];
  let toUpdate = ids;
  if (updates.hypervisor_id != null) {
    const proposedHv = Number(updates.hypervisor_id);
    toUpdate = [];
    for (const id of ids) {
      if (id === proposedHv) { skipped.push(id); continue; }
      const hit = hypervisorChainContains.get(proposedHv, id) as { hit: number } | undefined;
      if (hit) skipped.push(id);
      else toUpdate.push(id);
    }
  }

  const hasTag = db.prepare('SELECT 1 FROM device_tags WHERE device_id = ? AND tag = ? LIMIT 1');
  const deleteTag = db.prepare('DELETE FROM device_tags WHERE device_id = ? AND tag = ?');

  const applyBulk = db.transaction((targetIds: number[]) => {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    if (updates.status !== undefined) { setClauses.push('status = ?'); values.push(updates.status ?? null); }
    if (updates.subnet_id !== undefined) { setClauses.push('subnet_id = ?'); values.push(updates.subnet_id ?? null); }
    if (updates.hypervisor_id !== undefined) { setClauses.push('hypervisor_id = ?'); values.push(updates.hypervisor_id ?? null); }
    if (updates.hosting_type !== undefined) { setClauses.push('hosting_type = ?'); values.push(updates.hosting_type ?? null); }

    if (setClauses.length > 0) {
      setClauses.push("updated_at = datetime('now')");
      const updateStmt = db.prepare(`UPDATE devices SET ${setClauses.join(', ')} WHERE id = ? AND project_id = ?`);
      for (const id of targetIds) updateStmt.run(...values, id, projectId);
    } else if (addTags.length > 0 || removeTags.length > 0) {
      const stampStmt = db.prepare("UPDATE devices SET updated_at = datetime('now') WHERE id = ? AND project_id = ?");
      for (const id of targetIds) stampStmt.run(id, projectId);
    }

    if (addTags.length > 0) {
      for (const id of targetIds) {
        for (const tag of addTags) {
          if (!hasTag.get(id, tag)) insertTag.run(id, tag);
        }
      }
    }
    if (removeTags.length > 0) {
      for (const id of targetIds) {
        for (const tag of removeTags) deleteTag.run(id, tag);
      }
    }
  });

  try {
    applyBulk(toUpdate);
  } catch (err: unknown) {
    console.error('Bulk device update failed:', err);
    return res.status(500).json({ error: 'Failed to bulk update devices' });
  }

  const nameById = new Map(found.map(d => [d.id, d.name]));
  for (const id of toUpdate) {
    logActivity({
      projectId, action: 'updated', resourceType: 'device',
      resourceId: id, resourceName: nameById.get(id) ?? String(id),
    });
    publishSafe(projectId, 'device', 'updated', id);
  }

  res.json({ updated: toUpdate.length, skipped });
}));

// Snapshot cascading state, write the activity log, and DELETE the device,
// all in a single transaction so a partial failure rolls back. Throws
// 'NOT_FOUND' as the message if the device doesn't exist in this project.
// Caller is responsible for the publishSafe event (not transactional).
const deleteDeviceRow = db.transaction((deviceId: number, projectId: number) => {
  const device = db.prepare('SELECT * FROM devices WHERE id = ? AND project_id = ?').get(deviceId, projectId) as Record<string, unknown> | undefined;
  if (!device) throw new Error('NOT_FOUND');

  const ips = db.prepare('SELECT ip_address, label, is_primary, dhcp FROM device_ips WHERE device_id = ?').all(deviceId);
  const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as { tag: string }[]).map(r => r.tag);
  const connections = db.prepare(
    'SELECT * FROM connections WHERE source_device_id = ? OR target_device_id = ?'
  ).all(deviceId, deviceId);
  const diagramPositions = db.prepare(
    'SELECT view_id, x, y FROM diagram_positions WHERE device_id = ?'
  ).all(deviceId);
  const iconOverride = db.prepare(
    'SELECT icon_source, library_id, library_icon_key, color, filename, mime_type, file_path FROM device_icon_overrides WHERE device_id = ? AND project_id = ?'
  ).get(deviceId, projectId);
  const deviceSubnets = db.prepare(
    'SELECT subnet_id FROM device_subnets WHERE device_id = ?'
  ).all(deviceId);
  const routerConfigs = db.prepare(
    'SELECT * FROM router_configs WHERE device_id = ?'
  ).all(deviceId);
  const commandOutputs = db.prepare(
    'SELECT id, command_type, raw_output, captured_at, project_id, title, parse_output, updated_at FROM command_outputs WHERE device_id = ?'
  ).all(deviceId);

  db.prepare('DELETE FROM devices WHERE id = ? AND project_id = ?').run(deviceId, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'device',
    resourceId: deviceId, resourceName: device.name as string,
    previousState: {
      device,
      ips,
      tags,
      connections,
      diagram_positions: diagramPositions,
      icon_override: iconOverride ?? null,
      device_subnets: deviceSubnets,
      router_configs: routerConfigs,
      command_outputs: commandOutputs,
    },
    canUndo: true,
  });
  return device;
});

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const deviceId = Number(req.params.id);

  // Optimistic locking (opt-in): clients that pass updated_at get 409 on stale delete.
  const clientUpdatedAt = (req.body?.updated_at as string | undefined) ?? (req.query.updated_at as string | undefined);
  if (clientUpdatedAt) {
    const existing = db.prepare('SELECT updated_at FROM devices WHERE id = ? AND project_id = ?').get(deviceId, projectId) as { updated_at: string } | undefined;
    if (existing && clientUpdatedAt !== existing.updated_at) {
      return res.status(409).json({ error: 'This device was modified by another session. Please refresh and try again.' });
    }
  }

  try {
    deleteDeviceRow(deviceId, projectId);
  } catch (err) {
    // Idempotent: if the row is already gone (e.g. another tab beat us to it),
    // treat as success so the user-visible outcome — "the device is gone" — matches.
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.status(204).send();
    }
    throw err;
  }
  publishSafe(projectId, 'device', 'deleted', deviceId);
  res.status(204).send();
}));

router.post('/bulk-delete', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot delete more than ${BULK_MAX_IDS} devices at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      deleteDeviceRow(id, projectId);
      publishSafe(projectId, 'device', 'deleted', id);
      deleted.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id, error: msg === 'NOT_FOUND' ? 'Not found' : msg });
    }
  }
  res.json({ deleted, failed });
}));

export default router;
