import { Router } from 'express';
import db from '../db/connection.js';
import { optionalString } from '../validation.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const ports = db.prepare(
    'SELECT id, port_number, state, service, created_at FROM device_ports WHERE device_id = ? AND project_id = ? ORDER BY port_number'
  ).all(deviceId, projectId);
  res.json(ports);
});

router.post('/', (req, res) => {
  const { deviceId } = req.params as { deviceId: string };
  const projectId = res.locals.projectId;
  const { port_number, state = 'OPEN', service } = req.body as { port_number: number; state?: string; service?: string };

  const portNum = Number(port_number);
  if (!port_number || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'port_number must be an integer between 1 and 65535' });
  }

  const result = db.prepare(
    'INSERT INTO device_ports (device_id, project_id, port_number, state, service) VALUES (?, ?, ?, ?, ?)'
  ).run(deviceId, projectId, portNum, optionalString(state, 50) ?? 'OPEN', optionalString(service, 200));

  const created = db.prepare(
    'SELECT id, port_number, state, service, created_at FROM device_ports WHERE id = ?'
  ).get(result.lastInsertRowid);

  res.status(201).json(created);
});

router.patch('/:portId', (req, res) => {
  const { deviceId, portId } = req.params as { deviceId: string; portId: string };
  const projectId = res.locals.projectId;
  const { port_number, state, service } = req.body as { port_number?: number; state?: string; service?: string };

  const existing = db.prepare(
    'SELECT id FROM device_ports WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(portId, deviceId, projectId);

  if (!existing) return res.status(404).json({ error: 'Port not found' });

  const portNum = Number(port_number);
  if (!port_number || !Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return res.status(400).json({ error: 'port_number must be an integer between 1 and 65535' });
  }
  if (!state) return res.status(400).json({ error: 'state is required' });

  db.prepare(
    'UPDATE device_ports SET port_number = ?, state = ?, service = ? WHERE id = ?'
  ).run(portNum, optionalString(state, 50) ?? 'OPEN', optionalString(service, 200), portId);

  const updated = db.prepare(
    'SELECT id, port_number, state, service, created_at FROM device_ports WHERE id = ?'
  ).get(portId);

  res.json(updated);
});

router.delete('/:portId', (req, res) => {
  const { deviceId, portId } = req.params as { deviceId: string; portId: string };
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    'SELECT id FROM device_ports WHERE id = ? AND device_id = ? AND project_id = ?'
  ).get(portId, deviceId, projectId);

  if (!existing) return res.status(404).json({ error: 'Port not found' });

  db.prepare('DELETE FROM device_ports WHERE id = ?').run(portId);
  res.status(204).send();
});

export default router;
