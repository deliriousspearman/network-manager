import { Router } from 'express';
import db from '../db/connection.js';
import type { UpdatePositionsRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const devices = db.prepare(
    `SELECT d.id, d.name, d.type, d.os, d.subnet_id, d.hosting_type,
            d.mac_address, d.location, d.notes, dp.x, dp.y,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) > 0 as has_credentials
     FROM devices d
     INNER JOIN diagram_positions dp ON d.id = dp.device_id
     WHERE d.project_id = ?`
  ).all(projectId) as any[];

  const allIps = db.prepare(
    `SELECT di.device_id, di.ip_address, di.label, di.is_primary
     FROM device_ips di
     INNER JOIN diagram_positions dp ON di.device_id = dp.device_id
     INNER JOIN devices d ON di.device_id = d.id
     WHERE d.project_id = ?`
  ).all(projectId) as any[];

  const ipsByDevice = new Map<number, any[]>();
  for (const ip of allIps) {
    if (!ipsByDevice.has(ip.device_id)) ipsByDevice.set(ip.device_id, []);
    ipsByDevice.get(ip.device_id)!.push({ ip_address: ip.ip_address, label: ip.label, is_primary: ip.is_primary });
  }

  for (const d of devices) {
    d.ips = ipsByDevice.get(d.id) || [];
  }

  const subnets = db.prepare(
    `SELECT s.id, s.name, s.cidr, s.vlan_id, s.description, sp.x, sp.y, sp.width, sp.height
     FROM subnets s
     INNER JOIN subnet_diagram_positions sp ON s.id = sp.subnet_id
     WHERE s.project_id = ?`
  ).all(projectId);

  const connections = db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId);

  const subnet_memberships = db.prepare(
    `SELECT ds.device_id, ds.subnet_id
     FROM device_subnets ds
     INNER JOIN diagram_positions dp ON ds.device_id = dp.device_id
     INNER JOIN subnet_diagram_positions sdp ON ds.subnet_id = sdp.subnet_id
     INNER JOIN devices d ON ds.device_id = d.id
     WHERE d.project_id = ?`
  ).all(projectId);

  const nodePrefsRows = db.prepare(
    'SELECT node_id, prefs FROM node_preferences WHERE project_id = ?'
  ).all(projectId) as { node_id: string; prefs: string }[];
  const node_preferences: Record<string, any> = {};
  for (const row of nodePrefsRows) {
    try { node_preferences[row.node_id] = JSON.parse(row.prefs); } catch { /* skip bad json */ }
  }

  const legendRow = db.prepare(
    'SELECT items FROM diagram_legend WHERE project_id = ?'
  ).get(projectId) as { items: string } | undefined;
  let legend_items: any[] = [];
  if (legendRow) {
    try { legend_items = JSON.parse(legendRow.items); } catch { /* skip bad json */ }
  }

  res.json({ devices, subnets, connections, subnet_memberships, node_preferences, legend_items });
});

const upsertDevicePos = db.prepare(
  `INSERT INTO diagram_positions (device_id, x, y) VALUES (?, ?, ?)
   ON CONFLICT(device_id) DO UPDATE SET x = excluded.x, y = excluded.y`
);

const upsertSubnetPos = db.prepare(
  `INSERT INTO subnet_diagram_positions (subnet_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(subnet_id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height`
);

const updatePositions = db.transaction((body: UpdatePositionsRequest) => {
  if (body.devices) {
    for (const d of body.devices) {
      upsertDevicePos.run(d.id, d.x, d.y);
    }
  }
  if (body.subnets) {
    for (const s of body.subnets) {
      upsertSubnetPos.run(s.id, s.x, s.y, s.width, s.height);
    }
  }
});

router.put('/positions', (req, res) => {
  updatePositions(req.body as UpdatePositionsRequest);
  res.json({ ok: true });
});

router.put('/node-preferences', (req, res) => {
  const projectId = res.locals.projectId;
  const { nodeId, prefs } = req.body as { nodeId: string; prefs: Record<string, any> };
  if (!nodeId) { res.status(400).json({ error: 'nodeId required' }); return; }

  if (!prefs || Object.keys(prefs).length === 0) {
    db.prepare('DELETE FROM node_preferences WHERE node_id = ? AND project_id = ?').run(nodeId, projectId);
  } else {
    db.prepare(
      `INSERT INTO node_preferences (node_id, project_id, prefs) VALUES (?, ?, ?)
       ON CONFLICT(node_id, project_id) DO UPDATE SET prefs = excluded.prefs`
    ).run(nodeId, projectId, JSON.stringify(prefs));
  }
  res.json({ ok: true });
});

router.put('/legend', (req, res) => {
  const projectId = res.locals.projectId;
  const { items } = req.body as { items: any[] };
  db.prepare(
    `INSERT INTO diagram_legend (project_id, items) VALUES (?, ?)
     ON CONFLICT(project_id) DO UPDATE SET items = excluded.items`
  ).run(projectId, JSON.stringify(items || []));
  res.json({ ok: true });
});

router.delete('/device/:deviceId', (req, res) => {
  db.prepare('DELETE FROM diagram_positions WHERE device_id = ?').run(req.params.deviceId);
  res.status(204).send();
});

router.delete('/subnet/:subnetId', (req, res) => {
  db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id = ?').run(req.params.subnetId);
  res.status(204).send();
});

const autoGenerate = db.transaction((projectId: number) => {
  // Clear existing positions for this project's devices/subnets
  db.prepare('DELETE FROM diagram_positions WHERE device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(projectId);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(projectId);

  const allSubnets = db.prepare('SELECT id FROM subnets WHERE project_id = ? ORDER BY name').all(projectId) as { id: number }[];
  const allDevices = db.prepare('SELECT id, subnet_id FROM devices WHERE project_id = ? ORDER BY name').all(projectId) as { id: number; subnet_id: number | null }[];

  const subnetW = 400;
  const subnetH = 300;
  const subnetCols = 2;
  const subnetGapX = 500;
  const subnetGapY = 400;
  const devicePadX = 30;
  const devicePadY = 60;
  const deviceSpaceX = 160;
  const deviceSpaceY = 100;
  const devicesPerSubnetRow = 2;

  for (let i = 0; i < allSubnets.length; i++) {
    const col = i % subnetCols;
    const row = Math.floor(i / subnetCols);
    upsertSubnetPos.run(allSubnets[i].id, col * subnetGapX + 50, row * subnetGapY + 50, subnetW, subnetH);
  }

  const devicesBySubnet = new Map<number, number[]>();
  const unassignedDevices: number[] = [];
  for (const d of allDevices) {
    if (d.subnet_id) {
      if (!devicesBySubnet.has(d.subnet_id)) devicesBySubnet.set(d.subnet_id, []);
      devicesBySubnet.get(d.subnet_id)!.push(d.id);
    } else {
      unassignedDevices.push(d.id);
    }
  }

  for (let i = 0; i < allSubnets.length; i++) {
    const subnetId = allSubnets[i].id;
    const devIds = devicesBySubnet.get(subnetId) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      upsertDevicePos.run(devIds[j], devicePadX + col * deviceSpaceX, devicePadY + row * deviceSpaceY);
    }
  }

  const subnetRows = Math.ceil(allSubnets.length / subnetCols);
  const unassignedStartY = subnetRows * subnetGapY + 100;
  const unassignedCols = 4;
  for (let i = 0; i < unassignedDevices.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    upsertDevicePos.run(unassignedDevices[i], col * deviceSpaceX + 50, unassignedStartY + row * deviceSpaceY);
  }
});

router.post('/auto-generate', (_req, res) => {
  const projectId = res.locals.projectId;
  autoGenerate(projectId);
  res.json({ success: true });
});

export default router;
