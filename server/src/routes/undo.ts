import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router({ mergeParams: true });

interface LogRow {
  id: number;
  project_id: number | null;
  action: string;
  resource_type: string;
  resource_id: number | null;
  resource_name: string | null;
  previous_state: string | null;
  can_undo: number;
  undone_at: string | null;
}

type UndoResult = { ok: true; resourceId: number | null } | { ok: false; status: number; error: string };

type UndoHandler = (log: LogRow, previousState: Record<string, unknown>, projectId: number) => UndoResult;

// Restore a deleted device, including its IPs, tags, and the cascading
// state captured by devices.ts (connections, diagram positions, icon
// override, device_subnets junction, router configs, command outputs).
//
// Connections are best-effort: if a referenced peer device was deleted
// between this device's delete and now, that connection is dropped silently
// so we can still restore the device itself rather than failing the whole
// undo. Same logic for hypervisor_id.
function undoDeviceDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const device = state.device as Record<string, unknown> | undefined;
  if (!device || !device.id) return { ok: false, status: 400, error: 'Missing device state' };
  if (device.project_id !== projectId) return { ok: false, status: 403, error: 'Device does not belong to this project' };

  const existing = db.prepare('SELECT id FROM devices WHERE id = ?').get(device.id);
  if (existing) return { ok: false, status: 409, error: 'A device with this id already exists — cannot restore' };

  const ips = Array.isArray(state.ips) ? state.ips as Record<string, unknown>[] : [];
  const tags = Array.isArray(state.tags) ? state.tags as string[] : [];
  const connections = Array.isArray(state.connections) ? state.connections as Record<string, unknown>[] : [];
  const diagramPositions = Array.isArray(state.diagram_positions) ? state.diagram_positions as Record<string, unknown>[] : [];
  const iconOverride = state.icon_override as Record<string, unknown> | null | undefined;
  const deviceSubnets = Array.isArray(state.device_subnets) ? state.device_subnets as Record<string, unknown>[] : [];
  const routerConfigs = Array.isArray(state.router_configs) ? state.router_configs as Record<string, unknown>[] : [];
  const commandOutputs = Array.isArray(state.command_outputs) ? state.command_outputs as Record<string, unknown>[] : [];

  // Hypervisor self-FK: clear if the referenced device is gone.
  let hypervisorId = device.hypervisor_id ?? null;
  if (hypervisorId) {
    const hv = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(hypervisorId);
    if (!hv) hypervisorId = null;
  }
  // Subnet FK is ON DELETE SET NULL but might point to a since-deleted subnet.
  let subnetId = device.subnet_id ?? null;
  if (subnetId) {
    const s = db.prepare('SELECT 1 FROM subnets WHERE id = ?').get(subnetId);
    if (!s) subnetId = null;
  }

  db.prepare(
    `INSERT INTO devices (id, name, type, mac_address, os, hostname, domain, location, notes, subnet_id, hosting_type, hypervisor_id, project_id, section_config, rich_notes, av, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    device.id, device.name, device.type,
    device.mac_address ?? null, device.os ?? null,
    device.hostname ?? null, device.domain ?? null,
    device.location ?? null, device.notes ?? null,
    subnetId, device.hosting_type ?? null, hypervisorId,
    device.project_id,
    device.section_config ?? null, device.rich_notes ?? null, device.av ?? null, device.status ?? null,
    device.created_at ?? null, device.updated_at ?? null,
  );

  const insertIp = db.prepare('INSERT INTO device_ips (device_id, ip_address, label, is_primary, dhcp) VALUES (?, ?, ?, ?, ?)');
  for (const ip of ips) {
    insertIp.run(device.id, ip.ip_address, ip.label ?? null, ip.is_primary ? 1 : 0, ip.dhcp ? 1 : 0);
  }

  const insertTag = db.prepare('INSERT INTO device_tags (device_id, tag) VALUES (?, ?)');
  for (const tag of tags) {
    insertTag.run(device.id, tag);
  }

  // Diagram positions per view. INSERT OR IGNORE so an existing position
  // (e.g. the user already placed a new device with this id, unlikely but
  // possible) doesn't blow up the whole undo.
  const insertPos = db.prepare(
    'INSERT OR IGNORE INTO diagram_positions (device_id, view_id, x, y) VALUES (?, ?, ?, ?)'
  );
  for (const p of diagramPositions) {
    if (!p.view_id) continue;
    insertPos.run(device.id, p.view_id, p.x ?? 0, p.y ?? 0);
  }

  // Icon override.
  if (iconOverride) {
    db.prepare(
      `INSERT INTO device_icon_overrides (device_id, project_id, icon_source, library_id, library_icon_key, color, filename, mime_type, file_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(device_id, project_id) DO UPDATE SET
         icon_source = excluded.icon_source,
         library_id = excluded.library_id,
         library_icon_key = excluded.library_icon_key,
         color = excluded.color,
         filename = excluded.filename,
         mime_type = excluded.mime_type,
         file_path = excluded.file_path`
    ).run(
      device.id, projectId,
      iconOverride.icon_source ?? 'upload',
      iconOverride.library_id ?? null,
      iconOverride.library_icon_key ?? null,
      iconOverride.color ?? null,
      iconOverride.filename ?? null,
      iconOverride.mime_type ?? null,
      iconOverride.file_path ?? null,
    );
  }

  // device_subnets junction (best-effort: drop pairs whose subnet is gone).
  const insertJunction = db.prepare('INSERT OR IGNORE INTO device_subnets (device_id, subnet_id) VALUES (?, ?)');
  for (const j of deviceSubnets) {
    if (!j.subnet_id) continue;
    const sExists = db.prepare('SELECT 1 FROM subnets WHERE id = ?').get(j.subnet_id);
    if (!sExists) continue;
    insertJunction.run(device.id, j.subnet_id);
  }

  // Router configs (parsed_router_* are NOT restored — re-parsing is the user's call).
  if (routerConfigs.length) {
    const insertRC = db.prepare(
      `INSERT INTO router_configs (id, device_id, project_id, vendor, raw_config, captured_at, title, parse_output, hostname, os_version, model, domain, timezone, ntp_servers, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const rc of routerConfigs) {
      insertRC.run(
        rc.id, device.id, projectId,
        rc.vendor, rc.raw_config, rc.captured_at,
        rc.title ?? null, rc.parse_output ?? 1,
        rc.hostname ?? null, rc.os_version ?? null, rc.model ?? null,
        rc.domain ?? null, rc.timezone ?? null, rc.ntp_servers ?? null,
        rc.updated_at ?? '1970-01-01 00:00:00',
      );
    }
  }

  // Command outputs (raw only — parsed_* tables stay empty until the user
  // triggers a re-parse).
  if (commandOutputs.length) {
    const insertCO = db.prepare(
      `INSERT INTO command_outputs (id, device_id, command_type, raw_output, captured_at, project_id, title, parse_output, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const co of commandOutputs) {
      insertCO.run(
        co.id, device.id, co.command_type, co.raw_output,
        co.captured_at, co.project_id ?? projectId,
        co.title ?? null, co.parse_output ?? 1,
        co.updated_at ?? '1970-01-01 00:00:00',
      );
    }
  }

  // Connections — restore only those where both endpoints still exist.
  // Anything skipped is a non-fatal partial restore.
  if (connections.length) {
    const insertConn = db.prepare(
      `INSERT INTO connections (id, source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, source_port, target_port, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of connections) {
      const idExists = db.prepare('SELECT 1 FROM connections WHERE id = ?').get(c.id);
      if (idExists) continue;
      if (c.source_device_id) {
        const exists = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(c.source_device_id);
        if (!exists) continue;
      }
      if (c.target_device_id) {
        const exists = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(c.target_device_id);
        if (!exists) continue;
      }
      if (c.source_subnet_id) {
        const exists = db.prepare('SELECT 1 FROM subnets WHERE id = ?').get(c.source_subnet_id);
        if (!exists) continue;
      }
      if (c.target_subnet_id) {
        const exists = db.prepare('SELECT 1 FROM subnets WHERE id = ?').get(c.target_subnet_id);
        if (!exists) continue;
      }
      insertConn.run(
        c.id,
        c.source_device_id ?? null, c.target_device_id ?? null,
        c.source_subnet_id ?? null, c.target_subnet_id ?? null,
        c.label ?? null, c.connection_type ?? 'ethernet',
        c.edge_type ?? 'default', c.edge_color ?? null, c.edge_width ?? null,
        c.label_color ?? null, c.label_bg_color ?? null,
        c.source_handle ?? null, c.target_handle ?? null,
        c.source_port ?? null, c.target_port ?? null,
        c.project_id ?? projectId,
        c.created_at ?? null, c.updated_at ?? '1970-01-01 00:00:00',
      );
    }
  }

  return { ok: true, resourceId: Number(device.id) };
}

function undoSubnetDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const subnet = state.subnet as Record<string, unknown> | undefined;
  if (!subnet || !subnet.id) return { ok: false, status: 400, error: 'Missing subnet state' };
  if (subnet.project_id !== projectId) return { ok: false, status: 403, error: 'Subnet does not belong to this project' };

  const existing = db.prepare('SELECT id FROM subnets WHERE id = ?').get(subnet.id);
  if (existing) return { ok: false, status: 409, error: 'A subnet with this id already exists — cannot restore' };

  const deviceSubnetIds = Array.isArray(state.device_subnet_ids) ? state.device_subnet_ids as number[] : [];
  const positions = Array.isArray(state.subnet_diagram_positions) ? state.subnet_diagram_positions as Record<string, unknown>[] : [];
  const junctions = Array.isArray(state.device_subnets) ? state.device_subnets as Record<string, unknown>[] : [];
  const connections = Array.isArray(state.connections) ? state.connections as Record<string, unknown>[] : [];

  db.prepare(
    `INSERT INTO subnets (id, name, cidr, vlan_id, description, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    subnet.id, subnet.name, subnet.cidr,
    subnet.vlan_id ?? null, subnet.description ?? null,
    subnet.project_id,
    subnet.created_at ?? null, subnet.updated_at ?? null,
  );

  // Re-attach devices that lived in this subnet at delete time and still exist.
  // Devices that were themselves deleted afterwards stay orphaned (subnet_id
  // stays NULL); devices that have since been moved to a different subnet
  // are NOT bumped — only devices currently with subnet_id IS NULL get
  // re-linked, otherwise we'd silently overwrite the user's intent.
  if (deviceSubnetIds.length) {
    const reattach = db.prepare(
      'UPDATE devices SET subnet_id = ? WHERE id = ? AND project_id = ? AND subnet_id IS NULL'
    );
    for (const did of deviceSubnetIds) {
      reattach.run(subnet.id, did, projectId);
    }
  }

  // Subnet diagram positions per view.
  if (positions.length) {
    const insertPos = db.prepare(
      'INSERT OR IGNORE INTO subnet_diagram_positions (subnet_id, view_id, x, y, width, height) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const p of positions) {
      if (!p.view_id) continue;
      insertPos.run(subnet.id, p.view_id, p.x ?? 0, p.y ?? 0, p.width ?? 400, p.height ?? 300);
    }
  }

  // device_subnets junction.
  if (junctions.length) {
    const insertJ = db.prepare('INSERT OR IGNORE INTO device_subnets (device_id, subnet_id) VALUES (?, ?)');
    for (const j of junctions) {
      if (!j.device_id) continue;
      const dev = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(j.device_id);
      if (!dev) continue;
      insertJ.run(j.device_id, subnet.id);
    }
  }

  // Connections that referenced this subnet — best-effort restore.
  if (connections.length) {
    const insertConn = db.prepare(
      `INSERT INTO connections (id, source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, source_port, target_port, project_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const c of connections) {
      const idExists = db.prepare('SELECT 1 FROM connections WHERE id = ?').get(c.id);
      if (idExists) continue;
      if (c.source_device_id) {
        const exists = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(c.source_device_id);
        if (!exists) continue;
      }
      if (c.target_device_id) {
        const exists = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(c.target_device_id);
        if (!exists) continue;
      }
      // The peer subnet (the one that wasn't this subnet) must still exist.
      const otherSubnet: unknown = c.source_subnet_id === subnet.id ? c.target_subnet_id : c.source_subnet_id;
      if (otherSubnet && otherSubnet !== subnet.id) {
        const exists = db.prepare('SELECT 1 FROM subnets WHERE id = ?').get(otherSubnet);
        if (!exists) continue;
      }
      insertConn.run(
        c.id,
        c.source_device_id ?? null, c.target_device_id ?? null,
        c.source_subnet_id ?? null, c.target_subnet_id ?? null,
        c.label ?? null, c.connection_type ?? 'ethernet',
        c.edge_type ?? 'default', c.edge_color ?? null, c.edge_width ?? null,
        c.label_color ?? null, c.label_bg_color ?? null,
        c.source_handle ?? null, c.target_handle ?? null,
        c.source_port ?? null, c.target_port ?? null,
        c.project_id ?? projectId,
        c.created_at ?? null, c.updated_at ?? '1970-01-01 00:00:00',
      );
    }
  }

  return { ok: true, resourceId: Number(subnet.id) };
}

function undoAnnotationDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const a = state.annotation as Record<string, unknown> | undefined;
  if (!a || !a.id) return { ok: false, status: 400, error: 'Missing annotation state' };
  if (a.project_id !== projectId) return { ok: false, status: 403, error: 'Annotation does not belong to this project' };

  const existing = db.prepare('SELECT id FROM diagram_annotations WHERE id = ?').get(a.id);
  if (existing) return { ok: false, status: 409, error: 'An annotation with this id already exists — cannot restore' };

  // view_id is nullable but if set must reference a still-existing view.
  let viewId = a.view_id ?? null;
  if (viewId) {
    const v = db.prepare('SELECT 1 FROM diagram_views WHERE id = ?').get(viewId);
    if (!v) viewId = null;
  }

  db.prepare(
    `INSERT INTO diagram_annotations (id, project_id, x, y, text, font_size, color, view_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    a.id, a.project_id, a.x ?? 0, a.y ?? 0,
    a.text ?? '', a.font_size ?? 14, a.color ?? null,
    viewId, a.created_at ?? null,
  );

  return { ok: true, resourceId: Number(a.id) };
}

function undoAgentAnnotationDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const a = state.annotation as Record<string, unknown> | undefined;
  if (!a || !a.id) return { ok: false, status: 400, error: 'Missing agent annotation state' };
  if (a.project_id !== projectId) return { ok: false, status: 403, error: 'Annotation does not belong to this project' };

  const existing = db.prepare('SELECT id FROM agent_diagram_annotations WHERE id = ?').get(a.id);
  if (existing) return { ok: false, status: 409, error: 'An agent annotation with this id already exists — cannot restore' };

  let viewId = a.view_id ?? null;
  if (viewId) {
    const v = db.prepare('SELECT 1 FROM agent_diagram_views WHERE id = ?').get(viewId);
    if (!v) viewId = null;
  }

  db.prepare(
    `INSERT INTO agent_diagram_annotations (id, project_id, x, y, text, font_size, color, view_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    a.id, a.project_id, a.x ?? 0, a.y ?? 0,
    a.text ?? '', a.font_size ?? 14, a.color ?? null,
    viewId, a.created_at ?? null,
  );

  return { ok: true, resourceId: Number(a.id) };
}

function undoConnectionDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const connection = state.connection as Record<string, unknown> | undefined;
  if (!connection || !connection.id) return { ok: false, status: 400, error: 'Missing connection state' };
  if (connection.project_id !== projectId) return { ok: false, status: 403, error: 'Connection does not belong to this project' };

  const existing = db.prepare('SELECT id FROM connections WHERE id = ?').get(connection.id);
  if (existing) return { ok: false, status: 409, error: 'A connection with this id already exists — cannot restore' };

  // Both endpoints must still exist or the FK will fail. Surface a friendly error.
  if (connection.source_device_id) {
    const src = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(connection.source_device_id);
    if (!src) return { ok: false, status: 409, error: 'Source device no longer exists — cannot restore connection' };
  }
  if (connection.target_device_id) {
    const tgt = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(connection.target_device_id);
    if (!tgt) return { ok: false, status: 409, error: 'Target device no longer exists — cannot restore connection' };
  }

  db.prepare(
    `INSERT INTO connections (id, source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, source_port, target_port, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    connection.id,
    connection.source_device_id ?? null, connection.target_device_id ?? null,
    connection.source_subnet_id ?? null, connection.target_subnet_id ?? null,
    connection.label ?? null, connection.connection_type ?? 'ethernet',
    connection.edge_type ?? 'default', connection.edge_color ?? null, connection.edge_width ?? null,
    connection.label_color ?? null, connection.label_bg_color ?? null,
    connection.source_handle ?? null, connection.target_handle ?? null,
    connection.source_port ?? null, connection.target_port ?? null,
    connection.project_id,
    connection.created_at ?? null, connection.updated_at ?? null,
  );

  return { ok: true, resourceId: Number(connection.id) };
}

function undoCredentialDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const c = state.credential as Record<string, unknown> | undefined;
  if (!c || !c.id) return { ok: false, status: 400, error: 'Missing credential state' };
  if (c.project_id !== projectId) return { ok: false, status: 403, error: 'Credential does not belong to this project' };

  const existing = db.prepare('SELECT id FROM credentials WHERE id = ?').get(c.id);
  if (existing) return { ok: false, status: 409, error: 'A credential with this id already exists — cannot restore' };

  const fileData = typeof c.file_data === 'string' ? Buffer.from(c.file_data, 'base64') : null;

  db.prepare(
    `INSERT INTO credentials (id, device_id, host, username, password, type, source, file_name, file_data, used, hidden, project_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    c.id, c.device_id ?? null, c.host ?? null, c.username, c.password ?? null,
    c.type ?? null, c.source ?? null, c.file_name ?? null, fileData,
    (c.used as number | undefined) ?? 0, (c.hidden as number | undefined) ?? 0,
    c.project_id, c.created_at ?? null, c.updated_at ?? null,
  );

  // Replay password history rows captured at delete time. Best-effort:
  // a single bad row doesn't block restoring the credential itself.
  const history = Array.isArray(state.history) ? (state.history as Record<string, unknown>[]) : [];
  if (history.length) {
    const insertHistory = db.prepare(
      `INSERT INTO credential_password_history (id, credential_id, project_id, password, file_name, file_data, status, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const h of history) {
      const hFileData = typeof h.file_data === 'string' ? Buffer.from(h.file_data as string, 'base64') : null;
      try {
        insertHistory.run(
          h.id ?? null, c.id, projectId,
          h.password ?? null, h.file_name ?? null, hFileData,
          h.status ?? 'previous', h.note ?? null, h.created_at ?? null,
        );
      } catch (err) {
        console.warn(`[undo] failed to replay history row ${h.id} for credential ${c.id}:`, err);
      }
    }
  }

  return { ok: true, resourceId: Number(c.id) };
}

function undoTimelineEntryDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const entry = state.entry as Record<string, unknown> | undefined;
  if (!entry || !entry.id) return { ok: false, status: 400, error: 'Missing timeline entry state' };
  if (entry.project_id !== projectId) return { ok: false, status: 403, error: 'Timeline entry does not belong to this project' };

  const existing = db.prepare('SELECT id FROM timeline_entries WHERE id = ?').get(entry.id);
  if (existing) return { ok: false, status: 409, error: 'A timeline entry with this id already exists — cannot restore' };

  db.prepare(
    `INSERT INTO timeline_entries (id, project_id, title, description, event_date, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.id, entry.project_id, entry.title,
    entry.description ?? null,
    entry.event_date, entry.category ?? 'general',
    entry.created_at ?? null, entry.updated_at ?? null,
  );

  return { ok: true, resourceId: Number(entry.id) };
}

function undoAgentDelete(log: LogRow, state: Record<string, unknown>, projectId: number): UndoResult {
  const a = state.agent as Record<string, unknown> | undefined;
  if (!a || !a.id) return { ok: false, status: 400, error: 'Missing agent state' };
  if (a.project_id !== projectId) return { ok: false, status: 403, error: 'Agent does not belong to this project' };

  const existing = db.prepare('SELECT id FROM agents WHERE id = ?').get(a.id);
  if (existing) return { ok: false, status: 409, error: 'An agent with this id already exists — cannot restore' };

  // If the device was also deleted between delete-and-restore, leave device_id null
  // so the FK ON DELETE SET NULL semantics are preserved after the fact.
  let deviceId = a.device_id ?? null;
  if (deviceId) {
    const dev = db.prepare('SELECT 1 FROM devices WHERE id = ?').get(deviceId);
    if (!dev) deviceId = null;
  }

  db.prepare(
    `INSERT INTO agents (id, project_id, name, agent_type, device_id, checkin_schedule, config, disk_path, status, version, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    a.id, a.project_id, a.name, a.agent_type, deviceId,
    a.checkin_schedule ?? null, a.config ?? null, a.disk_path ?? null,
    a.status ?? 'active', a.version ?? null, a.notes ?? null,
    a.created_at ?? null, a.updated_at ?? null,
  );

  return { ok: true, resourceId: Number(a.id) };
}

// Key is "resourceType:action". Add entries here as more routes get instrumented.
const dispatch: Record<string, UndoHandler> = {
  'device:deleted': undoDeviceDelete,
  'subnet:deleted': undoSubnetDelete,
  'connection:deleted': undoConnectionDelete,
  'credential:deleted': undoCredentialDelete,
  'agent:deleted': undoAgentDelete,
  'timeline_entry:deleted': undoTimelineEntryDelete,
  'annotation:deleted': undoAnnotationDelete,
  'agent_annotation:deleted': undoAgentAnnotationDelete,
};

router.post('/:logId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId as number;
  const logId = Number(req.params.logId);
  if (!Number.isFinite(logId)) return res.status(400).json({ error: 'Invalid log id' });

  const log = db.prepare(
    `SELECT id, project_id, action, resource_type, resource_id, resource_name, previous_state, can_undo, undone_at
     FROM activity_logs WHERE id = ? AND project_id = ?`
  ).get(logId, projectId) as LogRow | undefined;

  if (!log) return res.status(404).json({ error: 'Activity log entry not found' });
  if (!log.can_undo) return res.status(400).json({ error: 'This action cannot be undone' });
  if (log.undone_at) return res.status(400).json({ error: 'This action has already been undone' });

  const handler = dispatch[`${log.resource_type}:${log.action}`];
  if (!handler) return res.status(400).json({ error: `Undo not supported for ${log.action} ${log.resource_type}` });

  let parsed: Record<string, unknown>;
  try {
    parsed = log.previous_state ? JSON.parse(log.previous_state) : {};
  } catch {
    return res.status(500).json({ error: 'Previous state is corrupted' });
  }

  const runUndo = db.transaction(() => {
    const result = handler(log, parsed, projectId);
    if (!result.ok) return result;
    db.prepare(`UPDATE activity_logs SET undone_at = datetime('now'), can_undo = 0 WHERE id = ?`).run(log.id);
    return result;
  });

  const result = runUndo();
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  logActivity({
    projectId,
    action: 'undone',
    resourceType: log.resource_type,
    resourceId: result.resourceId,
    resourceName: log.resource_name,
    details: { undone_log_id: log.id, original_action: log.action },
  });

  res.json({ success: true, resource_id: result.resourceId, log_id: log.id });
}));

export default router;
