import { Router } from 'express';
import db from '../db/connection.js';
import type { UpdatePositionsRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

function getViewId(projectId: number, requestedViewId?: string | number): number {
  if (requestedViewId) {
    const vid = Number(requestedViewId);
    const view = db.prepare('SELECT id FROM diagram_views WHERE id = ? AND project_id = ?').get(vid, projectId) as { id: number } | undefined;
    if (view) return view.id;
  }
  // Fall back to default view, creating one if needed
  let defaultView = db.prepare('SELECT id FROM diagram_views WHERE project_id = ? AND is_default = 1').get(projectId) as { id: number } | undefined;
  if (!defaultView) {
    const result = db.prepare('INSERT INTO diagram_views (project_id, name, is_default) VALUES (?, ?, 1)').run(projectId, 'Default');
    return result.lastInsertRowid as number;
  }
  return defaultView.id;
}

// Views CRUD
router.get('/views', (_req, res) => {
  const projectId = res.locals.projectId;
  const views = db.prepare('SELECT * FROM diagram_views WHERE project_id = ? ORDER BY is_default DESC, name').all(projectId);
  res.json(views);
});

router.post('/views', (req, res) => {
  const projectId = res.locals.projectId;
  const { name } = req.body;
  const result = db.prepare('INSERT INTO diagram_views (project_id, name, is_default) VALUES (?, ?, 0)').run(projectId, name || 'New View');
  const view = db.prepare('SELECT * FROM diagram_views WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(view);
});

router.put('/views/:viewId', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM diagram_views WHERE id = ? AND project_id = ?').get(req.params.viewId, projectId);
  if (!existing) return res.status(404).json({ error: 'View not found' });
  const { name } = req.body;
  if (name) db.prepare('UPDATE diagram_views SET name = ? WHERE id = ?').run(name, req.params.viewId);
  const view = db.prepare('SELECT * FROM diagram_views WHERE id = ?').get(req.params.viewId);
  res.json(view);
});

router.delete('/views/:viewId', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id, is_default FROM diagram_views WHERE id = ? AND project_id = ?').get(req.params.viewId, projectId) as { id: number; is_default: number } | undefined;
  if (!existing) return res.status(404).json({ error: 'View not found' });
  if (existing.is_default) return res.status(400).json({ error: 'Cannot delete the default view' });
  db.prepare('DELETE FROM diagram_positions WHERE view_id = ?').run(req.params.viewId);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE view_id = ?').run(req.params.viewId);
  db.prepare('DELETE FROM diagram_annotations WHERE view_id = ?').run(req.params.viewId);
  db.prepare('DELETE FROM diagram_images WHERE view_id = ?').run(req.params.viewId);
  db.prepare('DELETE FROM diagram_views WHERE id = ?').run(req.params.viewId);
  res.status(204).send();
});

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);

  const devices = db.prepare(
    `SELECT d.id, d.name, d.type, d.os, d.subnet_id, d.hosting_type,
            d.mac_address, d.location, d.notes, d.status, dp.x, dp.y,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) > 0 as has_credentials
     FROM devices d
     INNER JOIN diagram_positions dp ON d.id = dp.device_id AND dp.view_id = ?
     WHERE d.project_id = ?`
  ).all(viewId, projectId) as any[];

  const allIps = db.prepare(
    `SELECT di.device_id, di.ip_address, di.label, di.is_primary
     FROM device_ips di
     INNER JOIN diagram_positions dp ON di.device_id = dp.device_id AND dp.view_id = ?
     INNER JOIN devices d ON di.device_id = d.id
     WHERE d.project_id = ?`
  ).all(viewId, projectId) as any[];

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
     INNER JOIN subnet_diagram_positions sp ON s.id = sp.subnet_id AND sp.view_id = ?
     WHERE s.project_id = ?`
  ).all(viewId, projectId);

  const connections = db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId);

  const subnet_memberships = db.prepare(
    `SELECT ds.device_id, ds.subnet_id
     FROM device_subnets ds
     INNER JOIN diagram_positions dp ON ds.device_id = dp.device_id AND dp.view_id = ?
     INNER JOIN subnet_diagram_positions sdp ON ds.subnet_id = sdp.subnet_id AND sdp.view_id = ?
     INNER JOIN devices d ON ds.device_id = d.id
     WHERE d.project_id = ?`
  ).all(viewId, viewId, projectId);

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

  const annotations = db.prepare(
    'SELECT * FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId);

  const views = db.prepare('SELECT * FROM diagram_views WHERE project_id = ? ORDER BY is_default DESC, name').all(projectId);

  // Icon overrides: list device IDs that have per-device icon overrides
  const deviceIconOverrideRows = db.prepare(
    'SELECT device_id FROM device_icon_overrides WHERE project_id = ?'
  ).all(projectId) as { device_id: number }[];
  const device_icon_overrides = deviceIconOverrideRows.map(r => r.device_id);

  // Type default icons: list device types that have project-level custom defaults
  const typeDefaultRows = db.prepare(
    'SELECT device_type FROM device_type_icons WHERE project_id = ?'
  ).all(projectId) as { device_type: string }[];
  const type_default_icons = typeDefaultRows.map(r => r.device_type);

  // Standalone diagram images (metadata only, no blob)
  const diagram_images = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId);

  res.json({ devices, subnets, connections, subnet_memberships, node_preferences, legend_items, annotations, views, current_view_id: viewId, device_icon_overrides, type_default_icons, diagram_images });
});

const upsertDevicePos = db.prepare(
  `INSERT INTO diagram_positions (device_id, view_id, x, y) VALUES (?, ?, ?, ?)
   ON CONFLICT(device_id, view_id) DO UPDATE SET x = excluded.x, y = excluded.y`
);

const upsertSubnetPos = db.prepare(
  `INSERT INTO subnet_diagram_positions (subnet_id, view_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)
   ON CONFLICT(subnet_id, view_id) DO UPDATE SET x = excluded.x, y = excluded.y, width = excluded.width, height = excluded.height`
);

const updatePositions = db.transaction((body: UpdatePositionsRequest, viewId: number) => {
  if (body.devices) {
    for (const d of body.devices) {
      upsertDevicePos.run(d.id, viewId, d.x, d.y);
    }
  }
  if (body.subnets) {
    for (const s of body.subnets) {
      upsertSubnetPos.run(s.id, viewId, s.x, s.y, s.width, s.height);
    }
  }
});

router.put('/positions', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  updatePositions(req.body as UpdatePositionsRequest, viewId);
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
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);
  db.prepare('DELETE FROM diagram_positions WHERE device_id = ? AND view_id = ?').run(req.params.deviceId, viewId);
  res.status(204).send();
});

router.delete('/subnet/:subnetId', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id = ? AND view_id = ?').run(req.params.subnetId, viewId);
  res.status(204).send();
});

const autoGenerate = db.transaction((projectId: number, viewId: number) => {
  // Clear existing positions for this view
  db.prepare('DELETE FROM diagram_positions WHERE view_id = ? AND device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(viewId, projectId);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE view_id = ? AND subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(viewId, projectId);
  // Clear annotations and standalone images for this view
  db.prepare('DELETE FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
  db.prepare('DELETE FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);

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
    upsertSubnetPos.run(allSubnets[i].id, viewId, col * subnetGapX + 50, row * subnetGapY + 50, subnetW, subnetH);
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
      upsertDevicePos.run(devIds[j], viewId, devicePadX + col * deviceSpaceX, devicePadY + row * deviceSpaceY);
    }
  }

  const subnetRows = Math.ceil(allSubnets.length / subnetCols);
  const unassignedStartY = subnetRows * subnetGapY + 100;
  const unassignedCols = 4;
  for (let i = 0; i < unassignedDevices.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    upsertDevicePos.run(unassignedDevices[i], viewId, col * deviceSpaceX + 50, unassignedStartY + row * deviceSpaceY);
  }

  // Reassign edge handles based on new device positions
  // Build absolute position map for all devices
  const nodeW = 150, nodeH = 80;
  const absPos = new Map<number, { x: number; y: number }>();
  // Subnet positions (absolute)
  const subnetPos = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < allSubnets.length; i++) {
    const col = i % subnetCols;
    const row = Math.floor(i / subnetCols);
    subnetPos.set(allSubnets[i].id, { x: col * subnetGapX + 50, y: row * subnetGapY + 50 });
  }
  // Devices in subnets: relative pos + subnet pos
  for (let i = 0; i < allSubnets.length; i++) {
    const subnetId = allSubnets[i].id;
    const sp = subnetPos.get(subnetId)!;
    const devIds = devicesBySubnet.get(subnetId) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      absPos.set(devIds[j], { x: sp.x + devicePadX + col * deviceSpaceX, y: sp.y + devicePadY + row * deviceSpaceY });
    }
  }
  // Unassigned devices (already absolute)
  for (let i = 0; i < unassignedDevices.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    absPos.set(unassignedDevices[i], { x: col * deviceSpaceX + 50, y: unassignedStartY + row * deviceSpaceY });
  }

  // Update connection handles
  const connections = db.prepare(
    'SELECT id, source_device_id, target_device_id, source_subnet_id, target_subnet_id FROM connections WHERE project_id = ?'
  ).all(projectId) as { id: number; source_device_id: number | null; target_device_id: number | null; source_subnet_id: number | null; target_subnet_id: number | null }[];

  const updateHandle = db.prepare('UPDATE connections SET source_handle = ?, target_handle = ? WHERE id = ?');

  for (const c of connections) {
    let srcCx: number | null = null, srcCy: number | null = null;
    let tgtCx: number | null = null, tgtCy: number | null = null;

    if (c.source_device_id && absPos.has(c.source_device_id)) {
      const p = absPos.get(c.source_device_id)!;
      srcCx = p.x + nodeW / 2; srcCy = p.y + nodeH / 2;
    } else if (c.source_subnet_id && subnetPos.has(c.source_subnet_id)) {
      const p = subnetPos.get(c.source_subnet_id)!;
      srcCx = p.x + subnetW / 2; srcCy = p.y + subnetH / 2;
    }

    if (c.target_device_id && absPos.has(c.target_device_id)) {
      const p = absPos.get(c.target_device_id)!;
      tgtCx = p.x + nodeW / 2; tgtCy = p.y + nodeH / 2;
    } else if (c.target_subnet_id && subnetPos.has(c.target_subnet_id)) {
      const p = subnetPos.get(c.target_subnet_id)!;
      tgtCx = p.x + subnetW / 2; tgtCy = p.y + subnetH / 2;
    }

    if (srcCx == null || srcCy == null || tgtCx == null || tgtCy == null) continue;

    const dx = tgtCx - srcCx;
    const dy = tgtCy - srcCy;
    let srcSide: string, tgtSide: string;
    if (Math.abs(dx) > Math.abs(dy)) {
      srcSide = dx > 0 ? 'rgt' : 'lft';
      tgtSide = dx > 0 ? 'lft' : 'rgt';
    } else {
      srcSide = dy > 0 ? 'bot' : 'top';
      tgtSide = dy > 0 ? 'top' : 'bot';
    }

    const isSourceSubnet = !!c.source_subnet_id && !c.source_device_id;
    const isTargetSubnet = !!c.target_subnet_id && !c.target_device_id;
    const sourceHandle = isSourceSubnet ? `subnet-${srcSide}-s` : `${srcSide}-c-s`;
    const targetHandle = isTargetSubnet ? `subnet-${tgtSide}-t` : `${tgtSide}-c-t`;

    updateHandle.run(sourceHandle, targetHandle, c.id);
  }
});

router.post('/auto-generate', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id ?? req.query.view_id);
  autoGenerate(projectId, viewId);
  res.json({ success: true });
});

// Annotation CRUD
router.post('/annotations', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  const { x, y, text, font_size, color } = req.body;
  const result = db.prepare(
    'INSERT INTO diagram_annotations (project_id, x, y, text, font_size, color, view_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, x ?? 0, y ?? 0, text ?? 'Text', font_size ?? 14, color ?? null, viewId);
  const annotation = db.prepare('SELECT * FROM diagram_annotations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(annotation);
});

router.put('/annotations/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) return res.status(404).json({ error: 'Annotation not found' });

  const { x, y, text, font_size, color } = req.body;
  db.prepare(
    'UPDATE diagram_annotations SET x = COALESCE(?, x), y = COALESCE(?, y), text = COALESCE(?, text), font_size = COALESCE(?, font_size), color = ? WHERE id = ?'
  ).run(x ?? null, y ?? null, text ?? null, font_size ?? null, color ?? null, req.params.id);
  const annotation = db.prepare('SELECT * FROM diagram_annotations WHERE id = ?').get(req.params.id);
  res.json(annotation);
});

router.delete('/annotations/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) return res.status(404).json({ error: 'Annotation not found' });
  db.prepare('DELETE FROM diagram_annotations WHERE id = ?').run(req.params.id);
  res.status(204).send();
});

export default router;
