import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';

const router = Router({ mergeParams: true });

/** Build parameterized IN clause: returns { ph: '?,?,?', params: [1,2,3] } */
function inParams(ids: number[]) {
  return { ph: ids.map(() => '?').join(','), params: ids };
}

router.get('/export', (_req, res) => {
  const includeCommandOutputs = _req.query.includeCommandOutputs !== 'false';
  const includeCredentials = _req.query.includeCredentials !== 'false';
  const includeImages = _req.query.includeImages !== 'false';
  const projectId = res.locals.projectId as number | undefined;

  let data: Record<string, unknown[]>;

  if (projectId) {
    // Project-scoped export
    const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
    const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

    data = {
      subnets: db.prepare('SELECT * FROM subnets WHERE project_id = ?').all(projectId),
      devices: db.prepare('SELECT * FROM devices WHERE project_id = ?').all(projectId),
      device_ips: deviceIds.length ? db.prepare(`SELECT * FROM device_ips WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      device_tags: deviceIds.length ? db.prepare(`SELECT * FROM device_tags WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      device_subnets: deviceIds.length ? db.prepare(`SELECT * FROM device_subnets WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      connections: db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId),
      diagram_positions: deviceIds.length ? db.prepare(`SELECT * FROM diagram_positions WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      subnet_diagram_positions: subnetIds.length ? db.prepare(`SELECT * FROM subnet_diagram_positions WHERE subnet_id IN (${inParams(subnetIds).ph})`).all(...subnetIds) : [],
      highlight_rules: db.prepare('SELECT * FROM highlight_rules WHERE project_id = ?').all(projectId),
      command_outputs: includeCommandOutputs ? db.prepare('SELECT * FROM command_outputs WHERE project_id = ?').all(projectId) : [],
      parsed_processes: [],
      parsed_connections: [],
      parsed_logins: [],
      parsed_interfaces: [],
      parsed_mounts: [],
      parsed_routes: [],
      parsed_services: [],
      router_configs: includeCommandOutputs ? db.prepare('SELECT * FROM router_configs WHERE project_id = ?').all(projectId) : [],
      parsed_router_interfaces: [],
      parsed_router_vlans: [],
      parsed_router_static_routes: [],
      parsed_router_acls: [],
      parsed_router_nat_rules: [],
      parsed_router_dhcp_pools: [],
      parsed_router_users: [],
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials WHERE project_id = ?').all(projectId) : [],
      device_type_icons: includeImages ? db.prepare('SELECT * FROM device_type_icons WHERE project_id = ?').all(projectId) : [],
      device_icon_overrides: includeImages && deviceIds.length ? db.prepare(`SELECT * FROM device_icon_overrides WHERE device_id IN (${inParams(deviceIds).ph})`).all(...deviceIds) : [],
      diagram_images: includeImages ? db.prepare('SELECT * FROM diagram_images WHERE project_id = ?').all(projectId) : [],
      agent_type_icons: includeImages ? db.prepare('SELECT * FROM agent_type_icons WHERE project_id = ?').all(projectId) : [],
    };

    if (includeCommandOutputs) {
      const outputIds = (data.command_outputs as any[]).map(o => o.id);
      if (outputIds.length) {
        const { ph } = inParams(outputIds);
        data.parsed_processes = db.prepare(`SELECT * FROM parsed_processes WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_connections = db.prepare(`SELECT * FROM parsed_connections WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_logins = db.prepare(`SELECT * FROM parsed_logins WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_interfaces = db.prepare(`SELECT * FROM parsed_interfaces WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_mounts = db.prepare(`SELECT * FROM parsed_mounts WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_routes = db.prepare(`SELECT * FROM parsed_routes WHERE output_id IN (${ph})`).all(...outputIds);
        data.parsed_services = db.prepare(`SELECT * FROM parsed_services WHERE output_id IN (${ph})`).all(...outputIds);
      }
      const configIds = (data.router_configs as any[]).map(c => c.id);
      if (configIds.length) {
        const { ph } = inParams(configIds);
        data.parsed_router_interfaces = db.prepare(`SELECT * FROM parsed_router_interfaces WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_vlans = db.prepare(`SELECT * FROM parsed_router_vlans WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_static_routes = db.prepare(`SELECT * FROM parsed_router_static_routes WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_acls = db.prepare(`SELECT * FROM parsed_router_acls WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_nat_rules = db.prepare(`SELECT * FROM parsed_router_nat_rules WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_dhcp_pools = db.prepare(`SELECT * FROM parsed_router_dhcp_pools WHERE config_id IN (${ph})`).all(...configIds);
        data.parsed_router_users = db.prepare(`SELECT * FROM parsed_router_users WHERE config_id IN (${ph})`).all(...configIds);
      }
    }
  } else {
    // Full-site export
    data = {
      projects: db.prepare('SELECT * FROM projects').all(),
      subnets: db.prepare('SELECT * FROM subnets').all(),
      devices: db.prepare('SELECT * FROM devices').all(),
      device_ips: db.prepare('SELECT * FROM device_ips').all(),
      device_tags: db.prepare('SELECT * FROM device_tags').all(),
      device_subnets: db.prepare('SELECT * FROM device_subnets').all(),
      connections: db.prepare('SELECT * FROM connections').all(),
      diagram_positions: db.prepare('SELECT * FROM diagram_positions').all(),
      subnet_diagram_positions: db.prepare('SELECT * FROM subnet_diagram_positions').all(),
      highlight_rules: db.prepare('SELECT * FROM highlight_rules').all(),
      command_outputs: includeCommandOutputs ? db.prepare('SELECT * FROM command_outputs').all() : [],
      parsed_processes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_processes').all() : [],
      parsed_connections: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_connections').all() : [],
      parsed_logins: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_logins').all() : [],
      parsed_interfaces: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_interfaces').all() : [],
      parsed_mounts: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_mounts').all() : [],
      parsed_routes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_routes').all() : [],
      parsed_services: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_services').all() : [],
      router_configs: includeCommandOutputs ? db.prepare('SELECT * FROM router_configs').all() : [],
      parsed_router_interfaces: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_interfaces').all() : [],
      parsed_router_vlans: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_vlans').all() : [],
      parsed_router_static_routes: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_static_routes').all() : [],
      parsed_router_acls: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_acls').all() : [],
      parsed_router_nat_rules: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_nat_rules').all() : [],
      parsed_router_dhcp_pools: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_dhcp_pools').all() : [],
      parsed_router_users: includeCommandOutputs ? db.prepare('SELECT * FROM parsed_router_users').all() : [],
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials').all() : [],
      device_type_icons: includeImages ? db.prepare('SELECT * FROM device_type_icons').all() : [],
      device_icon_overrides: includeImages ? db.prepare('SELECT * FROM device_icon_overrides').all() : [],
      diagram_images: includeImages ? db.prepare('SELECT * FROM diagram_images').all() : [],
      agent_type_icons: includeImages ? db.prepare('SELECT * FROM agent_type_icons').all() : [],
    };
  }

  const filename = `network-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  logActivity({ projectId: projectId ?? null, action: 'exported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', includeCommandOutputs, includeCredentials, includeImages } });

  // Stream JSON to avoid holding entire export in memory
  const meta = JSON.stringify({
    version: projectId ? 2 : 3,
    scope: projectId ? 'project' : 'full',
    exportedAt: new Date().toISOString(),
    includesCommandOutputs: includeCommandOutputs,
    includesCredentials: includeCredentials,
    includesImages: includeImages,
  });
  // Write opening: merge meta fields + "data":{...tables...}}
  const metaObj = meta.slice(0, -1); // remove trailing }
  res.write(`${metaObj},"data":`);
  res.write(JSON.stringify(data));
  res.write('}');
  res.end();
  // Allow data to be GC'd
  data = {} as any;
});

router.post('/import', (req, res) => {
  const backup = req.body;
  const projectId = res.locals.projectId as number | undefined;

  if (!backup || !backup.data) {
    res.status(400).json({ error: 'Invalid backup file format' });
    return;
  }

  if (![1, 2, 3, 4, 5].includes(backup.version)) {
    res.status(400).json({ error: 'Unsupported backup version' });
    return;
  }

  const { data } = backup;

  // Validate backup structure: ensure arrays are arrays and truncate oversized strings
  const arrayKeys = ['subnets', 'devices', 'device_ips', 'device_tags', 'device_subnets', 'connections',
    'diagram_positions', 'subnet_diagram_positions', 'highlight_rules', 'command_outputs',
    'parsed_processes', 'parsed_connections', 'parsed_logins', 'parsed_interfaces',
    'parsed_mounts', 'parsed_routes', 'parsed_services', 'credentials', 'projects',
    'device_type_icons', 'device_icon_overrides', 'diagram_images', 'agent_type_icons',
    'router_configs', 'parsed_router_interfaces', 'parsed_router_vlans',
    'parsed_router_static_routes', 'parsed_router_acls', 'parsed_router_nat_rules',
    'parsed_router_dhcp_pools', 'parsed_router_users'];
  for (const key of arrayKeys) {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      res.status(400).json({ error: `data.${key} must be an array` });
      return;
    }
  }

  // Sanitize all string values in imported data: truncate to 10000 chars max
  const MAX_STR = 10000;
  const truncatedFields: string[] = [];
  function sanitizeRow(row: any, tableName: string) {
    if (!row || typeof row !== 'object') return row;
    for (const [k, v] of Object.entries(row)) {
      if (typeof v === 'string' && v.length > MAX_STR) {
        row[k] = v.slice(0, MAX_STR);
        const label = `${tableName}.${k}` + (row.id ? ` (id=${row.id})` : '');
        if (truncatedFields.length < 50) truncatedFields.push(label);
      }
    }
    return row;
  }
  for (const key of arrayKeys) {
    if (Array.isArray(data[key])) {
      data[key] = data[key].map((row: any) => sanitizeRow(row, key));
    }
  }

  try {
    db.transaction(() => {
      if (projectId) {
        // Project-scoped import: delete only this project's data
        const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const outputIds = (db.prepare('SELECT id FROM command_outputs WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

        if (outputIds.length) {
          const { ph } = inParams(outputIds);
          db.prepare(`DELETE FROM parsed_processes WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_connections WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_logins WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_interfaces WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_mounts WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_routes WHERE output_id IN (${ph})`).run(...outputIds);
          db.prepare(`DELETE FROM parsed_services WHERE output_id IN (${ph})`).run(...outputIds);
        }
        db.prepare('DELETE FROM command_outputs WHERE project_id = ?').run(projectId);
        // Router configs cascade to parsed_router_* tables
        db.prepare('DELETE FROM router_configs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM credentials WHERE project_id = ?').run(projectId);
        if (deviceIds.length) {
          const { ph } = inParams(deviceIds);
          db.prepare(`DELETE FROM diagram_positions WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_subnets WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_tags WHERE device_id IN (${ph})`).run(...deviceIds);
          db.prepare(`DELETE FROM device_ips WHERE device_id IN (${ph})`).run(...deviceIds);
        }
        if (subnetIds.length) {
          const { ph } = inParams(subnetIds);
          db.prepare(`DELETE FROM subnet_diagram_positions WHERE subnet_id IN (${ph})`).run(...subnetIds);
        }
        db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM device_type_icons WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM device_icon_overrides WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM diagram_images WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM agent_type_icons WHERE project_id = ?').run(projectId);
        db.prepare('UPDATE devices SET hypervisor_id = NULL WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM devices WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM subnets WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM highlight_rules WHERE project_id = ?').run(projectId);
      } else {
        // Full-site import: delete everything
        db.prepare('UPDATE devices SET hypervisor_id = NULL').run();
        db.prepare('DELETE FROM parsed_processes').run();
        db.prepare('DELETE FROM parsed_connections').run();
        db.prepare('DELETE FROM parsed_logins').run();
        db.prepare('DELETE FROM parsed_interfaces').run();
        db.prepare('DELETE FROM parsed_mounts').run();
        db.prepare('DELETE FROM parsed_routes').run();
        db.prepare('DELETE FROM parsed_services').run();
        db.prepare('DELETE FROM command_outputs').run();
        // Router configs cascade to parsed_router_* tables
        db.prepare('DELETE FROM parsed_router_interfaces').run();
        db.prepare('DELETE FROM parsed_router_vlans').run();
        db.prepare('DELETE FROM parsed_router_static_routes').run();
        db.prepare('DELETE FROM parsed_router_acls').run();
        db.prepare('DELETE FROM parsed_router_nat_rules').run();
        db.prepare('DELETE FROM parsed_router_dhcp_pools').run();
        db.prepare('DELETE FROM parsed_router_users').run();
        db.prepare('DELETE FROM router_configs').run();
        db.prepare('DELETE FROM credentials').run();
        db.prepare('DELETE FROM diagram_positions').run();
        db.prepare('DELETE FROM subnet_diagram_positions').run();
        db.prepare('DELETE FROM connections').run();
        db.prepare('DELETE FROM device_subnets').run();
        db.prepare('DELETE FROM device_tags').run();
        db.prepare('DELETE FROM device_ips').run();
        db.prepare('DELETE FROM devices').run();
        db.prepare('DELETE FROM subnets').run();
        db.prepare('DELETE FROM highlight_rules').run();
        db.prepare('DELETE FROM device_type_icons').run();
        db.prepare('DELETE FROM device_icon_overrides').run();
        db.prepare('DELETE FROM diagram_images').run();
        db.prepare('DELETE FROM agent_type_icons').run();
        db.prepare('DELETE FROM projects').run();
      }

      const targetProjectId = projectId ?? 1;

      if (!projectId && data.projects?.length) {
        const stmt = db.prepare('INSERT INTO projects (id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
        for (const row of data.projects) {
          stmt.run(row.id, row.name, row.slug, row.description ?? null, row.created_at, row.updated_at);
        }
      } else if (!projectId) {
        db.prepare("INSERT INTO projects (id, name, slug, description) VALUES (1, 'Default', 'default', 'Default project')").run();
      }

      if (data.subnets?.length) {
        const stmt = db.prepare('INSERT INTO subnets (id, name, cidr, vlan_id, description, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.subnets) {
          stmt.run(row.id, row.name, row.cidr, row.vlan_id ?? null, row.description ?? null, projectId ?? row.project_id ?? targetProjectId, row.created_at, row.updated_at);
        }
      }

      if (data.devices?.length) {
        const stmt = db.prepare('INSERT INTO devices (id, name, type, mac_address, os, location, notes, subnet_id, hosting_type, hypervisor_id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.devices) {
          stmt.run(row.id, row.name, row.type, row.mac_address ?? null, row.os ?? null, row.location ?? null, row.notes ?? null, row.subnet_id ?? null, row.hosting_type ?? null, row.hypervisor_id ?? null, projectId ?? row.project_id ?? targetProjectId, row.created_at, row.updated_at);
        }
      }

      if (data.device_ips?.length) {
        const stmt = db.prepare('INSERT INTO device_ips (id, device_id, ip_address, label, is_primary) VALUES (?, ?, ?, ?, ?)');
        for (const row of data.device_ips) {
          stmt.run(row.id, row.device_id, row.ip_address, row.label ?? null, row.is_primary ?? 0);
        }
      }

      if (data.device_tags?.length) {
        const stmt = db.prepare('INSERT INTO device_tags (id, device_id, tag, created_at) VALUES (?, ?, ?, ?)');
        for (const row of data.device_tags) {
          stmt.run(row.id, row.device_id, row.tag, row.created_at);
        }
      }

      if (data.device_subnets?.length) {
        const stmt = db.prepare('INSERT INTO device_subnets (device_id, subnet_id) VALUES (?, ?)');
        for (const row of data.device_subnets) {
          stmt.run(row.device_id, row.subnet_id);
        }
      }

      if (data.connections?.length) {
        // Validate referential integrity: collect valid device/subnet IDs
        const validDeviceIds = new Set(
          (db.prepare(`SELECT id FROM devices WHERE project_id = ?`).all(projectId ?? targetProjectId) as { id: number }[]).map(r => r.id)
        );
        const validSubnetIds = new Set(
          (db.prepare(`SELECT id FROM subnets WHERE project_id = ?`).all(projectId ?? targetProjectId) as { id: number }[]).map(r => r.id)
        );
        const stmt = db.prepare('INSERT INTO connections (id, source_device_id, target_device_id, label, connection_type, edge_type, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.connections) {
          // Skip connections with invalid references
          if (row.source_device_id && !validDeviceIds.has(row.source_device_id)) continue;
          if (row.target_device_id && !validDeviceIds.has(row.target_device_id)) continue;
          if (row.source_subnet_id && !validSubnetIds.has(row.source_subnet_id)) continue;
          if (row.target_subnet_id && !validSubnetIds.has(row.target_subnet_id)) continue;
          stmt.run(row.id, row.source_device_id, row.target_device_id, row.label ?? null, row.connection_type ?? null, row.edge_type ?? null, projectId ?? row.project_id ?? targetProjectId, row.created_at);
        }
      }

      if (data.diagram_positions?.length) {
        const stmt = db.prepare('INSERT INTO diagram_positions (device_id, x, y) VALUES (?, ?, ?)');
        for (const row of data.diagram_positions) {
          stmt.run(row.device_id, row.x, row.y);
        }
      }

      if (data.subnet_diagram_positions?.length) {
        const stmt = db.prepare('INSERT INTO subnet_diagram_positions (subnet_id, x, y, width, height) VALUES (?, ?, ?, ?, ?)');
        for (const row of data.subnet_diagram_positions) {
          stmt.run(row.subnet_id, row.x, row.y, row.width, row.height);
        }
      }

      if (data.command_outputs?.length) {
        const stmt = db.prepare('INSERT INTO command_outputs (id, device_id, command_type, raw_output, project_id, captured_at) VALUES (?, ?, ?, ?, ?, ?)');
        for (const row of data.command_outputs) {
          stmt.run(row.id, row.device_id, row.command_type, row.raw_output, projectId ?? row.project_id ?? targetProjectId, row.captured_at);
        }
      }

      if (data.parsed_processes?.length) {
        const stmt = db.prepare('INSERT INTO parsed_processes (id, output_id, pid, user, cpu_percent, mem_percent, command) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_processes) {
          stmt.run(row.id, row.output_id, row.pid, row.user, row.cpu_percent, row.mem_percent, row.command);
        }
      }

      if (data.parsed_connections?.length) {
        const stmt = db.prepare('INSERT INTO parsed_connections (id, output_id, protocol, local_addr, foreign_addr, state, pid_program) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_connections) {
          stmt.run(row.id, row.output_id, row.protocol, row.local_addr, row.foreign_addr, row.state ?? null, row.pid_program ?? null);
        }
      }

      if (data.parsed_logins?.length) {
        const stmt = db.prepare('INSERT INTO parsed_logins (id, output_id, user, terminal, source_ip, login_time, duration) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_logins) {
          stmt.run(row.id, row.output_id, row.user, row.terminal ?? null, row.source_ip ?? null, row.login_time, row.duration ?? null);
        }
      }

      if (data.parsed_interfaces?.length) {
        const stmt = db.prepare('INSERT INTO parsed_interfaces (id, output_id, interface_name, state, ip_addresses, mac_address) VALUES (?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_interfaces) {
          stmt.run(row.id, row.output_id, row.interface_name, row.state ?? null, row.ip_addresses, row.mac_address ?? null);
        }
      }

      if (data.parsed_mounts?.length) {
        const stmt = db.prepare('INSERT INTO parsed_mounts (id, output_id, device, mount_point, fs_type, options) VALUES (?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_mounts) {
          stmt.run(row.id, row.output_id, row.device, row.mount_point, row.fs_type ?? null, row.options ?? null);
        }
      }

      if (data.parsed_routes?.length) {
        const stmt = db.prepare('INSERT INTO parsed_routes (id, output_id, destination, gateway, device, protocol, scope, metric) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_routes) {
          stmt.run(row.id, row.output_id, row.destination, row.gateway ?? null, row.device ?? null, row.protocol ?? null, row.scope ?? null, row.metric ?? null);
        }
      }

      if (data.parsed_services?.length) {
        const stmt = db.prepare('INSERT INTO parsed_services (id, output_id, unit_name, load, active, sub, description) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_services) {
          stmt.run(row.id, row.output_id, row.unit_name, row.load ?? null, row.active ?? null, row.sub ?? null, row.description ?? null);
        }
      }

      if (data.router_configs?.length) {
        const stmt = db.prepare('INSERT INTO router_configs (id, device_id, project_id, vendor, raw_config, captured_at, title, parse_output, hostname, os_version, model, domain, timezone, ntp_servers) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.router_configs) {
          stmt.run(row.id, row.device_id, projectId ?? row.project_id ?? targetProjectId, row.vendor, row.raw_config, row.captured_at, row.title ?? null, row.parse_output ?? 1, row.hostname ?? null, row.os_version ?? null, row.model ?? null, row.domain ?? null, row.timezone ?? null, row.ntp_servers ?? null);
        }
      }

      if (data.parsed_router_interfaces?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_interfaces (id, config_id, interface_name, description, ip_address, subnet_mask, vlan, admin_status, mac_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_interfaces) {
          stmt.run(row.id, row.config_id, row.interface_name, row.description ?? null, row.ip_address ?? null, row.subnet_mask ?? null, row.vlan ?? null, row.admin_status ?? null, row.mac_address ?? null);
        }
      }

      if (data.parsed_router_vlans?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_vlans (id, config_id, vlan_id, name) VALUES (?, ?, ?, ?)');
        for (const row of data.parsed_router_vlans) {
          stmt.run(row.id, row.config_id, row.vlan_id, row.name ?? null);
        }
      }

      if (data.parsed_router_static_routes?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_static_routes (id, config_id, destination, mask, next_hop, metric, admin_distance) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_static_routes) {
          stmt.run(row.id, row.config_id, row.destination, row.mask ?? null, row.next_hop ?? null, row.metric ?? null, row.admin_distance ?? null);
        }
      }

      if (data.parsed_router_acls?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_acls (id, config_id, acl_name, sequence, action, protocol, src, src_port, dst, dst_port) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_acls) {
          stmt.run(row.id, row.config_id, row.acl_name, row.sequence ?? null, row.action, row.protocol ?? null, row.src ?? null, row.src_port ?? null, row.dst ?? null, row.dst_port ?? null);
        }
      }

      if (data.parsed_router_nat_rules?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_nat_rules (id, config_id, nat_type, protocol, inside_src, inside_port, outside_src, outside_port) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_nat_rules) {
          stmt.run(row.id, row.config_id, row.nat_type, row.protocol ?? null, row.inside_src ?? null, row.inside_port ?? null, row.outside_src ?? null, row.outside_port ?? null);
        }
      }

      if (data.parsed_router_dhcp_pools?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_dhcp_pools (id, config_id, pool_name, network, netmask, default_router, dns_servers, lease_time, domain_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_dhcp_pools) {
          stmt.run(row.id, row.config_id, row.pool_name, row.network ?? null, row.netmask ?? null, row.default_router ?? null, row.dns_servers ?? null, row.lease_time ?? null, row.domain_name ?? null);
        }
      }

      if (data.parsed_router_users?.length) {
        const stmt = db.prepare('INSERT INTO parsed_router_users (id, config_id, username, privilege, auth_method) VALUES (?, ?, ?, ?, ?)');
        for (const row of data.parsed_router_users) {
          stmt.run(row.id, row.config_id, row.username, row.privilege ?? null, row.auth_method ?? null);
        }
      }

      if (data.highlight_rules?.length) {
        const stmt = db.prepare('INSERT INTO highlight_rules (id, keyword, category, color, text_color, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.highlight_rules) {
          stmt.run(row.id, row.keyword, row.category, row.color, row.text_color ?? null, projectId ?? row.project_id ?? targetProjectId, row.created_at);
        }
      }

      if (data.credentials?.length) {
        const stmt = db.prepare('INSERT INTO credentials (id, device_id, host, username, password, type, source, project_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.credentials) {
          stmt.run(row.id, row.device_id ?? null, row.host ?? null, row.username, row.password ?? null, row.type ?? null, row.source ?? null, projectId ?? row.project_id ?? targetProjectId, row.created_at, row.updated_at);
        }
      }

      if (data.device_type_icons?.length) {
        const stmt = db.prepare('INSERT INTO device_type_icons (id, project_id, device_type, filename, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.device_type_icons) {
          stmt.run(row.id, projectId ?? row.project_id ?? targetProjectId, row.device_type, row.filename, row.mime_type, row.data, row.created_at);
        }
      }

      if (data.device_icon_overrides?.length) {
        const stmt = db.prepare('INSERT INTO device_icon_overrides (id, device_id, project_id, filename, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.device_icon_overrides) {
          stmt.run(row.id, row.device_id, projectId ?? row.project_id ?? targetProjectId, row.filename, row.mime_type, row.data, row.created_at);
        }
      }

      if (data.diagram_images?.length) {
        const stmt = db.prepare('INSERT INTO diagram_images (id, project_id, x, y, width, height, filename, mime_type, data, label, view_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.diagram_images) {
          stmt.run(row.id, projectId ?? row.project_id ?? targetProjectId, row.x, row.y, row.width, row.height, row.filename, row.mime_type, row.data, row.label ?? null, row.view_id ?? null, row.created_at);
        }
      }

      if (data.agent_type_icons?.length) {
        const stmt = db.prepare('INSERT INTO agent_type_icons (id, project_id, agent_type, filename, mime_type, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.agent_type_icons) {
          stmt.run(row.id, projectId ?? row.project_id ?? targetProjectId, row.agent_type, row.filename, row.mime_type, row.data, row.created_at);
        }
      }
    })();

    logActivity({ projectId: projectId ?? null, action: 'imported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', version: backup.version } });
    res.json({ success: true, truncatedFields });
  } catch (err: unknown) {
    console.error('Backup import error:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

export default router;
