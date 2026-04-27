import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { parsers, isCommandType, type CommandType, type CommandTypeToRow } from '../parsers/index.js';
import { verifyDeviceOwnership, verifyCommandOutputOwnership } from '../validation.js';
import type { SubmitCommandOutputRequest, UpdateCommandOutputRequest } from 'shared/types.js';
import { RAW_OUTPUT_MAX_BYTES as MAX_RAW_OUTPUT_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

type CommandOutputRow = {
  id: number;
  device_id: number;
  project_id: number;
  command_type: string;
  raw_output: string;
  title: string | null;
  parse_output: number;
  captured_at: string;
  updated_at: string;
};
type CommandOutputWithParsed = CommandOutputRow & { [key: `parsed_${string}`]: unknown[] };

router.get('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyDeviceOwnership(req.params.deviceId, projectId)) {
    return res.status(404).json({ error: 'Device not found in this project' });
  }
  // Optional date range. Accepts YYYY-MM-DD or YYYY-MM-DDTHH:MM[:SS].
  const from = ((req.query.from as string) || '').trim();
  const to = ((req.query.to as string) || '').trim();
  const dateRe = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/;
  const where: string[] = ['device_id = ?', 'project_id = ?'];
  const params: unknown[] = [req.params.deviceId, projectId];
  if (from && dateRe.test(from)) { where.push('captured_at >= ?'); params.push(from); }
  if (to && dateRe.test(to))     { where.push('captured_at <= ?'); params.push(to.length === 10 ? to + 'T23:59:59' : to); }
  const outputs = db.prepare(
    `SELECT id, device_id, command_type, captured_at, title, parse_output FROM command_outputs WHERE ${where.join(' AND ')} ORDER BY captured_at DESC`
  ).all(...params);
  res.json(outputs);
});

// Default and max parsed-row caps for GET /:id. The default of 1000 is
// enough for typical command outputs but stops a 50k-process `ps` from
// shipping every row to the browser. Clients can paginate via ?limit&offset
// up to PARSED_HARD_CAP, and a total + truncated flag let the UI show
// "Showing first 1000 of X" affordances.
const PARSED_DEFAULT_LIMIT = 1000;
const PARSED_HARD_CAP = 5000;

// Map command type → its parsed_* table and the column to ORDER BY (rowid by
// default — gives insertion order, which matches the order rows were parsed).
const parsedTables: Partial<Record<string, { table: string; orderBy: string; key: string }>> = {
  ps:               { table: 'parsed_processes',   orderBy: 'rowid',  key: 'parsed_processes' },
  netstat:          { table: 'parsed_connections', orderBy: 'rowid',  key: 'parsed_connections' },
  last:             { table: 'parsed_logins',      orderBy: 'rowid',  key: 'parsed_logins' },
  ip_a:             { table: 'parsed_interfaces',  orderBy: 'rowid',  key: 'parsed_interfaces' },
  mount:            { table: 'parsed_mounts',      orderBy: 'rowid',  key: 'parsed_mounts' },
  ip_r:             { table: 'parsed_routes',      orderBy: 'rowid',  key: 'parsed_routes' },
  systemctl_status: { table: 'parsed_services',    orderBy: 'rowid',  key: 'parsed_services' },
  arp:              { table: 'parsed_arp',         orderBy: 'rowid',  key: 'parsed_arp' },
  user_history:     { table: 'parsed_user_history', orderBy: 'line_no', key: 'parsed_user_history' },
};

interface ParsedMeta {
  parsed_total?: number;
  parsed_limit?: number;
  parsed_offset?: number;
  parsed_truncated?: boolean;
}

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const output = db.prepare('SELECT * FROM command_outputs WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as (CommandOutputWithParsed & ParsedMeta) | undefined;
  if (!output) return res.status(404).json({ error: 'Output not found' });

  if (!output.parse_output) {
    return res.json(output);
  }

  const spec = parsedTables[output.command_type];
  if (!spec) return res.json(output);

  const limit = Math.min(Math.max(Number(req.query.limit) || PARSED_DEFAULT_LIMIT, 1), PARSED_HARD_CAP);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const total = (db.prepare(`SELECT COUNT(*) as c FROM ${spec.table} WHERE output_id = ?`).get(output.id) as { c: number }).c;
  const rows = db.prepare(
    `SELECT * FROM ${spec.table} WHERE output_id = ? ORDER BY ${spec.orderBy} LIMIT ? OFFSET ?`
  ).all(output.id, limit, offset);

  // spec.key is the legacy key name the client already reads
  // (parsed_processes for ps, parsed_connections for netstat, etc.).
  (output as unknown as Record<string, unknown>)[spec.key] = rows;
  output.parsed_total = total;
  output.parsed_limit = limit;
  output.parsed_offset = offset;
  output.parsed_truncated = total > offset + rows.length;

  res.json(output);
});

const insertOutput = db.prepare(
  'INSERT INTO command_outputs (device_id, command_type, raw_output, project_id, title, parse_output) VALUES (?, ?, ?, ?, ?, ?)'
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
const insertArp = db.prepare(
  'INSERT INTO parsed_arp (output_id, ip, mac_address, interface_name) VALUES (?, ?, ?, ?)'
);
const insertUserHistory = db.prepare(
  'INSERT INTO parsed_user_history (output_id, line_no, timestamp, command) VALUES (?, ?, ?, ?)'
);

// Parse raw output for a known command type and insert typed rows. Both the
// submit and toggle-parse paths share this — we used to have two nearly
// identical copies, and only one of them surfaced parser errors.
function parseAndInsertRows(outputId: number, commandType: CommandType, rawOutput: string) {
  const parser = parsers[commandType];
  let rows;
  try {
    rows = parser(rawOutput);
  } catch (parseErr) {
    throw new Error(`Parse failed for ${commandType}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
  }
  switch (commandType) {
    case 'ps':
      for (const r of rows as CommandTypeToRow['ps'][]) {
        insertProcess.run(outputId, r.pid, r.user, r.cpu_percent, r.mem_percent, r.command);
      }
      break;
    case 'netstat':
      for (const r of rows as CommandTypeToRow['netstat'][]) {
        insertNetConn.run(outputId, r.protocol, r.local_addr, r.foreign_addr, r.state, r.pid_program);
      }
      break;
    case 'last':
      for (const r of rows as CommandTypeToRow['last'][]) {
        insertLogin.run(outputId, r.user, r.terminal, r.source_ip, r.login_time, r.duration);
      }
      break;
    case 'ip_a':
      for (const r of rows as CommandTypeToRow['ip_a'][]) {
        insertInterface.run(outputId, r.interface_name, r.state, r.ip_addresses, r.mac_address);
      }
      break;
    case 'mount':
      for (const r of rows as CommandTypeToRow['mount'][]) {
        insertMount.run(outputId, r.device, r.mount_point, r.fs_type, r.options);
      }
      break;
    case 'ip_r':
      for (const r of rows as CommandTypeToRow['ip_r'][]) {
        insertRoute.run(outputId, r.destination, r.gateway, r.device, r.protocol, r.scope, r.metric);
      }
      break;
    case 'systemctl_status':
      for (const r of rows as CommandTypeToRow['systemctl_status'][]) {
        insertService.run(outputId, r.unit_name, r.load, r.active, r.sub, r.description);
      }
      break;
    case 'arp':
      for (const r of rows as CommandTypeToRow['arp'][]) {
        insertArp.run(outputId, r.ip, r.mac, r.interface ?? null);
      }
      break;
    case 'user_history':
      for (const r of rows as CommandTypeToRow['user_history'][]) {
        insertUserHistory.run(outputId, r.line_no, r.timestamp, r.command);
      }
      break;
  }
}

const submitOutput = db.transaction((deviceId: number, body: SubmitCommandOutputRequest, projectId: number) => {
  const shouldParse = body.parse_output !== false;
  const result = insertOutput.run(deviceId, body.command_type, body.raw_output, projectId, body.title || null, shouldParse ? 1 : 0);
  const outputId = result.lastInsertRowid as number;

  if (shouldParse && isCommandType(body.command_type)) {
    parseAndInsertRows(outputId, body.command_type, body.raw_output);
  }

  return outputId;
});

router.post('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const deviceId = parseInt(req.params.deviceId, 10);
  if (!verifyDeviceOwnership(deviceId, projectId)) {
    return res.status(404).json({ error: 'Device not found in this project' });
  }
  const body = req.body as SubmitCommandOutputRequest;
  if (body.raw_output && Buffer.byteLength(body.raw_output, 'utf8') > MAX_RAW_OUTPUT_SIZE) {
    return res.status(400).json({ error: 'Raw output exceeds 50 MB limit' });
  }
  try {
    const outputId = submitOutput(deviceId, body, projectId);
    const output = db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(outputId);
    const device = db.prepare('SELECT name FROM devices WHERE id = ?').get(deviceId) as { name: string } | undefined;
    logActivity({ projectId, action: 'captured', resourceType: 'command_output', resourceId: outputId, resourceName: device?.name ?? String(deviceId), details: { command_type: body.command_type } });
    res.status(201).json(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Parse failed')) {
      console.warn('Command output parse error:', message);
      return res.status(400).json({ error: message });
    }
    console.error('Command output submission failed:', err);
    res.status(500).json({ error: 'Failed to save command output' });
  }
});

function runInsertParsedRows(outputId: number, commandType: string, rawOutput: string) {
  if (!isCommandType(commandType)) return;
  parseAndInsertRows(outputId, commandType, rawOutput);
}

const deleteParsedRows: Record<string, ReturnType<typeof db.prepare>> = {
  ps: db.prepare('DELETE FROM parsed_processes WHERE output_id = ?'),
  netstat: db.prepare('DELETE FROM parsed_connections WHERE output_id = ?'),
  last: db.prepare('DELETE FROM parsed_logins WHERE output_id = ?'),
  ip_a: db.prepare('DELETE FROM parsed_interfaces WHERE output_id = ?'),
  mount: db.prepare('DELETE FROM parsed_mounts WHERE output_id = ?'),
  ip_r: db.prepare('DELETE FROM parsed_routes WHERE output_id = ?'),
  systemctl_status: db.prepare('DELETE FROM parsed_services WHERE output_id = ?'),
  arp: db.prepare('DELETE FROM parsed_arp WHERE output_id = ?'),
  user_history: db.prepare('DELETE FROM parsed_user_history WHERE output_id = ?'),
};

const toggleParseOutput = db.transaction((id: number, enable: boolean) => {
  const output = db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(id) as CommandOutputRow | undefined;
  if (!output) return null;
  if (output.command_type === 'freeform') return output;

  if (enable && !output.parse_output) {
    runInsertParsedRows(id, output.command_type, output.raw_output);
    db.prepare('UPDATE command_outputs SET parse_output = 1 WHERE id = ?').run(id);
  } else if (!enable && output.parse_output) {
    // Delete parsed rows
    const del = deleteParsedRows[output.command_type];
    if (del) del.run(id);
    db.prepare('UPDATE command_outputs SET parse_output = 0 WHERE id = ?').run(id);
  }

  return db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(id);
});

router.patch('/:id/parse', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyCommandOutputOwnership(req.params.id, projectId)) {
    return res.status(404).json({ error: 'Output not found' });
  }
  const { parse_output } = req.body;
  if (typeof parse_output !== 'boolean') return res.status(400).json({ error: 'parse_output must be a boolean' });
  const result = toggleParseOutput(Number(req.params.id), parse_output);
  if (!result) return res.status(404).json({ error: 'Output not found' });
  res.json(result);
});

const updateOutputTx = db.transaction((id: number, body: UpdateCommandOutputRequest) => {
  const existing = db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(id) as CommandOutputRow | undefined;
  if (!existing) return null;

  const sets: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];
  if (body.raw_output !== undefined) { sets.push('raw_output = ?'); values.push(body.raw_output); }
  if (body.captured_at !== undefined) {
    // Normalise datetime-local format (YYYY-MM-DDTHH:MM) to SQLite format (YYYY-MM-DD HH:MM:SS)
    const normalised = body.captured_at.replace('T', ' ');
    const capturedAt = normalised.length === 16 ? normalised + ':00' : normalised;
    sets.push('captured_at = ?');
    values.push(capturedAt);
  }
  if (body.title !== undefined) { sets.push('title = ?'); values.push(body.title || null); }

  if (sets.length > 0) {
    db.prepare(`UPDATE command_outputs SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }

  // Re-parse if raw_output changed and parsing is enabled
  const rawChanged = body.raw_output !== undefined && body.raw_output !== existing.raw_output;
  if (rawChanged && existing.parse_output && existing.command_type !== 'freeform') {
    const del = deleteParsedRows[existing.command_type];
    if (del) del.run(id);
    runInsertParsedRows(id, existing.command_type, body.raw_output!);
  }

  return db.prepare('SELECT * FROM command_outputs WHERE id = ?').get(id);
});

router.patch('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyCommandOutputOwnership(req.params.id, projectId)) {
    return res.status(404).json({ error: 'Output not found' });
  }
  const body = req.body as UpdateCommandOutputRequest & { updated_at?: string };
  if (body.updated_at) {
    const current = db.prepare('SELECT updated_at FROM command_outputs WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { updated_at: string } | undefined;
    if (current && current.updated_at !== body.updated_at) {
      return res.status(409).json({ error: 'This capture was modified by another session. Please refresh and try again.' });
    }
  }
  const result = updateOutputTx(Number(req.params.id), body);
  if (!result) return res.status(404).json({ error: 'Output not found' });
  res.json(result);
});

// Delete one output row + log. Returns true if a row was actually deleted.
const deleteOneOutput = db.transaction((id: number, projectId: number): boolean => {
  const existing = db.prepare(
    `SELECT co.command_type, d.name as device_name, co.project_id
     FROM command_outputs co LEFT JOIN devices d ON co.device_id = d.id
     WHERE co.id = ? AND co.project_id = ?`
  ).get(id, projectId) as { command_type: string; device_name: string | null; project_id: number } | undefined;
  if (!existing) return false;
  db.prepare('DELETE FROM command_outputs WHERE id = ? AND project_id = ?').run(id, projectId);
  logActivity({ projectId: existing.project_id ?? projectId, action: 'deleted', resourceType: 'command_output', resourceId: id, resourceName: existing.device_name ?? undefined, details: { command_type: existing.command_type } });
  return true;
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  // Idempotent: a missing row means another tab already deleted it.
  deleteOneOutput(Number(req.params.id), projectId);
  res.status(204).send();
});

const COMMAND_OUTPUT_BULK_MAX_IDS = 500;

router.post('/bulk-delete', (req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > COMMAND_OUTPUT_BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot delete more than ${COMMAND_OUTPUT_BULK_MAX_IDS} outputs at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      if (deleteOneOutput(id, projectId)) deleted.push(id);
    } catch (err) {
      failed.push({ id, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }
  res.json({ deleted, failed });
});

export default router;
