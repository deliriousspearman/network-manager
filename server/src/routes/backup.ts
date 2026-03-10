import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';

const router = Router({ mergeParams: true });

router.get('/export', (_req, res) => {
  const includeCommandOutputs = _req.query.includeCommandOutputs !== 'false';
  const includeCredentials = _req.query.includeCredentials !== 'false';
  const projectId = res.locals.projectId as number | undefined;

  let data: Record<string, unknown[]>;

  if (projectId) {
    // Project-scoped export
    const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
    const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

    data = {
      subnets: db.prepare('SELECT * FROM subnets WHERE project_id = ?').all(projectId),
      devices: db.prepare('SELECT * FROM devices WHERE project_id = ?').all(projectId),
      device_ips: deviceIds.length ? db.prepare(`SELECT * FROM device_ips WHERE device_id IN (${deviceIds.join(',')})`).all() : [],
      device_tags: deviceIds.length ? db.prepare(`SELECT * FROM device_tags WHERE device_id IN (${deviceIds.join(',')})`).all() : [],
      device_subnets: deviceIds.length ? db.prepare(`SELECT * FROM device_subnets WHERE device_id IN (${deviceIds.join(',')})`).all() : [],
      connections: db.prepare('SELECT * FROM connections WHERE project_id = ?').all(projectId),
      diagram_positions: deviceIds.length ? db.prepare(`SELECT * FROM diagram_positions WHERE device_id IN (${deviceIds.join(',')})`).all() : [],
      subnet_diagram_positions: subnetIds.length ? db.prepare(`SELECT * FROM subnet_diagram_positions WHERE subnet_id IN (${subnetIds.join(',')})`).all() : [],
      highlight_rules: db.prepare('SELECT * FROM highlight_rules WHERE project_id = ?').all(projectId),
      command_outputs: includeCommandOutputs ? db.prepare('SELECT * FROM command_outputs WHERE project_id = ?').all(projectId) : [],
      parsed_processes: [],
      parsed_connections: [],
      parsed_logins: [],
      parsed_interfaces: [],
      parsed_mounts: [],
      parsed_routes: [],
      parsed_services: [],
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials WHERE project_id = ?').all(projectId) : [],
    };

    if (includeCommandOutputs) {
      const outputIds = (data.command_outputs as any[]).map(o => o.id);
      if (outputIds.length) {
        const inClause = outputIds.join(',');
        data.parsed_processes = db.prepare(`SELECT * FROM parsed_processes WHERE output_id IN (${inClause})`).all();
        data.parsed_connections = db.prepare(`SELECT * FROM parsed_connections WHERE output_id IN (${inClause})`).all();
        data.parsed_logins = db.prepare(`SELECT * FROM parsed_logins WHERE output_id IN (${inClause})`).all();
        data.parsed_interfaces = db.prepare(`SELECT * FROM parsed_interfaces WHERE output_id IN (${inClause})`).all();
        data.parsed_mounts = db.prepare(`SELECT * FROM parsed_mounts WHERE output_id IN (${inClause})`).all();
        data.parsed_routes = db.prepare(`SELECT * FROM parsed_routes WHERE output_id IN (${inClause})`).all();
        data.parsed_services = db.prepare(`SELECT * FROM parsed_services WHERE output_id IN (${inClause})`).all();
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
      credentials: includeCredentials ? db.prepare('SELECT * FROM credentials').all() : [],
    };
  }

  const backup = {
    version: projectId ? 2 : 3,
    scope: projectId ? 'project' : 'full',
    exportedAt: new Date().toISOString(),
    includesCommandOutputs: includeCommandOutputs,
    includesCredentials: includeCredentials,
    data,
  };

  const filename = `network-backup-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json');
  logActivity({ projectId: projectId ?? null, action: 'exported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', includesCommandOutputs: includeCommandOutputs, includesCredentials: includeCredentials } });
  res.json(backup);
});

router.post('/import', (req, res) => {
  const backup = req.body;
  const projectId = res.locals.projectId as number | undefined;

  if (!backup || !backup.data) {
    res.status(400).json({ error: 'Invalid backup file format' });
    return;
  }

  if (![1, 2, 3].includes(backup.version)) {
    res.status(400).json({ error: 'Unsupported backup version' });
    return;
  }

  const { data } = backup;

  try {
    db.transaction(() => {
      if (projectId) {
        // Project-scoped import: delete only this project's data
        const deviceIds = (db.prepare('SELECT id FROM devices WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const subnetIds = (db.prepare('SELECT id FROM subnets WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);
        const outputIds = (db.prepare('SELECT id FROM command_outputs WHERE project_id = ?').all(projectId) as { id: number }[]).map(r => r.id);

        if (outputIds.length) {
          const inClause = outputIds.join(',');
          db.prepare(`DELETE FROM parsed_processes WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_connections WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_logins WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_interfaces WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_mounts WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_routes WHERE output_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM parsed_services WHERE output_id IN (${inClause})`).run();
        }
        db.prepare('DELETE FROM command_outputs WHERE project_id = ?').run(projectId);
        db.prepare('DELETE FROM credentials WHERE project_id = ?').run(projectId);
        if (deviceIds.length) {
          const inClause = deviceIds.join(',');
          db.prepare(`DELETE FROM diagram_positions WHERE device_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM device_subnets WHERE device_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM device_tags WHERE device_id IN (${inClause})`).run();
          db.prepare(`DELETE FROM device_ips WHERE device_id IN (${inClause})`).run();
        }
        if (subnetIds.length) {
          db.prepare(`DELETE FROM subnet_diagram_positions WHERE subnet_id IN (${subnetIds.join(',')})`).run();
        }
        db.prepare('DELETE FROM connections WHERE project_id = ?').run(projectId);
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
        const stmt = db.prepare('INSERT INTO connections (id, source_device_id, target_device_id, label, connection_type, edge_type, project_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        for (const row of data.connections) {
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
    })();

    logActivity({ projectId: projectId ?? null, action: 'imported', resourceType: 'backup', details: { scope: projectId ? 'project' : 'full-site', version: backup.version } });
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Import failed';
    res.status(500).json({ error: message });
  }
});

export default router;
