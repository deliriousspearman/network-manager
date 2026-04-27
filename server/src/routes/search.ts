import { Router } from 'express';
import db from '../db/connection.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router({ mergeParams: true });

interface SearchResult {
  type: 'device' | 'subnet' | 'credential' | 'agent';
  id: number;
  name: string;
  detail: string;
}

interface DeviceSearchRow {
  id: number;
  name: string;
  type: string | null;
  os: string | null;
  primary_ip: string | null;
}

interface SubnetSearchRow {
  id: number;
  name: string;
  cidr: string;
  vlan_id: number | null;
}

interface CredentialSearchRow {
  id: number;
  username: string;
  host: string | null;
  type: string | null;
  device_name: string | null;
}

interface AgentSearchRow {
  id: number;
  name: string;
  agent_type: string | null;
  version: string | null;
  device_name: string | null;
}

router.get('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const q = ((req.query.q as string) || '').trim();
  if (!q || q.length < 2) {
    return res.json([]);
  }
  const like = `%${q}%`;
  const limit = 20;
  const results: SearchResult[] = [];

  // Search devices by name, IP, hostname, domain, OS, MAC, tags
  const devices = db.prepare(`
    SELECT d.id, d.name, d.type, d.os,
      (SELECT ip_address FROM device_ips WHERE device_id = d.id AND is_primary = 1 LIMIT 1) as primary_ip
    FROM devices d
    WHERE d.project_id = ? AND (
      d.name LIKE ? OR d.hostname LIKE ? OR d.domain LIKE ?
      OR d.os LIKE ? OR d.mac_address LIKE ?
      OR d.id IN (SELECT device_id FROM device_ips WHERE ip_address LIKE ?)
      OR d.id IN (SELECT device_id FROM device_tags WHERE tag LIKE ?)
    )
    LIMIT ?
  `).all(projectId, like, like, like, like, like, like, like, limit) as DeviceSearchRow[];

  for (const d of devices) {
    results.push({
      type: 'device',
      id: d.id,
      name: d.name,
      detail: [d.type, d.primary_ip, d.os].filter(Boolean).join(' · '),
    });
  }

  // Search subnets by name, CIDR, VLAN ID, description
  const subnets = db.prepare(`
    SELECT id, name, cidr, vlan_id FROM subnets
    WHERE project_id = ? AND (name LIKE ? OR cidr LIKE ? OR CAST(vlan_id AS TEXT) LIKE ? OR description LIKE ?)
    LIMIT ?
  `).all(projectId, like, like, like, like, limit) as SubnetSearchRow[];

  for (const s of subnets) {
    results.push({
      type: 'subnet',
      id: s.id,
      name: s.name,
      detail: [s.cidr, s.vlan_id ? `VLAN ${s.vlan_id}` : null].filter(Boolean).join(' · '),
    });
  }

  // Search credentials by username, host, type
  const credentials = db.prepare(`
    SELECT c.id, c.username, c.host, c.type,
      (SELECT name FROM devices WHERE id = c.device_id) as device_name
    FROM credentials c
    WHERE c.project_id = ? AND (c.username LIKE ? OR c.host LIKE ? OR c.type LIKE ? OR c.source LIKE ?)
    LIMIT ?
  `).all(projectId, like, like, like, like, limit) as CredentialSearchRow[];

  for (const c of credentials) {
    results.push({
      type: 'credential',
      id: c.id,
      name: `${c.username}@${c.host || '?'}`,
      detail: [c.type, c.device_name].filter(Boolean).join(' · '),
    });
  }

  // Search agents by name, type, version
  const agents = db.prepare(`
    SELECT a.id, a.name, a.agent_type, a.version,
      (SELECT name FROM devices WHERE id = a.device_id) as device_name
    FROM agents a
    WHERE a.project_id = ? AND (a.name LIKE ? OR a.agent_type LIKE ? OR a.version LIKE ? OR a.notes LIKE ?)
    LIMIT ?
  `).all(projectId, like, like, like, like, limit) as AgentSearchRow[];

  for (const a of agents) {
    results.push({
      type: 'agent',
      id: a.id,
      name: a.name,
      detail: [a.agent_type, a.version, a.device_name].filter(Boolean).join(' · '),
    });
  }

  res.json(results);
}));

export default router;
