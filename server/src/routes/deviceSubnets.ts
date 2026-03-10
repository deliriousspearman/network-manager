import { Router } from 'express';
import db from '../db/connection.js';

const router = Router({ mergeParams: true });

router.post('/', (req, res) => {
  const { device_id, subnet_id } = req.body as { device_id: number; subnet_id: number };
  if (!device_id || !subnet_id) {
    res.status(400).json({ error: 'device_id and subnet_id are required' });
    return;
  }
  try {
    db.prepare(
      'INSERT INTO device_subnets (device_id, subnet_id) VALUES (?, ?)'
    ).run(device_id, subnet_id);
    res.status(201).json({ device_id, subnet_id });
  } catch (err: any) {
    if (err?.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err?.message?.includes('UNIQUE') || err?.message?.includes('PRIMARY KEY')) {
      res.status(409).json({ error: 'Membership already exists' });
    } else {
      throw err;
    }
  }
});

router.delete('/:deviceId/:subnetId', (req, res) => {
  db.prepare(
    'DELETE FROM device_subnets WHERE device_id = ? AND subnet_id = ?'
  ).run(req.params.deviceId, req.params.subnetId);
  res.status(204).send();
});

export default router;
