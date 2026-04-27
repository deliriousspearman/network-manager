import { Router } from 'express';
import db from '../db/connection.js';
import { verifyDeviceOwnership, verifySubnetOwnership } from '../validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router({ mergeParams: true });

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { device_id, subnet_id } = req.body as { device_id: number; subnet_id: number };
  if (!device_id || !subnet_id) {
    res.status(400).json({ error: 'device_id and subnet_id are required' });
    return;
  }
  if (!verifyDeviceOwnership(device_id, projectId)) {
    return res.status(400).json({ error: 'Device not found in this project' });
  }
  if (!verifySubnetOwnership(subnet_id, projectId)) {
    return res.status(400).json({ error: 'Subnet not found in this project' });
  }
  try {
    db.prepare(
      'INSERT INTO device_subnets (device_id, subnet_id) VALUES (?, ?)'
    ).run(device_id, subnet_id);
    res.status(201).json({ device_id, subnet_id });
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : '';
    if (code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || msg.includes('UNIQUE') || msg.includes('PRIMARY KEY')) {
      res.status(409).json({ error: 'Membership already exists' });
    } else {
      throw err;
    }
  }
}));

router.delete('/:deviceId/:subnetId', asyncHandler((req, res) => {
  db.prepare(
    'DELETE FROM device_subnets WHERE device_id = ? AND subnet_id = ?'
  ).run(req.params.deviceId, req.params.subnetId);
  res.status(204).send();
}));

export default router;
