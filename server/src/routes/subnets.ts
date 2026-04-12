import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, optionalString, optionalInt } from '../validation.js';
import { isValidCidr } from '../utils/cidr.js';

const router = Router({ mergeParams: true });

const SUBNET_SORT_MAP: Record<string, string> = {
  name: 'name', cidr: 'cidr', vlan_id: 'vlan_id', description: 'description',
};

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;
  const search = ((req.query.search as string) || '').trim();
  let searchClause = '';
  const searchParams: any[] = [];
  if (search) {
    const like = `%${search}%`;
    searchClause = ` AND (name LIKE ? OR cidr LIKE ? OR CAST(vlan_id AS TEXT) LIKE ? OR description LIKE ?)`;
    searchParams.push(like, like, like, like);
  }
  const sortCol = SUBNET_SORT_MAP[req.query.sort as string] || 'name';
  const sortDir = req.query.order === 'desc' ? 'DESC' : 'ASC';
  const where = `WHERE project_id = ?${searchClause}`;

  if (req.query.page !== undefined) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const baseParams = [projectId, ...searchParams];
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM subnets ${where}`).get(...baseParams) as { total: number };
    const items = db.prepare(`SELECT * FROM subnets ${where} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...baseParams, limit, offset);
    return res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }

  res.json(db.prepare(`SELECT * FROM subnets ${where} ORDER BY ${sortCol} ${sortDir}`).all(projectId, ...searchParams));
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

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  let validName: string, validCidr: string;
  try {
    validName = requireString(req.body.name, 'name', 200);
    validCidr = requireString(req.body.cidr, 'cidr', 50);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
  if (!isValidCidr(validCidr)) {
    return res.status(400).json({ error: 'Invalid CIDR format (e.g. 192.168.1.0/24 or 2001:db8::/32)' });
  }
  const vlan_id = optionalInt(req.body.vlan_id, 0, 4094);
  const description = optionalString(req.body.description, 1000);
  const result = db.prepare(
    'INSERT INTO subnets (name, cidr, vlan_id, description, project_id) VALUES (?, ?, ?, ?, ?)'
  ).run(validName, validCidr, vlan_id, description, projectId);

  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(result.lastInsertRowid);
  logActivity({ projectId, action: 'created', resourceType: 'subnet', resourceId: result.lastInsertRowid as number, resourceName: validName });
  res.status(201).json(subnet);
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  let validName: string, validCidr: string;
  try {
    validName = requireString(req.body.name, 'name', 200);
    validCidr = requireString(req.body.cidr, 'cidr', 50);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
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

  const vlan_id = optionalInt(req.body.vlan_id, 0, 4094);
  const description = optionalString(req.body.description, 1000);
  const result = db.prepare(
    `UPDATE subnets SET name = ?, cidr = ?, vlan_id = ?, description = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`
  ).run(validName, validCidr, vlan_id, description, req.params.id, projectId);

  if (result.changes === 0) return res.status(404).json({ error: 'Subnet not found' });

  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(req.params.id);
  logActivity({ projectId, action: 'updated', resourceType: 'subnet', resourceId: Number(req.params.id), resourceName: validName });
  res.json(subnet);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT name FROM subnets WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { name: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Subnet not found' });
  db.prepare('DELETE FROM subnets WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'subnet', resourceId: Number(req.params.id), resourceName: existing.name });
  res.status(204).send();
});

export default router;
