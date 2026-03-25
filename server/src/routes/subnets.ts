import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, optionalString, optionalInt } from '../validation.js';
import type { CreateSubnetRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const subnets = db.prepare('SELECT * FROM subnets WHERE project_id = ? ORDER BY name').all(projectId);
  res.json(subnets);
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
