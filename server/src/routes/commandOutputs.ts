import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { parsers } from '../parsers/index.js';
import type { SubmitCommandOutputRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/device/:deviceId', (req, res) => {
  const outputs = db.prepare(
    'SELECT id, device_id, command_type, captured_at, title FROM command_outputs WHERE device_id = ? ORDER BY captured_at DESC'
  ).all(req.params.deviceId);
  res.json(outputs);
});

router.get('/:id', (req, res) => {
  const output = db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(req.params.id) as any;
  if (!output) return res.status(404).json({ error: 'Output not found' });

  let parsed: any[] = [];
  switch (output.command_type) {
    case 'ps':
      parsed = db.prepare('SELECT * FROM parsed_processes WHERE output_id = ?').all(output.id);
      output.parsed_processes = parsed;
      break;
    case 'netstat':
      parsed = db.prepare('SELECT * FROM parsed_connections WHERE output_id = ?').all(output.id);
      output.parsed_connections = parsed;
      break;
    case 'last':
      parsed = db.prepare('SELECT * FROM parsed_logins WHERE output_id = ?').all(output.id);
      output.parsed_logins = parsed;
      break;
    case 'ip_a':
      parsed = db.prepare('SELECT * FROM parsed_interfaces WHERE output_id = ?').all(output.id);
      output.parsed_interfaces = parsed;
      break;
    case 'mount':
      parsed = db.prepare('SELECT * FROM parsed_mounts WHERE output_id = ?').all(output.id);
      output.parsed_mounts = parsed;
      break;
    case 'ip_r':
      parsed = db.prepare('SELECT * FROM parsed_routes WHERE output_id = ?').all(output.id);
      output.parsed_routes = parsed;
      break;
    case 'systemctl_status':
      parsed = db.prepare('SELECT * FROM parsed_services WHERE output_id = ?').all(output.id);
      output.parsed_services = parsed;
      break;
  }

  res.json(output);
});

const insertOutput = db.prepare(
  'INSERT INTO command_outputs (device_id, command_type, raw_output, project_id, title) VALUES (?, ?, ?, ?, ?)'
);
const insertProcess = db.prepare(
  'INSERT INTO parsed_processes (output_id, pid, user, cpu_percent, mem_percent, command) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertNetConn = db.prepare(
  'INSERT INTO parsed_connections (output_id, protocol, local_addr, foreign_addr, state, pid_program) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertLogin = db.prepare(
  'INSERT INTO parsed_logins (output_id, user, terminal, source_ip, login_time, duration) VALUES (?, ?, ?, ?, ?, ?)'
);
const insertInterface = db.prepare(
  'INSERT INTO parsed_interfaces (output_id, interface_name, state, ip_addresses, mac_address) VALUES (?, ?, ?, ?, ?)'
);
const insertMount = db.prepare(
  'INSERT INTO parsed_mounts (output_id, device, mount_point, fs_type, options) VALUES (?, ?, ?, ?, ?)'
);
const insertRoute = db.prepare(
  'INSERT INTO parsed_routes (output_id, destination, gateway, device, protocol, scope, metric) VALUES (?, ?, ?, ?, ?, ?, ?)'
);
const insertService = db.prepare(
  'INSERT INTO parsed_services (output_id, unit_name, load, active, sub, description) VALUES (?, ?, ?, ?, ?, ?)'
);

const submitOutput = db.transaction((deviceId: number, body: SubmitCommandOutputRequest, projectId: number) => {
  const result = insertOutput.run(deviceId, body.command_type, body.raw_output, projectId, body.title || null);
  const outputId = result.lastInsertRowid as number;

  if (body.command_type !== 'freeform') {
    const parser = parsers[body.command_type];
    if (parser) {
      const rows = parser(body.raw_output);
      for (const row of rows) {
        switch (body.command_type) {
          case 'ps': {
            const r = row as any;
            insertProcess.run(outputId, r.pid, r.user, r.cpu_percent, r.mem_percent, r.command);
            break;
          }
          case 'netstat': {
            const r = row as any;
            insertNetConn.run(outputId, r.protocol, r.local_addr, r.foreign_addr, r.state, r.pid_program);
            break;
          }
          case 'last': {
            const r = row as any;
            insertLogin.run(outputId, r.user, r.terminal, r.source_ip, r.login_time, r.duration);
            break;
          }
          case 'ip_a': {
            const r = row as any;
            insertInterface.run(outputId, r.interface_name, r.state, r.ip_addresses, r.mac_address);
            break;
          }
          case 'mount': {
            const r = row as any;
            insertMount.run(outputId, r.device, r.mount_point, r.fs_type, r.options);
            break;
          }
          case 'ip_r': {
            const r = row as any;
            insertRoute.run(outputId, r.destination, r.gateway, r.device, r.protocol, r.scope, r.metric);
            break;
          }
          case 'systemctl_status': {
            const r = row as any;
            insertService.run(outputId, r.unit_name, r.load, r.active, r.sub, r.description);
            break;
          }
        }
      }
    }
  }

  return outputId;
});

router.post('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const deviceId = parseInt(req.params.deviceId, 10);
  const outputId = submitOutput(deviceId, req.body as SubmitCommandOutputRequest, projectId);

  const output = db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(outputId);
  const device = db.prepare('SELECT name FROM devices WHERE id = ?').get(deviceId) as { name: string } | undefined;
  logActivity({ projectId, action: 'captured', resourceType: 'command_output', resourceId: outputId, resourceName: device?.name ?? String(deviceId), details: { command_type: (req.body as SubmitCommandOutputRequest).command_type } });
  res.status(201).json(output);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    `SELECT co.command_type, d.name as device_name, co.project_id
     FROM command_outputs co LEFT JOIN devices d ON co.device_id = d.id
     WHERE co.id = ?`
  ).get(req.params.id) as { command_type: string; device_name: string | null; project_id: number } | undefined;
  const result = db.prepare('DELETE FROM command_outputs WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Output not found' });
  if (existing) {
    logActivity({ projectId: existing.project_id ?? projectId, action: 'deleted', resourceType: 'command_output', resourceId: Number(req.params.id), resourceName: existing.device_name ?? undefined, details: { command_type: existing.command_type } });
  }
  res.status(204).send();
});

export default router;
