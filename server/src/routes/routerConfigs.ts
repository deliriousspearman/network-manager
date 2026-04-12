import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { routerConfigParsers } from '../parsers/routerConfig/index.js';
import type { ParsedRouterConfig } from '../parsers/routerConfig/index.js';
import { verifyDeviceOwnership, verifyRouterConfigOwnership } from '../validation.js';
import type { SubmitRouterConfigRequest, UpdateRouterConfigRequest, RouterVendor } from 'shared/types.js';

const router = Router({ mergeParams: true });

const MAX_RAW_CONFIG_SIZE = 50 * 1024 * 1024; // 50 MB
const VALID_VENDORS: RouterVendor[] = ['cisco', 'unifi', 'mikrotik', 'juniper', 'fortigate', 'pfsense'];

// ----- LIST -----
router.get('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyDeviceOwnership(req.params.deviceId, projectId)) {
    return res.status(404).json({ error: 'Device not found in this project' });
  }
  const rows = db.prepare(
    `SELECT id, device_id, vendor, captured_at, title, parse_output, hostname
       FROM router_configs
      WHERE device_id = ? AND project_id = ?
      ORDER BY captured_at DESC`
  ).all(req.params.deviceId, projectId);
  res.json(rows);
});

// ----- GET ONE (with parsed children) -----
router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const config = db.prepare('SELECT * FROM router_configs WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as any;
  if (!config) return res.status(404).json({ error: 'Router config not found' });

  if (config.parse_output) {
    config.parsed_interfaces = db.prepare('SELECT * FROM parsed_router_interfaces WHERE config_id = ? ORDER BY id').all(config.id);
    config.parsed_vlans = db.prepare('SELECT * FROM parsed_router_vlans WHERE config_id = ? ORDER BY vlan_id').all(config.id);
    config.parsed_static_routes = db.prepare('SELECT * FROM parsed_router_static_routes WHERE config_id = ? ORDER BY id').all(config.id);
    config.parsed_acls = db.prepare('SELECT * FROM parsed_router_acls WHERE config_id = ? ORDER BY id').all(config.id);
    config.parsed_nat_rules = db.prepare('SELECT * FROM parsed_router_nat_rules WHERE config_id = ? ORDER BY id').all(config.id);
    config.parsed_dhcp_pools = db.prepare('SELECT * FROM parsed_router_dhcp_pools WHERE config_id = ? ORDER BY id').all(config.id);
    config.parsed_users = db.prepare('SELECT * FROM parsed_router_users WHERE config_id = ? ORDER BY id').all(config.id);
  }

  res.json(config);
});

// ----- Prepared statements -----
const insertConfig = db.prepare(
  `INSERT INTO router_configs
    (device_id, project_id, vendor, raw_config, title, parse_output, hostname, os_version, model, domain, timezone, ntp_servers)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const updateConfigMetadata = db.prepare(
  `UPDATE router_configs
      SET hostname = ?, os_version = ?, model = ?, domain = ?, timezone = ?, ntp_servers = ?
    WHERE id = ?`
);
const insertInterface = db.prepare(
  `INSERT INTO parsed_router_interfaces
    (config_id, interface_name, description, ip_address, subnet_mask, vlan, admin_status, mac_address)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertVlan = db.prepare(
  'INSERT INTO parsed_router_vlans (config_id, vlan_id, name) VALUES (?, ?, ?)'
);
const insertStaticRoute = db.prepare(
  `INSERT INTO parsed_router_static_routes
    (config_id, destination, mask, next_hop, metric, admin_distance)
   VALUES (?, ?, ?, ?, ?, ?)`
);
const insertAcl = db.prepare(
  `INSERT INTO parsed_router_acls
    (config_id, acl_name, sequence, action, protocol, src, src_port, dst, dst_port)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertNatRule = db.prepare(
  `INSERT INTO parsed_router_nat_rules
    (config_id, nat_type, protocol, inside_src, inside_port, outside_src, outside_port)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
const insertDhcpPool = db.prepare(
  `INSERT INTO parsed_router_dhcp_pools
    (config_id, pool_name, network, netmask, default_router, dns_servers, lease_time, domain_name)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);
const insertUser = db.prepare(
  'INSERT INTO parsed_router_users (config_id, username, privilege, auth_method) VALUES (?, ?, ?, ?)'
);

const deleteParsedStmts = [
  db.prepare('DELETE FROM parsed_router_interfaces WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_vlans WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_static_routes WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_acls WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_nat_rules WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_dhcp_pools WHERE config_id = ?'),
  db.prepare('DELETE FROM parsed_router_users WHERE config_id = ?'),
];

function deleteAllParsedForConfig(configId: number) {
  for (const stmt of deleteParsedStmts) stmt.run(configId);
}

function insertParsedEntities(configId: number, parsed: ParsedRouterConfig) {
  for (const i of parsed.interfaces) {
    insertInterface.run(configId, i.interface_name, i.description, i.ip_address, i.subnet_mask, i.vlan, i.admin_status, i.mac_address);
  }
  for (const v of parsed.vlans) {
    insertVlan.run(configId, v.vlan_id, v.name);
  }
  for (const r of parsed.static_routes) {
    insertStaticRoute.run(configId, r.destination, r.mask, r.next_hop, r.metric, r.admin_distance);
  }
  for (const a of parsed.acls) {
    insertAcl.run(configId, a.acl_name, a.sequence, a.action, a.protocol, a.src, a.src_port, a.dst, a.dst_port);
  }
  for (const n of parsed.nat_rules) {
    insertNatRule.run(configId, n.nat_type, n.protocol, n.inside_src, n.inside_port, n.outside_src, n.outside_port);
  }
  for (const d of parsed.dhcp_pools) {
    insertDhcpPool.run(
      configId,
      d.pool_name,
      d.network,
      d.netmask,
      d.default_router,
      d.dns_servers.length ? JSON.stringify(d.dns_servers) : null,
      d.lease_time,
      d.domain_name
    );
  }
  for (const u of parsed.users) {
    insertUser.run(configId, u.username, u.privilege, u.auth_method);
  }
}

function runParser(vendor: string, raw: string): ParsedRouterConfig | null {
  const parser = routerConfigParsers[vendor];
  if (!parser) return null;
  try {
    return parser(raw);
  } catch (err) {
    throw new Error(`Parse failed for ${vendor}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ----- Transactions -----
const submitConfig = db.transaction((deviceId: number, body: SubmitRouterConfigRequest, projectId: number) => {
  const shouldParse = body.parse_output !== false;
  let parsed: ParsedRouterConfig | null = null;
  if (shouldParse) {
    parsed = runParser(body.vendor, body.raw_config);
  }
  const meta = parsed?.metadata;
  const result = insertConfig.run(
    deviceId,
    projectId,
    body.vendor,
    body.raw_config,
    body.title || null,
    shouldParse ? 1 : 0,
    meta?.hostname ?? null,
    meta?.os_version ?? null,
    meta?.model ?? null,
    meta?.domain ?? null,
    meta?.timezone ?? null,
    meta?.ntp_servers?.length ? JSON.stringify(meta.ntp_servers) : null
  );
  const configId = result.lastInsertRowid as number;
  if (parsed) {
    insertParsedEntities(configId, parsed);
  }
  return configId;
});

const toggleParseConfig = db.transaction((id: number, enable: boolean) => {
  const config = db.prepare('SELECT * FROM router_configs WHERE id = ?').get(id) as any;
  if (!config) return null;

  if (enable && !config.parse_output) {
    const parsed = runParser(config.vendor, config.raw_config);
    if (parsed) {
      insertParsedEntities(id, parsed);
      updateConfigMetadata.run(
        parsed.metadata.hostname,
        parsed.metadata.os_version,
        parsed.metadata.model,
        parsed.metadata.domain,
        parsed.metadata.timezone,
        parsed.metadata.ntp_servers.length ? JSON.stringify(parsed.metadata.ntp_servers) : null,
        id
      );
    }
    db.prepare('UPDATE router_configs SET parse_output = 1 WHERE id = ?').run(id);
  } else if (!enable && config.parse_output) {
    deleteAllParsedForConfig(id);
    db.prepare('UPDATE router_configs SET parse_output = 0 WHERE id = ?').run(id);
  }

  return db.prepare('SELECT * FROM router_configs WHERE id = ?').get(id);
});

const updateConfigTx = db.transaction((id: number, body: UpdateRouterConfigRequest) => {
  const existing = db.prepare('SELECT * FROM router_configs WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const sets: string[] = [];
  const values: any[] = [];
  if (body.raw_config !== undefined) {
    sets.push('raw_config = ?');
    values.push(body.raw_config);
  }
  if (body.captured_at !== undefined) {
    // Normalise datetime-local format (YYYY-MM-DDTHH:MM) to SQLite format
    const normalised = body.captured_at.replace('T', ' ');
    const capturedAt = normalised.length === 16 ? normalised + ':00' : normalised;
    sets.push('captured_at = ?');
    values.push(capturedAt);
  }
  if (body.title !== undefined) {
    sets.push('title = ?');
    values.push(body.title || null);
  }
  if (body.vendor !== undefined) {
    if (!VALID_VENDORS.includes(body.vendor)) {
      throw new Error(`Invalid vendor: ${body.vendor}`);
    }
    sets.push('vendor = ?');
    values.push(body.vendor);
  }

  if (sets.length > 0) {
    db.prepare(`UPDATE router_configs SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
  }

  const rawChanged = body.raw_config !== undefined && body.raw_config !== existing.raw_config;
  const vendorChanged = body.vendor !== undefined && body.vendor !== existing.vendor;
  if ((rawChanged || vendorChanged) && existing.parse_output) {
    const newVendor = body.vendor ?? existing.vendor;
    const newRaw = body.raw_config ?? existing.raw_config;
    deleteAllParsedForConfig(id);
    const parsed = runParser(newVendor, newRaw);
    if (parsed) {
      insertParsedEntities(id, parsed);
      updateConfigMetadata.run(
        parsed.metadata.hostname,
        parsed.metadata.os_version,
        parsed.metadata.model,
        parsed.metadata.domain,
        parsed.metadata.timezone,
        parsed.metadata.ntp_servers.length ? JSON.stringify(parsed.metadata.ntp_servers) : null,
        id
      );
    } else {
      // Vendor without a parser — clear metadata
      updateConfigMetadata.run(null, null, null, null, null, null, id);
    }
  }

  return db.prepare('SELECT * FROM router_configs WHERE id = ?').get(id);
});

// ----- POST -----
router.post('/device/:deviceId', (req, res) => {
  const projectId = res.locals.projectId;
  const deviceId = parseInt(req.params.deviceId, 10);
  if (!verifyDeviceOwnership(deviceId, projectId)) {
    return res.status(404).json({ error: 'Device not found in this project' });
  }
  const body = req.body as SubmitRouterConfigRequest;
  if (!body.vendor || !VALID_VENDORS.includes(body.vendor)) {
    return res.status(400).json({ error: 'Invalid vendor' });
  }
  if (typeof body.raw_config !== 'string' || !body.raw_config.trim()) {
    return res.status(400).json({ error: 'raw_config is required' });
  }
  if (Buffer.byteLength(body.raw_config, 'utf8') > MAX_RAW_CONFIG_SIZE) {
    return res.status(400).json({ error: 'Raw config exceeds 50 MB limit' });
  }
  try {
    const configId = submitConfig(deviceId, body, projectId);
    const config = db.prepare('SELECT * FROM router_configs WHERE id = ?').get(configId);
    const device = db.prepare('SELECT name FROM devices WHERE id = ?').get(deviceId) as { name: string } | undefined;
    logActivity({
      projectId,
      action: 'captured',
      resourceType: 'router_config',
      resourceId: configId,
      resourceName: device?.name ?? String(deviceId),
      details: { vendor: body.vendor },
    });
    res.status(201).json(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Parse failed')) {
      console.warn('Router config parse error:', message);
      return res.status(400).json({ error: message });
    }
    console.error('Router config submission failed:', err);
    res.status(500).json({ error: 'Failed to save router config' });
  }
});

// ----- PATCH toggle parse -----
router.patch('/:id/parse', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyRouterConfigOwnership(req.params.id, projectId)) {
    return res.status(404).json({ error: 'Router config not found' });
  }
  const { parse_output } = req.body;
  if (typeof parse_output !== 'boolean') {
    return res.status(400).json({ error: 'parse_output must be a boolean' });
  }
  try {
    const result = toggleParseConfig(Number(req.params.id), parse_output);
    if (!result) return res.status(404).json({ error: 'Router config not found' });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Parse failed')) {
      return res.status(400).json({ error: message });
    }
    console.error('Router config toggle failed:', err);
    res.status(500).json({ error: 'Failed to toggle parsing' });
  }
});

// ----- PATCH update -----
router.patch('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  if (!verifyRouterConfigOwnership(req.params.id, projectId)) {
    return res.status(404).json({ error: 'Router config not found' });
  }
  const body = req.body as UpdateRouterConfigRequest;
  if (body.raw_config !== undefined && Buffer.byteLength(body.raw_config, 'utf8') > MAX_RAW_CONFIG_SIZE) {
    return res.status(400).json({ error: 'Raw config exceeds 50 MB limit' });
  }
  try {
    const result = updateConfigTx(Number(req.params.id), body);
    if (!result) return res.status(404).json({ error: 'Router config not found' });
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.startsWith('Parse failed') || message.startsWith('Invalid vendor')) {
      return res.status(400).json({ error: message });
    }
    console.error('Router config update failed:', err);
    res.status(500).json({ error: 'Failed to update router config' });
  }
});

// ----- DELETE -----
router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare(
    `SELECT rc.vendor, d.name as device_name, rc.project_id
       FROM router_configs rc LEFT JOIN devices d ON rc.device_id = d.id
      WHERE rc.id = ? AND rc.project_id = ?`
  ).get(req.params.id, projectId) as { vendor: string; device_name: string | null; project_id: number } | undefined;
  const result = db.prepare('DELETE FROM router_configs WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  if (result.changes === 0) return res.status(404).json({ error: 'Router config not found' });
  if (existing) {
    logActivity({
      projectId: existing.project_id ?? projectId,
      action: 'deleted',
      resourceType: 'router_config',
      resourceId: Number(req.params.id),
      resourceName: existing.device_name ?? undefined,
      details: { vendor: existing.vendor },
    });
  }
  res.status(204).send();
});

export default router;
