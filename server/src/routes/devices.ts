import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import type { CreateDeviceRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const devices = db.prepare(
    `SELECT d.*,
      s.name as subnet_name,
      h.name as hypervisor_name,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
      (SELECT GROUP_CONCAT(tag) FROM device_tags WHERE device_id = d.id) as tags_csv,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) as credential_count
     FROM devices d
     LEFT JOIN subnets s ON d.subnet_id = s.id
     LEFT JOIN devices h ON d.hypervisor_id = h.id
     WHERE d.project_id = ?
     ORDER BY d.name`
  ).all(projectId) as any[];
  res.json(devices.map(d => ({ ...d, tags: d.tags_csv ? d.tags_csv.split(',') : [], tags_csv: undefined })));
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
  'INSERT INTO devices (name, type, mac_address, os, location, notes, subnet_id, hosting_type, hypervisor_id, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);
const insertIp = db.prepare(
  'INSERT INTO device_ips (device_id, ip_address, label, is_primary) VALUES (?, ?, ?, ?)'
);
const insertTag = db.prepare(
  'INSERT INTO device_tags (device_id, tag) VALUES (?, ?)'
);

const createDevice = db.transaction((body: CreateDeviceRequest, projectId: number) => {
  const result = insertDevice.run(
    body.name, body.type,
    body.mac_address ?? null, body.os ?? null,
    body.location ?? null, body.notes ?? null,
    body.subnet_id ?? null,
    body.hosting_type ?? null, body.hypervisor_id ?? null,
    projectId
  );
  const deviceId = result.lastInsertRowid as number;

  if (body.ips && body.ips.length > 0) {
    for (const ip of body.ips) {
      insertIp.run(deviceId, ip.ip_address, ip.label ?? null, ip.is_primary ? 1 : 0);
    }
  }

  if (body.tags && body.tags.length > 0) {
    for (const tag of body.tags) {
      insertTag.run(deviceId, tag);
    }
  }

  return deviceId;
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const deviceId = createDevice(req.body as CreateDeviceRequest, projectId);
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(deviceId) as Record<string, unknown>;
  const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(deviceId);
  const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(deviceId) as { tag: string }[]).map(r => r.tag);
  logActivity({ projectId, action: 'created', resourceType: 'device', resourceId: deviceId, resourceName: (req.body as CreateDeviceRequest).name });
  res.status(201).json({ ...device, ips, tags });
});

const updateDevice = db.transaction((id: string, body: CreateDeviceRequest) => {
  db.prepare(
    `UPDATE devices SET name = ?, type = ?, mac_address = ?, os = ?, location = ?, notes = ?, subnet_id = ?, hosting_type = ?, hypervisor_id = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(body.name, body.type, body.mac_address ?? null, body.os ?? null, body.location ?? null, body.notes ?? null, body.subnet_id ?? null, body.hosting_type ?? null, body.hypervisor_id ?? null, id);

  db.prepare('DELETE FROM device_ips WHERE device_id = ?').run(id);
  if (body.ips && body.ips.length > 0) {
    for (const ip of body.ips) {
      insertIp.run(Number(id), ip.ip_address, ip.label ?? null, ip.is_primary ? 1 : 0);
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
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM devices WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) return res.status(404).json({ error: 'Device not found' });

  updateDevice(req.params.id, req.body as CreateDeviceRequest);
  const device = db.prepare('SELECT * FROM devices WHERE id = ?').get(req.params.id) as Record<string, unknown>;
  const ips = db.prepare('SELECT * FROM device_ips WHERE device_id = ?').all(req.params.id);
  const tags = (db.prepare('SELECT tag FROM device_tags WHERE device_id = ?').all(req.params.id) as { tag: string }[]).map(r => r.tag);
  logActivity({ projectId, action: 'updated', resourceType: 'device', resourceId: Number(req.params.id), resourceName: (req.body as CreateDeviceRequest).name });
  res.json({ ...device, ips, tags });
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
