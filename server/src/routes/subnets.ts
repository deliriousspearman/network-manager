import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
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
  const { name, cidr, vlan_id, description } = req.body as CreateSubnetRequest;
  const result = db.prepare(
    'INSERT INTO subnets (name, cidr, vlan_id, description, project_id) VALUES (?, ?, ?, ?, ?)'
  ).run(name, cidr, vlan_id ?? null, description ?? null, projectId);

  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(result.lastInsertRowid);
  logActivity({ projectId, action: 'created', resourceType: 'subnet', resourceId: result.lastInsertRowid as number, resourceName: name });
  res.status(201).json(subnet);
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const { name, cidr, vlan_id, description } = req.body as CreateSubnetRequest;
  const result = db.prepare(
    `UPDATE subnets SET name = ?, cidr = ?, vlan_id = ?, description = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?`
  ).run(name, cidr, vlan_id ?? null, description ?? null, req.params.id, projectId);

  if (result.changes === 0) return res.status(404).json({ error: 'Subnet not found' });

  const subnet = db.prepare('SELECT * FROM subnets WHERE id = ?').get(req.params.id);
  logActivity({ projectId, action: 'updated', resourceType: 'subnet', resourceId: Number(req.params.id), resourceName: name });
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
