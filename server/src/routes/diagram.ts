import { Router } from 'express';
import db from '../db/connection.js';
import { getViewId } from '../db/diagramViews.js';
import { publishSafe } from '../events/bus.js';
import { logActivity } from '../db/activityLog.js';
import type { UpdatePositionsRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

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

  // Fetch the device list with cheap correlated subqueries only (primary IP,
  // credential counts). The full IP and agent lists used to come back as
  // per-device json_group_array subselects, but that ran once per device —
  // for a 5000-device project that's 10000 nested aggregations. We now fetch
  // ips and agents in two batched queries below and stitch them in JS.
  const deviceRows = db.prepare(
    `SELECT d.id, d.name, d.type, d.os, d.subnet_id, d.hosting_type,
            d.mac_address, d.location, d.notes, d.status, d.av, dp.x, dp.y,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id) > 0 as has_credentials,
      (SELECT COUNT(*) FROM credentials WHERE device_id = d.id AND used = 1) > 0 as any_credential_used
     FROM devices d
     INNER JOIN diagram_positions dp ON d.id = dp.device_id AND dp.view_id = ?
     WHERE d.project_id = ?`
  ).all(viewId, projectId) as Array<Record<string, unknown> & { id: number }>;

  const deviceIdSet = new Set(deviceRows.map(d => d.id));
  const ipsByDevice = new Map<number, Array<Record<string, unknown>>>();
  const agentsByDevice = new Map<number, Array<Record<string, unknown>>>();

  if (deviceIdSet.size > 0) {
    // Batched IP fetch: scoped to project to avoid cross-project leakage even
    // if a device id ever appeared twice. The diagram only includes devices
    // already filtered by project + view.
    const ipRows = db.prepare(
      `SELECT di.device_id, di.ip_address, di.label, di.is_primary, di.dhcp
       FROM device_ips di
       INNER JOIN devices d ON d.id = di.device_id
       WHERE d.project_id = ?`
    ).all(projectId) as Array<{ device_id: number; ip_address: string; label: string | null; is_primary: number; dhcp: number }>;
    for (const r of ipRows) {
      if (!deviceIdSet.has(r.device_id)) continue;
      const arr = ipsByDevice.get(r.device_id) ?? [];
      arr.push({ ip_address: r.ip_address, label: r.label, is_primary: r.is_primary, dhcp: r.dhcp });
      ipsByDevice.set(r.device_id, arr);
    }
    const agentRows = db.prepare(
      `SELECT id, name, agent_type, device_id FROM agents WHERE project_id = ? AND device_id IS NOT NULL ORDER BY id`
    ).all(projectId) as Array<{ id: number; name: string; agent_type: string; device_id: number }>;
    for (const r of agentRows) {
      if (!deviceIdSet.has(r.device_id)) continue;
      const arr = agentsByDevice.get(r.device_id) ?? [];
      arr.push({ id: r.id, name: r.name, agent_type: r.agent_type });
      agentsByDevice.set(r.device_id, arr);
    }
  }

  const devices = deviceRows.map(row => ({
    ...row,
    ips: ipsByDevice.get(row.id) ?? [],
    agents: agentsByDevice.get(row.id) ?? [],
  }));

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
  const node_preferences: Record<string, unknown> = {};
  for (const row of nodePrefsRows) {
    try { node_preferences[row.node_id] = JSON.parse(row.prefs); } catch { /* skip bad json */ }
  }

  type LegendItem = { icon?: string; label?: string; builtinIcon?: string };
  const DEFAULT_LEGEND_ITEMS: LegendItem[] = [
    { icon: '', label: 'Credentials (used)', builtinIcon: 'credential-used' },
    { icon: '', label: 'Credentials (unused)', builtinIcon: 'credential-unused' },
    { icon: '', label: 'Favourite device', builtinIcon: 'favourite' },
    { icon: '🛡️', label: 'Antivirus installed', builtinIcon: 'av' },
    { icon: '', label: 'Monitoring agent', builtinIcon: 'agent' },
  ];

  const legendRow = db.prepare(
    'SELECT items FROM diagram_legend WHERE project_id = ?'
  ).get(projectId) as { items: string } | undefined;
  let legend_items: LegendItem[] = DEFAULT_LEGEND_ITEMS;
  if (legendRow) {
    try { legend_items = JSON.parse(legendRow.items); } catch { /* skip bad json */ }
  }

  const annotations = db.prepare(
    'SELECT * FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId);

  const views = db.prepare('SELECT * FROM diagram_views WHERE project_id = ? ORDER BY is_default DESC, name').all(projectId);

  // Icon overrides: per-device override rows (carry source info so the client
  // can choose between dynamic upload URL and static library URL).
  const device_icon_overrides = db.prepare(
    'SELECT device_id, icon_source, library_id, library_icon_key, color FROM device_icon_overrides WHERE project_id = ?'
  ).all(projectId);

  // Type default icons: project-level custom defaults, with source info.
  const type_default_icons = db.prepare(
    'SELECT device_type, icon_source, library_id, library_icon_key, color FROM device_type_icons WHERE project_id = ?'
  ).all(projectId);

  // Agent types: full per-project list so the client can resolve icons without N+1 lookups
  const agent_types = db.prepare(
    `SELECT id, key, icon_source, icon_builtin_key,
            CASE WHEN icon_source = 'upload' AND file_path IS NOT NULL THEN 1 ELSE 0 END AS has_upload
     FROM agent_types WHERE project_id = ?`
  ).all(projectId);

  // Standalone diagram images (metadata only, no blob)
  const diagram_images = db.prepare(
    'SELECT id, project_id, x, y, width, height, filename, mime_type, label, view_id, created_at FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL) ORDER BY created_at'
  ).all(projectId, viewId);

  res.json({ devices, subnets, connections, subnet_memberships, node_preferences, legend_items, annotations, views, current_view_id: viewId, device_icon_overrides, type_default_icons, agent_types, diagram_images });
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
  publishSafe(projectId, 'diagram', 'updated');
  res.json({ ok: true });
});

router.put('/node-preferences', (req, res) => {
  const projectId = res.locals.projectId;
  const { nodeId, prefs } = req.body as { nodeId: string; prefs: Record<string, unknown> };
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
  const { items } = req.body as { items: unknown[] };
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
  publishSafe(projectId, 'diagram', 'updated');
  res.status(204).send();
});

router.delete('/subnet/:subnetId', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.query.view_id as string | undefined);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE subnet_id = ? AND view_id = ?').run(req.params.subnetId, viewId);
  publishSafe(projectId, 'diagram', 'updated');
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

type LayoutMode = 'all' | 'unplaced' | 'placed';
type LayoutDirection = 'vertical' | 'horizontal' | 'square';
type LayoutSpacing = 'compact' | 'normal' | 'spacious';
type LayoutSort = 'connected' | 'name' | 'created';

interface LayoutOpts {
  mode?: LayoutMode;
  direction?: LayoutDirection;
  subnetsPerRow?: number;
  devicesPerSubnetRow?: number;
  spacing?: LayoutSpacing;
  sort?: LayoutSort;
}

type LayoutResult = {
  subnetPositions: Array<{ id: number; x: number; y: number; width: number; height: number }>;
  devicePositions: Array<{ id: number; x: number; y: number }>;
  handleUpdates: Array<{ id: number; sourceHandle: string; targetHandle: string }>;
};

const SPACING_MULTIPLIERS: Record<LayoutSpacing, number> = {
  compact: 0.7,
  normal: 1,
  spacious: 1.4,
};

// Pure helper: compute grid positions for subnets/devices and edge-handle reassignments.
// Does not write to the DB. In 'unplaced' mode, items already in diagram_positions /
// subnet_diagram_positions for this view are left alone, and new items are placed below
// the existing layout. Returned positions are device-relative-to-subnet for in-subnet
// devices, matching the on-disk convention.
function computeGridLayout(projectId: number, viewId: number, opts: LayoutOpts = {}): LayoutResult {
  const mode: LayoutMode = opts.mode ?? 'all';
  const direction: LayoutDirection = opts.direction ?? 'vertical';
  const spacing: LayoutSpacing = opts.spacing ?? 'normal';
  const sort: LayoutSort = opts.sort ?? 'connected';
  const spaceMult = SPACING_MULTIPLIERS[spacing] ?? 1;
  const subnetsPerRow = Math.max(1, Math.min(12, Math.floor(opts.subnetsPerRow ?? 2)));
  const devicesPerSubnetRow = Math.max(1, Math.min(8, Math.floor(opts.devicesPerSubnetRow ?? 2)));

  const orderBy = sort === 'created' ? 'id' : 'name';
  const allSubnets = db.prepare(`SELECT id FROM subnets WHERE project_id = ? ORDER BY ${orderBy}`).all(projectId) as { id: number }[];
  const allDevices = db.prepare(`SELECT id, subnet_id FROM devices WHERE project_id = ? ORDER BY ${orderBy}`).all(projectId) as { id: number; subnet_id: number | null }[];

  type Conn = { id: number; source_device_id: number | null; target_device_id: number | null; source_subnet_id: number | null; target_subnet_id: number | null };
  const connections = db.prepare(
    'SELECT id, source_device_id, target_device_id, source_subnet_id, target_subnet_id FROM connections WHERE project_id = ?'
  ).all(projectId) as Conn[];

  // Existing positions are needed in 'unplaced' mode to skip placed items and to
  // reassign edge handles using the merged set of positions; in 'placed' mode
  // they're used to filter the layout down to items already on the diagram.
  const existingDevPos = new Map<number, { x: number; y: number }>();
  const existingSubPos = new Map<number, { x: number; y: number; width: number; height: number }>();
  if (mode === 'unplaced' || mode === 'placed') {
    const devRows = db.prepare(
      'SELECT dp.device_id, dp.x, dp.y FROM diagram_positions dp INNER JOIN devices d ON dp.device_id = d.id WHERE dp.view_id = ? AND d.project_id = ?'
    ).all(viewId, projectId) as { device_id: number; x: number; y: number }[];
    for (const r of devRows) existingDevPos.set(r.device_id, { x: r.x, y: r.y });
    const subRows = db.prepare(
      'SELECT sp.subnet_id, sp.x, sp.y, sp.width, sp.height FROM subnet_diagram_positions sp INNER JOIN subnets s ON sp.subnet_id = s.id WHERE sp.view_id = ? AND s.project_id = ?'
    ).all(viewId, projectId) as { subnet_id: number; x: number; y: number; width: number; height: number }[];
    for (const r of subRows) existingSubPos.set(r.subnet_id, { x: r.x, y: r.y, width: r.width, height: r.height });
  }

  const subnetsToPlace = mode === 'unplaced'
    ? allSubnets.filter(s => !existingSubPos.has(s.id))
    : mode === 'placed'
      ? allSubnets.filter(s => existingSubPos.has(s.id))
      : allSubnets;
  const devicesToPlace = mode === 'unplaced'
    ? allDevices.filter(d => !existingDevPos.has(d.id))
    : mode === 'placed'
      ? allDevices.filter(d => existingDevPos.has(d.id))
      : allDevices;

  const nodeW = 160;            // matches the device node's actual rendered width
  const nodeH = 120;
  const subnetGap = Math.round(150 * spaceMult); // vertical gap between subnet rows
  const devicePadX = Math.round(30 * spaceMult);
  const devicePadY = Math.round(60 * spaceMult);
  const deviceSpaceX = Math.round(300 * spaceMult);
  const deviceSpaceY = Math.round(240 * spaceMult);
  const minSubnetW = 360;
  const minSubnetH = 300;
  const bottomPad = 40;
  // Subnet width must be wide enough that every device in a row fits inside it.
  // React Flow's extent: 'parent' clamps overflowing devices to the right edge,
  // which manifests as visible overlap, so this bound is load-bearing.
  const subnetW = Math.max(
    minSubnetW,
    2 * devicePadX + (devicesPerSubnetRow - 1) * deviceSpaceX + nodeW,
  );
  // Inter-subnet stride tracks subnet width so columns don't collide as the
  // grid widens. 760 - 500 = 260 is the legacy gap with default knobs, so
  // this expression reproduces today's stride at cols=2, spacing=normal.
  const subnetGapX = subnetW + Math.round(260 * spaceMult);

  // Group devices by subnet. A device only nests inside a subnet if that subnet
  // is part of this layout pass (subnetsToPlace). In 'unplaced' mode that means
  // a device whose subnet is already-placed gets dropped into the orphan bucket
  // (we can't safely re-pack into an existing subnet). In 'placed' mode it
  // means a device whose subnet isn't on the diagram becomes orphaned.
  const subnetsToPlaceSet = new Set(subnetsToPlace.map(s => s.id));
  const devicesBySubnet = new Map<number, number[]>();
  const unassignedDevices: number[] = [];
  for (const d of devicesToPlace) {
    if (d.subnet_id && subnetsToPlaceSet.has(d.subnet_id)) {
      if (!devicesBySubnet.has(d.subnet_id)) devicesBySubnet.set(d.subnet_id, []);
      devicesBySubnet.get(d.subnet_id)!.push(d.id);
    } else {
      unassignedDevices.push(d.id);
    }
  }

  // BFS-order subnets so connected subnets end up adjacent in the grid (only when sort = 'connected'
  // — for 'name' / 'created' we keep the SELECT order so users get a predictable arrangement).
  let orderedSubnets: typeof subnetsToPlace;
  if (sort === 'connected') {
    const subnetEdges: Array<[number, number]> = connections
      .filter(c => c.source_subnet_id && c.target_subnet_id && !c.source_device_id && !c.target_device_id)
      .map(c => [c.source_subnet_id!, c.target_subnet_id!]);
    const orderedSubnetIds = bfsOrder(subnetsToPlace.map(s => s.id), subnetEdges);
    orderedSubnets = orderedSubnetIds.map(id => subnetsToPlace.find(s => s.id === id)!);

    // BFS-order devices within each subnet to minimise intra-subnet edge crossings
    for (const [subnetId, devIds] of devicesBySubnet) {
      const mySet = new Set(devIds);
      const intraEdges: Array<[number, number]> = connections
        .filter(c => c.source_device_id && c.target_device_id && mySet.has(c.source_device_id) && mySet.has(c.target_device_id))
        .map(c => [c.source_device_id!, c.target_device_id!]);
      devicesBySubnet.set(subnetId, bfsOrder(devIds, intraEdges));
    }
  } else {
    orderedSubnets = subnetsToPlace;
  }

  let orderedUnassigned: number[];
  if (sort === 'connected') {
    const unassignedSet = new Set(unassignedDevices);
    const unassignedEdges: Array<[number, number]> = connections
      .filter(c => c.source_device_id && c.target_device_id && unassignedSet.has(c.source_device_id) && unassignedSet.has(c.target_device_id))
      .map(c => [c.source_device_id!, c.target_device_id!]);
    orderedUnassigned = bfsOrder(unassignedDevices, unassignedEdges);
  } else {
    orderedUnassigned = unassignedDevices;
  }

  const calcSubnetH = (deviceCount: number): number => {
    if (deviceCount === 0) return 120;
    const rows = Math.ceil(deviceCount / devicesPerSubnetRow);
    return Math.max(minSubnetH, devicePadY + rows * deviceSpaceY + bottomPad);
  };

  // Origin for the new layout. In 'unplaced' mode, place new items below
  // anything already on the canvas to avoid overlap.
  let originY = 50;
  const originX = 50;
  if (mode === 'unplaced') {
    let maxBottom = 0;
    for (const p of existingSubPos.values()) maxBottom = Math.max(maxBottom, p.y + p.height);
    // For unassigned devices stored as absolute positions, use their bottom too
    const allDevSubnetMap = new Map<number, number | null>();
    for (const d of allDevices) allDevSubnetMap.set(d.id, d.subnet_id);
    for (const [devId, p] of existingDevPos) {
      if (allDevSubnetMap.get(devId) == null) {
        maxBottom = Math.max(maxBottom, p.y + 120);
      }
    }
    if (maxBottom > 0) originY = maxBottom + subnetGap;
  }

  const subnetHeights = orderedSubnets.map(s => calcSubnetH((devicesBySubnet.get(s.id) || []).length));

  // Resolve grid axis count from direction:
  //   vertical   -> cols = subnetsPerRow, fill row-major
  //   horizontal -> rows = subnetsPerRow (interpreted as subnets per column), fill column-major
  //   square     -> cols = ceil(sqrt(N)), fill row-major
  const N = orderedSubnets.length;
  const cols = direction === 'horizontal'
    ? Math.max(1, Math.ceil(N / Math.max(1, subnetsPerRow)))
    : direction === 'square'
      ? Math.max(1, Math.ceil(Math.sqrt(N)))
      : subnetsPerRow;
  const rows = direction === 'horizontal'
    ? subnetsPerRow
    : Math.max(1, Math.ceil(N / cols));

  // Compute (col, row) and per-row max-height (vertical/square) or per-column cumulative
  // y-offset (horizontal). Subnet width is fixed, so columns are uniform-width either way.
  const subnetPositions: Array<{ id: number; x: number; y: number; width: number; height: number }> = [];
  const newSubnetPos = new Map<number, { x: number; y: number; h: number }>();

  if (direction === 'horizontal') {
    // Fill column-major: subnet i goes to (col = floor(i / rows), row = i % rows).
    // Each column accumulates its own y-stack since rows are not aligned across columns.
    const colYCursor: number[] = new Array(cols).fill(originY);
    for (let i = 0; i < N; i++) {
      const col = Math.floor(i / rows);
      const x = col * subnetGapX + originX;
      const y = colYCursor[col];
      const h = subnetHeights[i];
      colYCursor[col] = y + h + subnetGap;
      subnetPositions.push({ id: orderedSubnets[i].id, x, y, width: subnetW, height: h });
      newSubnetPos.set(orderedSubnets[i].id, { x, y, h });
    }
  } else {
    // vertical or square: fill row-major with shared per-row max-height.
    const rowMaxH: number[] = [];
    for (let i = 0; i < N; i++) {
      const gridRow = Math.floor(i / cols);
      rowMaxH[gridRow] = Math.max(rowMaxH[gridRow] || 0, subnetHeights[i]);
    }
    const rowOffsets: number[] = [0];
    for (let r = 1; r < rowMaxH.length; r++) {
      rowOffsets[r] = rowOffsets[r - 1] + rowMaxH[r - 1] + subnetGap;
    }
    for (let i = 0; i < N; i++) {
      const col = i % cols;
      const gridRow = Math.floor(i / cols);
      const x = col * subnetGapX + originX;
      const y = originY + rowOffsets[gridRow];
      const h = rowMaxH[gridRow];
      subnetPositions.push({ id: orderedSubnets[i].id, x, y, width: subnetW, height: h });
      newSubnetPos.set(orderedSubnets[i].id, { x, y, h });
    }
  }

  const devicePositions: Array<{ id: number; x: number; y: number }> = [];
  for (const s of orderedSubnets) {
    const devIds = devicesBySubnet.get(s.id) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      devicePositions.push({ id: devIds[j], x: devicePadX + col * deviceSpaceX, y: devicePadY + row * deviceSpaceY });
    }
  }

  // Direction-agnostic bottom of the placed subnets — works for both vertical/square
  // (per-row max heights) and horizontal (per-column cumulative heights).
  let layoutBottom = originY;
  for (const s of subnetPositions) layoutBottom = Math.max(layoutBottom, s.y + s.height);
  const unassignedStartY = subnetPositions.length > 0 ? layoutBottom + subnetGap : originY;
  const unassignedCols = devicesPerSubnetRow;
  for (let i = 0; i < orderedUnassigned.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    devicePositions.push({ id: orderedUnassigned[i], x: col * deviceSpaceX + originX, y: unassignedStartY + row * deviceSpaceY });
  }

  // Build absolute-position maps spanning newly-placed and (in 'unplaced' mode)
  // existing items so handle reassignment uses real coordinates.
  const absDevPos = new Map<number, { x: number; y: number }>();
  const allSubAbsPos = new Map<number, { x: number; y: number; w: number; h: number }>();

  for (const s of orderedSubnets) {
    const sp = newSubnetPos.get(s.id)!;
    const devIds = devicesBySubnet.get(s.id) || [];
    for (let j = 0; j < devIds.length; j++) {
      const col = j % devicesPerSubnetRow;
      const row = Math.floor(j / devicesPerSubnetRow);
      absDevPos.set(devIds[j], { x: sp.x + devicePadX + col * deviceSpaceX, y: sp.y + devicePadY + row * deviceSpaceY });
    }
    allSubAbsPos.set(s.id, { x: sp.x, y: sp.y, w: subnetW, h: sp.h });
  }
  for (let i = 0; i < orderedUnassigned.length; i++) {
    const col = i % unassignedCols;
    const row = Math.floor(i / unassignedCols);
    absDevPos.set(orderedUnassigned[i], { x: col * deviceSpaceX + originX, y: unassignedStartY + row * deviceSpaceY });
  }
  if (mode === 'unplaced') {
    const devSubnetMap = new Map<number, number | null>();
    for (const d of allDevices) devSubnetMap.set(d.id, d.subnet_id);
    for (const [subId, p] of existingSubPos) {
      allSubAbsPos.set(subId, { x: p.x, y: p.y, w: p.width, h: p.height });
    }
    for (const [devId, p] of existingDevPos) {
      const subId = devSubnetMap.get(devId) ?? null;
      const subAbs = subId != null ? existingSubPos.get(subId) : undefined;
      if (subAbs) {
        absDevPos.set(devId, { x: subAbs.x + p.x, y: subAbs.y + p.y });
      } else {
        absDevPos.set(devId, { x: p.x, y: p.y });
      }
    }
  }

  const handleUpdates: Array<{ id: number; sourceHandle: string; targetHandle: string }> = [];
  for (const c of connections) {
    let srcCx: number | null = null, srcCy: number | null = null;
    let tgtCx: number | null = null, tgtCy: number | null = null;

    if (c.source_device_id && absDevPos.has(c.source_device_id)) {
      const p = absDevPos.get(c.source_device_id)!;
      srcCx = p.x + nodeW / 2; srcCy = p.y + nodeH / 2;
    } else if (c.source_subnet_id && allSubAbsPos.has(c.source_subnet_id)) {
      const sp = allSubAbsPos.get(c.source_subnet_id)!;
      srcCx = sp.x + sp.w / 2; srcCy = sp.y + sp.h / 2;
    }

    if (c.target_device_id && absDevPos.has(c.target_device_id)) {
      const p = absDevPos.get(c.target_device_id)!;
      tgtCx = p.x + nodeW / 2; tgtCy = p.y + nodeH / 2;
    } else if (c.target_subnet_id && allSubAbsPos.has(c.target_subnet_id)) {
      const sp = allSubAbsPos.get(c.target_subnet_id)!;
      tgtCx = sp.x + sp.w / 2; tgtCy = sp.y + sp.h / 2;
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

    handleUpdates.push({ id: c.id, sourceHandle, targetHandle });
  }

  return { subnetPositions, devicePositions, handleUpdates };
}

const updateHandle = db.prepare('UPDATE connections SET source_handle = ?, target_handle = ? WHERE id = ?');

function applyLayoutResult(viewId: number, result: LayoutResult): void {
  for (const s of result.subnetPositions) upsertSubnetPos.run(s.id, viewId, s.x, s.y, s.width, s.height);
  for (const d of result.devicePositions) upsertDevicePos.run(d.id, viewId, d.x, d.y);
  for (const h of result.handleUpdates) updateHandle.run(h.sourceHandle, h.targetHandle, h.id);
}

const autoGenerate = db.transaction((projectId: number, viewId: number, opts: LayoutOpts) => {
  // Destructive: clear positions, annotations, and standalone images for this view,
  // then place everything from scratch.
  db.prepare('DELETE FROM diagram_positions WHERE view_id = ? AND device_id IN (SELECT id FROM devices WHERE project_id = ?)').run(viewId, projectId);
  db.prepare('DELETE FROM subnet_diagram_positions WHERE view_id = ? AND subnet_id IN (SELECT id FROM subnets WHERE project_id = ?)').run(viewId, projectId);
  db.prepare('DELETE FROM diagram_annotations WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
  db.prepare('DELETE FROM diagram_images WHERE project_id = ? AND (view_id = ? OR view_id IS NULL)').run(projectId, viewId);
  applyLayoutResult(viewId, computeGridLayout(projectId, viewId, { ...opts, mode: 'all' }));
});

const autoLayout = db.transaction((projectId: number, viewId: number, opts: LayoutOpts) => {
  // Non-destructive: only writes positions (UPSERT) and reassigns edge handles.
  // Annotations and standalone images are left alone.
  applyLayoutResult(viewId, computeGridLayout(projectId, viewId, opts));
});

// Pull and validate layout knobs from the request body. Unknown values fall back to
// computeGridLayout's defaults; numbers are clamped there too, so we just coerce shape.
function parseLayoutOpts(body: Record<string, unknown>): LayoutOpts {
  const opts: LayoutOpts = {};
  if (body.direction === 'horizontal' || body.direction === 'square' || body.direction === 'vertical') {
    opts.direction = body.direction;
  }
  if (body.spacing === 'compact' || body.spacing === 'spacious' || body.spacing === 'normal') {
    opts.spacing = body.spacing;
  }
  if (body.sort === 'name' || body.sort === 'created' || body.sort === 'connected') {
    opts.sort = body.sort;
  }
  if (typeof body.subnetsPerRow === 'number' && Number.isFinite(body.subnetsPerRow)) {
    opts.subnetsPerRow = body.subnetsPerRow;
  }
  if (typeof body.devicesPerSubnetRow === 'number' && Number.isFinite(body.devicesPerSubnetRow)) {
    opts.devicesPerSubnetRow = body.devicesPerSubnetRow;
  }
  return opts;
}

router.post('/auto-generate', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id ?? req.query.view_id);
  try {
    autoGenerate(projectId, viewId, parseLayoutOpts(req.body));
    publishSafe(projectId, 'diagram', 'updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Auto-generate failed:', err);
    res.status(500).json({ error: 'Auto-generate layout failed' });
  }
});

router.post('/auto-layout', (req, res) => {
  const projectId = res.locals.projectId;
  const viewId = getViewId(projectId, req.body.view_id ?? req.query.view_id);
  const mode: LayoutMode =
    req.body.mode === 'unplaced' ? 'unplaced'
    : req.body.mode === 'placed' ? 'placed'
    : 'all';
  try {
    autoLayout(projectId, viewId, { ...parseLayoutOpts(req.body), mode });
    publishSafe(projectId, 'diagram', 'updated');
    res.json({ success: true });
  } catch (err) {
    console.error('Auto-layout failed:', err);
    res.status(500).json({ error: 'Auto-layout failed' });
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
  const prefsByKey: Record<string, unknown> = {};
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
  ).all(projectId, viewId) as { x: number; y: number; width: number; height: number; filename: string; mime_type: string; data: string; label: string | null }[];

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
    images: images.map(img => ({ x: img.x, y: img.y, width: img.width, height: img.height, filename: img.filename, mimeType: img.mime_type, data: img.data, label: img.label })),
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

      type ImportDevice = { name?: unknown; x?: number; y?: number; prefs?: unknown };
      type ImportSubnet = { name?: unknown; x?: number; y?: number; width?: number; height?: number; prefs?: unknown };
      type ImportConn = { sourceDevice?: string; targetDevice?: string; sourceSubnet?: string; targetSubnet?: string; label?: string | null; connectionType?: string | null; edgeType?: string | null; edgeColor?: string | null; edgeWidth?: number | null; labelColor?: string | null; labelBgColor?: string | null; sourcePort?: string | null; targetPort?: string | null };
      type ImportAnnotation = { x?: unknown; y?: unknown; text?: string; fontSize?: number; color?: string | null };
      type ImportImage = { data?: string; filename?: string; x?: number; y?: number; width?: number; height?: number; mimeType?: string; label?: string | null };

      for (const d of (body.devices ?? []) as ImportDevice[]) {
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

      for (const s of (body.subnets ?? []) as ImportSubnet[]) {
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
      for (const c of (body.connections ?? []) as ImportConn[]) {
        const srcDevId = c.sourceDevice ? (deviceByName.get(c.sourceDevice) ?? null) : null;
        const tgtDevId = c.targetDevice ? (deviceByName.get(c.targetDevice) ?? null) : null;
        const srcSubId = c.sourceSubnet ? (subnetByName.get(c.sourceSubnet) ?? null) : null;
        const tgtSubId = c.targetSubnet ? (subnetByName.get(c.targetSubnet) ?? null) : null;
        // Require both source and target to resolve to a known device or subnet
        if (srcDevId == null && srcSubId == null) { skippedConnections.push(`${c.sourceDevice ?? c.sourceSubnet ?? '?'} -> ${c.targetDevice ?? c.targetSubnet ?? '?'}`); continue; }
        if (tgtDevId == null && tgtSubId == null) { skippedConnections.push(`${c.sourceDevice ?? c.sourceSubnet ?? '?'} -> ${c.targetDevice ?? c.targetSubnet ?? '?'}`); continue; }
        connInsert.run(srcDevId, tgtDevId, srcSubId, tgtSubId, c.label ?? null, c.connectionType ?? null, c.edgeType ?? null, c.edgeColor ?? null, c.edgeWidth ?? null, c.labelColor ?? null, c.labelBgColor ?? null, c.sourcePort ?? null, c.targetPort ?? null, projectId);
      }

      for (const a of (body.annotations ?? []) as ImportAnnotation[]) {
        if (typeof a.x !== 'number' || typeof a.y !== 'number') continue;
        db.prepare('INSERT INTO diagram_annotations (project_id, view_id, x, y, text, font_size, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(projectId, viewId, a.x, a.y, a.text ?? '', a.fontSize ?? 14, a.color ?? null);
      }

      for (const img of (body.images ?? []) as ImportImage[]) {
        if (!img.data || !img.filename) continue;
        db.prepare('INSERT INTO diagram_images (project_id, view_id, x, y, width, height, filename, mime_type, data, label) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(projectId, viewId, img.x ?? 0, img.y ?? 0, img.width ?? 200, img.height ?? 150, img.filename, img.mimeType ?? 'image/png', img.data, img.label ?? null);
      }

      if (Array.isArray(body.legendItems)) {
        db.prepare(`INSERT INTO diagram_legend (project_id, items) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET items = excluded.items`)
          .run(projectId, JSON.stringify(body.legendItems));
      }
    })();

    publishSafe(projectId, 'diagram', 'updated');
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
  const annotation = db.prepare('SELECT * FROM diagram_annotations WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as Record<string, unknown> | undefined;
  if (!annotation) return res.status(404).json({ error: 'Annotation not found' });
  db.prepare('DELETE FROM diagram_annotations WHERE id = ?').run(req.params.id);
  // Annotations are flat — capturing the row in previous_state is enough for
  // a clean undo via the dispatch handler in undo.ts.
  logActivity({
    projectId, action: 'deleted', resourceType: 'annotation',
    resourceId: Number(req.params.id),
    resourceName: typeof annotation.text === 'string' ? annotation.text.slice(0, 80) : null,
    previousState: { annotation },
    canUndo: true,
  });
  res.status(204).send();
});

export default router;
