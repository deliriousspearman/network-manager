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

  // Single-query fetch: each device row carries its ips and agents as JSON
  // arrays, collapsing the previous three-query + in-memory join.
  const deviceRows = db.prepare(
    `SELECT d.id, d.name, d.type, d.os, d.subnet_id, d.hosting_type,
            d.mac_address, d.location, d.notes, d.status, d.av, dp.x, dp.y,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) > 0 as has_credentials,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id AND used = 1) > 0 as any_credential_used,
      COALESCE(
        (SELECT json_group_array(json_object('ip_address', ip_address, 'label', label, 'is_primary', is_primary, 'dhcp', dhcp))
         FROM device_ips WHERE device_id = d.id),
        '[]'
      ) AS ips_json,
      COALESCE(
        (SELECT json_group_array(json_object('id', id, 'name', name, 'agent_type', agent_type))
         FROM (SELECT id, name, agent_type FROM agents WHERE device_id = d.id AND project_id = ? ORDER BY id)),
        '[]'
      ) AS agents_json
     FROM devices d
     INNER JOIN diagram_positions dp ON d.id = dp.device_id AND dp.view_id = ?
     WHERE d.project_id = ?`
  ).all(projectId, viewId, projectId) as Array<Record<string, unknown> & { ips_json: string; agents_json: string }>;

  const devices = deviceRows.map(row => {
    const { ips_json, agents_json, ...rest } = row;
    return {
      ...rest,
      ips: JSON.parse(ips_json),
      agents: JSON.parse(agents_json),
    };
  });

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

  const DEFAULT_LEGEND_ITEMS = [
    { icon: '', label: 'Credentials (used)', builtinIcon: 'credential-used' },
    { icon: '', label: 'Credentials (unused)', builtinIcon: 'credential-unused' },
    { icon: '', label: 'Favourite device', builtinIcon: 'favourite' },
    { icon: '🛡️', label: 'Antivirus installed', builtinIcon: 'av' },
    { icon: '', label: 'Monitoring agent', builtinIcon: 'agent' },
  ];

  const legendRow = db.prepare(
    'SELECT items FROM diagram_legend WHERE project_id = ?'
  ).get(projectId) as { items: string } | undefined;
  let legend_items: any[] = DEFAULT_LEGEND_ITEMS;
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

  // Agent type default icons: list agent types that have project-level custom defaults
  const agentTypeDefaultRows = db.prepare(
    'SELECT agent_type FROM agent_type_icons WHERE project_id = ?'
  ).all(projectId) as { agent_type: string }[];
  const agent_type_default_icons = agentTypeDefaultRows.map(r => r.agent_type);

  // Standalone diagram images (metadata only, no blob)
  const diagram_images = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId);

  res.json({ devices, subnets, connections, subnet_memberships, node_preferences, legend_items, annotations, views, current_view_id: viewId, device_icon_overrides, type_default_icons, agent_type_default_icons, diagram_images });
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

function bfsOrder(ids: number[], edges: Array<[number, number]>): number[] {
  const adj = new Map<number, number[]>();
  for (const id of ids) adj.set(id, []);
  for (const [a, b] of edges) {
    if (adj.has(a) && adj.has(b)) {
      adj.get(a)!.push(b);
      adj.get(b)!.push(a);
    }
  }
  // Start from highest-degree nodes so hubs get placed first
  const byDegree = [...ids].sort((a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0));
  const visited = new Set<number>();
  const result: number[] = [];
  for (const start of byDegree) {
    if (visited.has(start)) continue;
    const queue = [start];
    visited.add(start);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      result.push(curr);
      const neighbors = (adj.get(curr) ?? [])
        .filter(n => !visited.has(n))
        .sort((a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0));
      for (const nb of neighbors) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }
  return result;
}

const autoGenerate = db.transaction((projectId: number, viewId: number) => {
  // Clear existing positions for this view
  db.prepare('DELETE FROM diagram_positions WHERE view_id = ? AND device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(viewId, projectId);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE view_id = ? AND subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(viewId, projectId);
  // Clear annotations and standalone images for this view
  db.prepare('DELETE FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
  db.prepare('DELETE FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);

  const allSubnets = db.prepare('SELECT id FROM subnets WHERE project_id = ? ORDER BY name').all(projectId) as { id: number }[];
  const allDevices = db.prepare('SELECT id, subnet_id FROM devices WHERE project_id = ? ORDER BY name').all(projectId) as { id: number; subnet_id: number | null }[];

  // Fetch connections early for topology-aware ordering
  type Conn = { id: number; source_device_id: number | null; target_device_id: number | null; source_subnet_id: number | null; target_subnet_id: number | null };
  const connections = db.prepare(
    'SELECT id, source_device_id, target_device_id, source_subnet_id, target_subnet_id FROM connections WHERE project_id = ?'
  ).all(projectId) as Conn[];

  const subnetW = 500;
  const subnetCols = 2;
  const subnetGapX = 760;
  const subnetGap = 150; // vertical gap between subnet rows
  const devicePadX = 30;
  const devicePadY = 60;
  const deviceSpaceX = 300;
  const deviceSpaceY = 240;
  const devicesPerSubnetRow = 2;
  const minSubnetH = 300;
  const bottomPad = 40;

  // Group devices by subnet first so we can size subnets dynamically
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

  // BFS-order subnets so connected subnets end up adjacent in the grid
  const subnetEdges: Array<[number, number]> = connections
    .filter(c => c.source_subnet_id && c.target_subnet_id && !c.source_device_id && !c.target_device_id)
    .map(c => [c.source_subnet_id!, c.target_subnet_id!]);
  const orderedSubnetIds = bfsOrder(allSubnets.map(s => s.id), subnetEdges);
  const orderedSubnets = orderedSubnetIds.map(id => allSubnets.find(s => s.id === id)!);

  // BFS-order devices within each subnet to minimise intra-subnet edge crossings
  for (const [subnetId, devIds] of devicesBySubnet) {
    const mySet = new Set(devIds);
    const intraEdges: Array<[number, number]> = connections
      .filter(c => c.source_device_id && c.target_device_id && mySet.has(c.source_device_id) && mySet.has(c.target_device_id))
      .map(c => [c.source_device_id!, c.target_device_id!]);
    devicesBySubnet.set(subnetId, bfsOrder(devIds, intraEdges));
  }

  // BFS-order unassigned devices so connected ones end up adjacent in the grid
  const unassignedSet = new Set(unassignedDevices);
  const unassignedEdges: Array<[number, number]> = connections
    .filter(c => c.source_device_id && c.target_device_id && unassignedSet.has(c.source_device_id) && unassignedSet.has(c.target_device_id))
    .map(c => [c.source_device_id!, c.target_device_id!]);
  const orderedUnassigned = bfsOrder(unassignedDevices, unassignedEdges);

  // Calculate required height per subnet based on device count
  const calcSubnetH = (deviceCount: number): number => {
    const rows = Math.ceil(deviceCount / devicesPerSubnetRow);
    return Math.max(minSubnetH, devicePadY + rows * deviceSpaceY + bottomPad);
  };

  // Compute max height per grid row so subnets in the same row align
  const subnetHeights = orderedSubnets.map(s => calcSubnetH((devicesBySubnet.get(s.id) || []).length));
  const rowMaxH: number[] = [];
  for (let i = 0; i < orderedSubnets.length; i++) {
    const gridRow = Math.floor(i / subnetCols);
    rowMaxH[gridRow] = Math.max(rowMaxH[gridRow] || 0, subnetHeights[i]);
  }

  // Cumulative Y offsets per row
  const rowOffsets: number[] = [0];
  for (let r = 1; r < rowMaxH.length; r++) {
    rowOffsets[r] = rowOffsets[r - 1] + rowMaxH[r - 1] + subnetGap;
  }

  // Position subnets with dynamic heights
  const subnetPos = new Map<number, { x: number; y: number; h: number }>();
  for (let i = 0; i < orderedSubnets.length; i++) {
    const col = i % subnetCols;
    const gridRow = Math.floor(i / subnetCols);
    const x = col * subnetGapX + 50;
    const y = 50 + rowOffsets[gridRow];
    const h = rowMaxH[gridRow];
    upsertSubnetPos.run(orderedSubnets[i].id, viewId, x, y, subnetW, h);
    subnetPos.set(orderedSubnets[i].id, { x, y, h });
  }

  // Position devices within subnets
  for (const s of orderedSubnets) {
    const devIds = devicesBySubnet.get(s.id) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      upsertDevicePos.run(devIds[j], viewId, devicePadX + col * deviceSpaceX, devicePadY + row * deviceSpaceY);
    }
  }

  // Position unassigned devices below all subnets
  const totalSubnetH = rowMaxH.length > 0
    ? rowOffsets[rowMaxH.length - 1] + rowMaxH[rowMaxH.length - 1]
    : 0;
  const unassignedStartY = 50 + totalSubnetH + subnetGap;
  const unassignedCols = 3;
  for (let i = 0; i < orderedUnassigned.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    upsertDevicePos.run(orderedUnassigned[i], viewId, col * deviceSpaceX + 50, unassignedStartY + row * deviceSpaceY);
  }

  // Reassign edge handles based on new device positions
  const nodeW = 160, nodeH = 120;
  const absPos = new Map<number, { x: number; y: number }>();
  // Devices in subnets: relative pos + subnet pos
  for (const s of orderedSubnets) {
    const sp = subnetPos.get(s.id)!;
    const devIds = devicesBySubnet.get(s.id) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      absPos.set(devIds[j], { x: sp.x + devicePadX + col * deviceSpaceX, y: sp.y + devicePadY + row * deviceSpaceY });
    }
  }
  // Unassigned devices (already absolute)
  for (let i = 0; i < orderedUnassigned.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    absPos.set(orderedUnassigned[i], { x: col * deviceSpaceX + 50, y: unassignedStartY + row * deviceSpaceY });
  }

  const updateHandle = db.prepare('UPDATE connections SET source_handle = ?, target_handle = ? WHERE id = ?');

  for (const c of connections) {
    let srcCx: number | null = null, srcCy: number | null = null;
    let tgtCx: number | null = null, tgtCy: number | null = null;

    if (c.source_device_id && absPos.has(c.source_device_id)) {
      const p = absPos.get(c.source_device_id)!;
      srcCx = p.x + nodeW / 2; srcCy = p.y + nodeH / 2;
    } else if (c.source_subnet_id && subnetPos.has(c.source_subnet_id)) {
      const sp = subnetPos.get(c.source_subnet_id)!;
      srcCx = sp.x + subnetW / 2; srcCy = sp.y + sp.h / 2;
    }

    if (c.target_device_id && absPos.has(c.target_device_id)) {
      const p = absPos.get(c.target_device_id)!;
      tgtCx = p.x + nodeW / 2; tgtCy = p.y + nodeH / 2;
    } else if (c.target_subnet_id && subnetPos.has(c.target_subnet_id)) {
      const sp = subnetPos.get(c.target_subnet_id)!;
      tgtCx = sp.x + subnetW / 2; tgtCy = sp.y + sp.h / 2;
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
  try {
    autoGenerate(projectId, viewId);
    res.json({ success: true });
  } catch (err) {
    console.error('Auto-generate failed:', err);
    res.status(500).json({ error: 'Auto-generate layout failed' });
  }
});

// Diagram layout export (name-keyed JSON for sharing across projects)
router.get('/export', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);

  type DevRow = { id: number; name: string; x: number; y: number };
  type SubRow = { id: number; name: string; cidr: string; x: number; y: number; width: number; height: number };
  type ConnRow = { id: number; source_device_id: number | null; target_device_id: number | null; source_subnet_id: number | null; target_subnet_id: number | null; label: string | null; connection_type: string | null; edge_type: string | null; edge_color: string | null; edge_width: number | null; label_color: string | null; label_bg_color: string | null; source_port: string | null; target_port: string | null };

  const devices = db.prepare(
    `SELECT d.id, d.name, dp.x, dp.y FROM devices d
     INNER JOIN diagram_positions dp ON d.id = dp.device_id AND dp.view_id = ?
     WHERE d.project_id = ?`
  ).all(viewId, projectId) as DevRow[];

  const subnets = db.prepare(
    `SELECT s.id, s.name, s.cidr, sp.x, sp.y, sp.width, sp.height FROM subnets s
     INNER JOIN subnet_diagram_positions sp ON s.id = sp.subnet_id AND sp.view_id = ?
     WHERE s.project_id = ?`
  ).all(viewId, projectId) as SubRow[];

  const deviceIdSet = new Set(devices.map(d => d.id));
  const subnetIdSet = new Set(subnets.map(s => s.id));
  const deviceById = new Map(devices.map(d => [d.id, d.name]));
  const subnetById = new Map(subnets.map(s => [s.id, s.name]));

  const allConns = db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId) as ConnRow[];
  const relevantConns = allConns.filter(c => {
    const srcOk = (c.source_device_id != null && deviceIdSet.has(c.source_device_id)) || (c.source_subnet_id != null && subnetIdSet.has(c.source_subnet_id));
    const tgtOk = (c.target_device_id != null && deviceIdSet.has(c.target_device_id)) || (c.target_subnet_id != null && subnetIdSet.has(c.target_subnet_id));
    return srcOk && tgtOk;
  });

  const nodePrefsRows = db.prepare('SELECT node_id, prefs FROM node_preferences WHERE project_id = ?').all(projectId) as { node_id: string; prefs: string }[];
  const prefsByKey: Record<string, any> = {};
  for (const row of nodePrefsRows) {
    const m = row.node_id.match(/^(device|subnet)-(\d+)$/);
    if (!m) continue;
    const id = parseInt(m[2]);
    const name = m[1] === 'device' ? deviceById.get(id) : subnetById.get(id);
    if (name) { try { prefsByKey[`${m[1]}:${name}`] = JSON.parse(row.prefs); } catch { /* skip */ } }
  }

  const annotations = db.prepare(
    'SELECT x, y, text, font_size, color FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId) as { x: number; y: number; text: string; font_size: number; color: string | null }[];

  const images = db.prepare(
    'SELECT x, y, width, height, filename, mime_type, data, label FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId) as any[];

  const legendRow = db.prepare('SELECT items FROM diagram_legend WHERE project_id = ?').get(projectId) as { items: string } | undefined;
  const viewRow = db.prepare('SELECT name FROM diagram_views WHERE id = ?').get(viewId) as { name: string } | undefined;

  const exportData = {
    version: 1, scope: 'diagram',
    exportedAt: new Date().toISOString(),
    viewName: viewRow?.name ?? 'Default',
    devices: devices.map(d => ({ name: d.name, x: d.x, y: d.y, prefs: prefsByKey[`device:${d.name}`] || {} })),
    subnets: subnets.map(s => ({ name: s.name, cidr: s.cidr, x: s.x, y: s.y, width: s.width, height: s.height, prefs: prefsByKey[`subnet:${s.name}`] || {} })),
    connections: relevantConns.map(c => ({
      sourceDevice: c.source_device_id != null ? (deviceById.get(c.source_device_id) ?? null) : null,
      targetDevice: c.target_device_id != null ? (deviceById.get(c.target_device_id) ?? null) : null,
      sourceSubnet: c.source_subnet_id != null ? (subnetById.get(c.source_subnet_id) ?? null) : null,
      targetSubnet: c.target_subnet_id != null ? (subnetById.get(c.target_subnet_id) ?? null) : null,
      label: c.label, connectionType: c.connection_type, edgeType: c.edge_type,
      edgeColor: c.edge_color, edgeWidth: c.edge_width, labelColor: c.label_color, labelBgColor: c.label_bg_color,
      sourcePort: c.source_port, targetPort: c.target_port,
    })),
    annotations: annotations.map(a => ({ x: a.x, y: a.y, text: a.text, fontSize: a.font_size, color: a.color })),
    images: images.map((img: any) => ({ x: img.x, y: img.y, width: img.width, height: img.height, filename: img.filename, mimeType: img.mime_type, data: img.data, label: img.label })),
    legendItems: legendRow ? (() => { try { return JSON.parse(legendRow.items); } catch { return []; } })() : [],
  };

  const filename = `diagram-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  res.json(exportData);
});

// Diagram layout import (name-keyed: matches devices/subnets by name)
router.post('/import', (req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body;
  if (!body || body.scope !== 'diagram' || body.version !== 1) {
    return res.status(400).json({ error: 'Invalid diagram file — must be a diagram export (scope: diagram, version: 1)' });
  }

  const viewId = getViewId(projectId, (req.query.view_id ?? req.body.view_id) as string | undefined);

  const projectDevices = db.prepare('SELECT id, name FROM devices WHERE project_id = ?').all(projectId) as { id: number; name: string }[];
  const projectSubnets = db.prepare('SELECT id, name FROM subnets WHERE project_id = ?').all(projectId) as { id: number; name: string }[];
  const deviceByName = new Map(projectDevices.map(d => [d.name, d.id]));
  const subnetByName = new Map(projectSubnets.map(s => [s.name, s.id]));

  const matchedDevices: string[] = [];
  const unmatchedDevices: string[] = [];
  const matchedSubnets: string[] = [];
  const unmatchedSubnets: string[] = [];
  const skippedConnections: string[] = [];

  try {
    db.transaction(() => {
      // Clear current view positions, annotations, images
      const devIds = projectDevices.map(d => d.id);
      const subIds = projectSubnets.map(s => s.id);
      if (devIds.length) db.prepare(`DELETE FROM diagram_positions WHERE view_id = ? AND device_id IN (${devIds.map(() => '?').join(',')})`).run(viewId, ...devIds);
      if (subIds.length) db.prepare(`DELETE FROM subnet_diagram_positions WHERE view_id = ? AND subnet_id IN (${subIds.map(() => '?').join(',')})`).run(viewId, ...subIds);
      db.prepare('DELETE FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
      db.prepare('DELETE FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
      // Replace all connections in the project
      db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);

      for (const d of (body.devices ?? []) as any[]) {
        if (typeof d.name !== 'string') continue;
        const id = deviceByName.get(d.name);
        if (id != null) {
          upsertDevicePos.run(id, viewId, d.x ?? 0, d.y ?? 0);
          matchedDevices.push(d.name);
          if (d.prefs && typeof d.prefs === 'object' && Object.keys(d.prefs).length > 0) {
            db.prepare(`INSERT INTO node_preferences (node_id, project_id, prefs) VALUES (?, ?, ?)
              ON CONFLICT(node_id, project_id) DO UPDATE SET prefs = excluded.prefs`).run(`device-${id}`, projectId, JSON.stringify(d.prefs));
          }
        } else { unmatchedDevices.push(d.name); }
      }

      for (const s of (body.subnets ?? []) as any[]) {
        if (typeof s.name !== 'string') continue;
        const id = subnetByName.get(s.name);
        if (id != null) {
          upsertSubnetPos.run(id, viewId, s.x ?? 0, s.y ?? 0, s.width ?? 400, s.height ?? 300);
          matchedSubnets.push(s.name);
          if (s.prefs && typeof s.prefs === 'object' && Object.keys(s.prefs).length > 0) {
            db.prepare(`INSERT INTO node_preferences (node_id, project_id, prefs) VALUES (?, ?, ?)
              ON CONFLICT(node_id, project_id) DO UPDATE SET prefs = excluded.prefs`).run(`subnet-${id}`, projectId, JSON.stringify(s.prefs));
          }
        } else { unmatchedSubnets.push(s.name); }
      }

      const connInsert = db.prepare(
        `INSERT INTO connections (source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_port, target_port, project_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      );
      for (const c of (body.connections ?? []) as any[]) {
        const srcDevId = c.sourceDevice ? (deviceByName.get(c.sourceDevice) ?? null) : null;
        const tgtDevId = c.targetDevice ? (deviceByName.get(c.targetDevice) ?? null) : null;
        const srcSubId = c.sourceSubnet ? (subnetByName.get(c.sourceSubnet) ?? null) : null;
        const tgtSubId = c.targetSubnet ? (subnetByName.get(c.targetSubnet) ?? null) : null;
        // Require both source and target to resolve to a known device or subnet
        if (srcDevId == null && srcSubId == null) { skippedConnections.push(`${c.sourceDevice ?? c.sourceSubnet ?? '?'} -> ${c.targetDevice ?? c.targetSubnet ?? '?'}`); continue; }
        if (tgtDevId == null && tgtSubId == null) { skippedConnections.push(`${c.sourceDevice ?? c.sourceSubnet ?? '?'} -> ${c.targetDevice ?? c.targetSubnet ?? '?'}`); continue; }
        connInsert.run(srcDevId, tgtDevId, srcSubId, tgtSubId, c.label ?? null, c.connectionType ?? null, c.edgeType ?? null, c.edgeColor ?? null, c.edgeWidth ?? null, c.labelColor ?? null, c.labelBgColor ?? null, c.sourcePort ?? null, c.targetPort ?? null, projectId);
      }

      for (const a of (body.annotations ?? []) as any[]) {
        if (typeof a.x !== 'number' || typeof a.y !== 'number') continue;
        db.prepare('INSERT INTO diagram_annotations (project_id, view_id, x, y, text, font_size, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(projectId, viewId, a.x, a.y, a.text ?? '', a.fontSize ?? 14, a.color ?? null);
      }

      for (const img of (body.images ?? []) as any[]) {
        if (!img.data || !img.filename) continue;
        db.prepare('INSERT INTO diagram_images (project_id, view_id, x, y, width, height, filename, mime_type, data, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(projectId, viewId, img.x ?? 0, img.y ?? 0, img.width ?? 200, img.height ?? 150, img.filename, img.mimeType ?? 'image/png', img.data, img.label ?? null);
      }

      if (Array.isArray(body.legendItems)) {
        db.prepare(`INSERT INTO diagram_legend (project_id, items) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET items = excluded.items`)
          .run(projectId, JSON.stringify(body.legendItems));
      }
    })();

    res.json({ matchedDevices: matchedDevices.length, unmatchedDevices, matchedSubnets: matchedSubnets.length, unmatchedSubnets, skippedConnections });
  } catch (err) {
    console.error('Diagram import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

// Annotation CRUD
router.post('/annotations', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id);
  const { x, y, font_size, color } = req.body;
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 5000) : 'Text';
  const result = db.prepare(
    'INSERT INTO diagram_annotations (project_id, x, y, text, font_size, color, view_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(projectId, x ?? 0, y ?? 0, text, font_size ?? 14, color ?? null, viewId);
  const annotation = db.prepare('SELECT * FROM diagram_annotations WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(annotation);
});

router.put('/annotations/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) return res.status(404).json({ error: 'Annotation not found' });

  const { x, y, font_size, color } = req.body;
  const text = typeof req.body.text === 'string' ? req.body.text.slice(0, 5000) : null;
  db.prepare(
    'UPDATE diagram_annotations SET x = COALESCE(?, x), y = COALESCE(?, y), text = COALESCE(?, text), font_size = COALESCE(?, font_size), color = ? WHERE id = ?'
  ).run(x ?? null, y ?? null, text, font_size ?? null, color ?? null, req.params.id);
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
