import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { requireString, optionalString, optionalInt } from '../validation.js';
import { isValidCidr } from '../utils/cidr.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { pagedResponse } from '../utils/pagination.js';
import { buildListQuery } from '../utils/listQuery.js';
import { publishSafe } from '../events/bus.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;

  const { whereClause, whereParams, orderBy, pagination } = buildListQuery(req, {
    projectId,
    search: { columns: ['name', 'cidr', 'CAST(vlan_id AS TEXT)', 'description'] },
    filters: {
      vlan: {
        column: 'vlan_id',
        type: 'string',
        sentinels: { has: 'vlan_id IS NOT NULL', none: 'vlan_id IS NULL' },
      },
    },
    sort: {
      map: { name: 'name', cidr: 'cidr', vlan_id: 'vlan_id', description: 'description' },
      default: 'name',
    },
  });

  if (pagination) {
    const { page, limit, offset } = pagination;
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM subnets ${whereClause}`).get(...whereParams) as { total: number };
    const items = db.prepare(`SELECT * FROM subnets ${whereClause} ${orderBy} LIMIT ? OFFSET ?`).all(...whereParams, limit, offset);
    return res.json(pagedResponse(items, total, page, limit));
  }

  res.json(db.prepare(`SELECT * FROM subnets ${whereClause} ${orderBy}`).all(...whereParams));
});

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!subnet) return res.status(404).json({ error: 'Subnet not found' });

  const devices = db.prepare(
    `SELECT d.*,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip
     FROM devices d WHERE d.subnet_id = ?`
  ).all(req.params.id);

  res.json({ ...subnet, devices });
});

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const validName = requireString(req.body.name, 'name', 200);
  const validCidr = requireString(req.body.cidr, 'cidr', 50);
  if (!isValidCidr(validCidr)) {
    return res.status(400).json({ error: 'Invalid CIDR format (e.g. 192.168.1.0/24 or 2001:db8::/32)' });
  }
  const vlan_id = optionalInt(req.body.vlan_id, 1, 4094);
  const description = optionalString(req.body.description, 1000);
  try {
    const result = db.prepare(
      'INSERT INTO subnets (name, cidr, vlan_id, description, project_id) VALUES (?, ?, ?, ?, ?)'
    ).run(validName, validCidr, vlan_id, description, projectId);

    const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(result.lastInsertRowid);
    logActivity({ projectId, action: 'created', resourceType: 'subnet', resourceId: result.lastInsertRowid as number, resourceName: validName });
    publishSafe(projectId, 'subnet', 'created', result.lastInsertRowid as number);
    res.status(201).json(subnet);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE constraint failed: subnets.project_id, subnets.cidr') || msg.includes('idx_subnets_project_cidr_unique')) {
      return res.status(400).json({ error: `A subnet with CIDR ${validCidr} already exists in this project` });
    }
    throw err;
  }
}));

router.put('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const validName = requireString(req.body.name, 'name', 200);
  const validCidr = requireString(req.body.cidr, 'cidr', 50);
  if (!isValidCidr(validCidr)) {
    return res.status(400).json({ error: 'Invalid CIDR format (e.g. 192.168.1.0/24 or 2001:db8::/32)' });
  }

  // Optimistic locking: reject if the record was modified since the client last fetched it
  if (req.body.updated_at) {
    const existing = db.prepare('SELECT updated_at FROM subnets WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { updated_at: string } | undefined;
    if (existing && existing.updated_at !== req.body.updated_at) {
      return res.status(409).json({ error: 'This subnet was modified by another session. Please refresh and try again.' });
    }
  }

  const vlan_id = optionalInt(req.body.vlan_id, 1, 4094);
  const description = optionalString(req.body.description, 1000);
  try {
    const result = db.prepare(
      `UPDATE subnets SET name = ?, cidr = ?, vlan_id = ?, description = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`
    ).run(validName, validCidr, vlan_id, description, req.params.id, projectId);

    if (result.changes === 0) return res.status(404).json({ error: 'Subnet not found' });

    const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(req.params.id);
    logActivity({ projectId, action: 'updated', resourceType: 'subnet', resourceId: Number(req.params.id), resourceName: validName });
    publishSafe(projectId, 'subnet', 'updated', Number(req.params.id));
    res.json(subnet);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE constraint failed: subnets.project_id, subnets.cidr') || msg.includes('idx_subnets_project_cidr_unique')) {
      return res.status(400).json({ error: `A subnet with CIDR ${validCidr} already exists in this project` });
    }
    throw err;
  }
}));

// Snapshot cascade state, write activity log, DELETE — all in one transaction.
// Throws 'NOT_FOUND' if the subnet doesn't exist in this project.
const deleteSubnetRow = db.transaction((subnetId: number, projectId: number) => {
  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ? AND project_id = ?').get(subnetId, projectId) as Record<string, unknown> | undefined;
  if (!subnet) throw new Error('NOT_FOUND');

  const deviceSubnetIds = (db.prepare('SELECT id FROM devices WHERE subnet_id = ?').all(subnetId) as { id: number }[]).map(r => r.id);
  const subnetDiagramPositions = db.prepare(
    'SELECT view_id, x, y, width, height FROM subnet_diagram_positions WHERE subnet_id = ?'
  ).all(subnetId);
  const deviceSubnets = db.prepare(
    'SELECT device_id, subnet_id FROM device_subnets WHERE subnet_id = ?'
  ).all(subnetId);
  const connections = db.prepare(
    'SELECT * FROM connections WHERE source_subnet_id = ? OR target_subnet_id = ?'
  ).all(subnetId, subnetId);

  db.prepare('DELETE FROM subnets WHERE id = ? AND project_id = ?').run(subnetId, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'subnet',
    resourceId: subnetId, resourceName: subnet.name as string,
    previousState: {
      subnet,
      device_subnet_ids: deviceSubnetIds,
      subnet_diagram_positions: subnetDiagramPositions,
      device_subnets: deviceSubnets,
      connections,
    },
    canUndo: true,
  });
  return subnet;
});

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const subnetId = Number(req.params.id);

  const clientUpdatedAt = (req.body?.updated_at as string | undefined) ?? (req.query.updated_at as string | undefined);
  if (clientUpdatedAt) {
    const existing = db.prepare('SELECT updated_at FROM subnets WHERE id = ? AND project_id = ?').get(subnetId, projectId) as { updated_at: string } | undefined;
    if (existing && clientUpdatedAt !== existing.updated_at) {
      return res.status(409).json({ error: 'This subnet was modified by another session. Please refresh and try again.' });
    }
  }

  try {
    deleteSubnetRow(subnetId, projectId);
  } catch (err) {
    // Idempotent: a missing row means another tab already deleted it.
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.status(204).send();
    }
    throw err;
  }
  publishSafe(projectId, 'subnet', 'deleted', subnetId);
  res.status(204).send();
}));

const SUBNET_BULK_MAX_IDS = 500;

router.post('/bulk-delete', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > SUBNET_BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot delete more than ${SUBNET_BULK_MAX_IDS} subnets at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      deleteSubnetRow(id, projectId);
      publishSafe(projectId, 'subnet', 'deleted', id);
      deleted.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id, error: msg === 'NOT_FOUND' ? 'Not found' : msg });
    }
  }
  res.json({ deleted, failed });
}));

export default router;
