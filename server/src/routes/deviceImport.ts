import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { parsePcap, type PcapHost } from '../parsers/pcap.js';
import { parseArp } from '../parsers/arp.js';
import { parseNmapXml, type NmapAnalyzedHost as ParsedNmapHost } from '../parsers/nmapXml.js';
import type { PcapApplyAction, PcapAnalyzedHost, DeviceType, NmapAnalyzedHost, NmapApplyAction } from 'shared/types';
import { DEVICE_IMPORT_MAX_BYTES as MAX_SIZE } from '../config/limits.js';

const router = Router({ mergeParams: true });

const DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone'];

// ── Prepared statements ──────────────────────────────────────────────────

const findDeviceByIp = db.prepare(`
  SELECT d.id, d.name FROM devices d
  JOIN device_ips di ON di.device_id = d.id
  WHERE d.project_id = ? AND di.ip_address = ?
  LIMIT 1
`);

const findDeviceByMac = db.prepare(`
  SELECT id, name FROM devices
  WHERE project_id = ? AND LOWER(mac_address) = LOWER(?)
  LIMIT 1
`);

const insertDevice = db.prepare(
  'INSERT INTO devices (name, type, mac_address, project_id, hosting_type, status) VALUES (?, ?, ?, ?, ?, ?)'
);

const insertIp = db.prepare(
  'INSERT INTO device_ips (device_id, ip_address, label, is_primary) VALUES (?, ?, ?, ?)'
);

const insertPort = db.prepare(
  'INSERT INTO device_ports (device_id, project_id, port_number, state, service) VALUES (?, ?, ?, ?, ?)'
);

const ipExists = db.prepare(
  'SELECT 1 FROM device_ips WHERE device_id = ? AND ip_address = ?'
);

const portExists = db.prepare(
  'SELECT 1 FROM device_ports WHERE device_id = ? AND port_number = ? AND project_id = ?'
);

const getDevice = db.prepare('SELECT id, mac_address FROM devices WHERE id = ? AND project_id = ?');

const updateMac = db.prepare('UPDATE devices SET mac_address = ? WHERE id = ?');

// ── Shared host matching ─────────────────────────────────────────────────

function matchHosts(hosts: PcapHost[], projectId: number): PcapAnalyzedHost[] {
  return hosts.map(host => {
    const ipMatch = findDeviceByIp.get(projectId, host.ip) as { id: number; name: string } | undefined;
    if (ipMatch) {
      return { ...host, matchedDevice: { id: ipMatch.id, name: ipMatch.name, matchType: 'ip' as const } };
    }
    for (const mac of host.macs) {
      const macMatch = findDeviceByMac.get(projectId, mac) as { id: number; name: string } | undefined;
      if (macMatch) {
        return { ...host, matchedDevice: { id: macMatch.id, name: macMatch.name, matchType: 'mac' as const } };
      }
    }
    return { ...host, matchedDevice: null };
  });
}

// ── POST /pcap/analyze ───────────────────────────────────────────────────

router.post('/pcap/analyze', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { filename, data } = req.body as { filename?: string; data?: string };

  if (!data || typeof data !== 'string') {
    return res.status(400).json({ error: 'data (base64) is required' });
  }

  let buf: Buffer;
  try {
    buf = Buffer.from(data, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 data' });
  }

  if (buf.length > MAX_SIZE) {
    return res.status(400).json({ error: 'File too large (max 10 MB)' });
  }

  let parsed: ReturnType<typeof parsePcap>;
  try {
    parsed = parsePcap(buf);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  res.json({
    hosts: matchHosts(parsed.hosts, projectId),
    totalPackets: parsed.totalPackets,
    filename: filename || 'capture.pcap',
  });
});

// ── POST /arp/analyze ────────────────────────────────────────────────────

router.post('/arp/analyze', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { filename, data, text: rawText } = req.body as { filename?: string; data?: string; text?: string };

  let text: string;
  if (rawText && typeof rawText === 'string') {
    text = rawText;
  } else if (data && typeof data === 'string') {
    try {
      text = Buffer.from(data, 'base64').toString('utf-8');
    } catch {
      return res.status(400).json({ error: 'Invalid base64 data' });
    }
  } else {
    return res.status(400).json({ error: 'text or data (base64) is required' });
  }

  const arpHosts = parseArp(text);

  if (arpHosts.length === 0) {
    return res.json({ hosts: [], totalPackets: 0, filename: filename || 'arp.txt' });
  }

  const hosts = matchHosts(
    arpHosts.map(h => ({ ip: h.ip, macs: [h.mac], ports: [], packetCount: 1 })),
    projectId,
  );

  res.json({
    hosts,
    totalPackets: arpHosts.length,
    filename: filename || 'arp.txt',
  });
});

// ── POST /apply ──────────────────────────────────────────────────────────

const applyActions = db.transaction((actions: PcapApplyAction[], projectId: number) => {
  let created = 0;
  let merged = 0;
  let skipped = 0;

  for (const action of actions) {
    if (action.action === 'skip') {
      skipped++;
      continue;
    }

    if (action.action === 'create') {
      const name = action.newDeviceName?.trim() || action.ip;
      const type = (action.newDeviceType && DEVICE_TYPES.includes(action.newDeviceType) ? action.newDeviceType : 'server') as DeviceType;
      const mac = action.macs.length > 0 ? action.macs[0] : null;

      const result = insertDevice.run(name, type, mac, projectId, null, null);
      const deviceId = result.lastInsertRowid as number;

      // Add IP
      insertIp.run(deviceId, action.ip, null, 1);

      // Add ports
      for (const p of action.ports) {
        insertPort.run(deviceId, projectId, p.port, `OPEN`, `${p.protocol}/${p.port}`);
      }

      created++;
    }

    if (action.action === 'merge' && action.mergeDeviceId) {
      const device = getDevice.get(action.mergeDeviceId, projectId) as { id: number; mac_address: string | null } | undefined;
      if (!device) {
        skipped++; // device gone between analyze and apply
        continue;
      }

      // Add IP if not already on device
      if (!ipExists.get(device.id, action.ip)) {
        insertIp.run(device.id, action.ip, null, 0);
      }

      // Set MAC if device has none
      if (!device.mac_address && action.macs.length > 0) {
        updateMac.run(action.macs[0], device.id);
      }

      // Add ports not already on device
      for (const p of action.ports) {
        if (!portExists.get(device.id, p.port, projectId)) {
          insertPort.run(device.id, projectId, p.port, 'OPEN', `${p.protocol}/${p.port}`);
        }
      }

      merged++;
    }
  }

  return { created, merged, skipped };
});

router.post('/apply', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { actions } = req.body as { actions?: PcapApplyAction[] };

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'actions array is required' });
  }

  try {
    const result = applyActions(actions, projectId);

    logActivity({
      projectId,
      action: 'imported_pcap',
      resourceType: 'pcap',
      details: { created: result.created, merged: result.merged, skipped: result.skipped },
    });

    res.json(result);
  } catch (e) {
    console.error('PCAP apply error:', e);
    res.status(500).json({ error: 'Failed to apply PCAP import actions' });
  }
});

// ── POST /nmap/analyze ───────────────────────────────────────────────────

function decodePayload(raw: { data?: string; text?: string }): string | { error: string } {
  if (raw.text && typeof raw.text === 'string') return raw.text;
  if (raw.data && typeof raw.data === 'string') {
    try {
      return Buffer.from(raw.data, 'base64').toString('utf-8');
    } catch {
      return { error: 'Invalid base64 data' };
    }
  }
  return { error: 'text or data (base64) is required' };
}

function matchNmapHosts(hosts: ParsedNmapHost[], projectId: number): NmapAnalyzedHost[] {
  return hosts.map(host => {
    const ipMatch = findDeviceByIp.get(projectId, host.ip) as { id: number; name: string } | undefined;
    if (ipMatch) {
      return { ...host, matchedDevice: { id: ipMatch.id, name: ipMatch.name, matchType: 'ip' as const } };
    }
    for (const mac of host.macs) {
      const macMatch = findDeviceByMac.get(projectId, mac) as { id: number; name: string } | undefined;
      if (macMatch) {
        return { ...host, matchedDevice: { id: macMatch.id, name: macMatch.name, matchType: 'mac' as const } };
      }
    }
    return { ...host, matchedDevice: null };
  });
}

router.post('/nmap/analyze', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { filename } = req.body as { filename?: string; data?: string; text?: string };

  const decoded = decodePayload(req.body);
  if (typeof decoded !== 'string') return res.status(400).json(decoded);
  if (Buffer.byteLength(decoded, 'utf-8') > MAX_SIZE) {
    return res.status(400).json({ error: 'File too large (max 10 MB)' });
  }

  let parsed: ReturnType<typeof parseNmapXml>;
  try {
    parsed = parseNmapXml(decoded);
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }

  res.json({
    hosts: matchNmapHosts(parsed.hosts, projectId),
    scanInfo: parsed.scanInfo,
    filename: filename || 'scan.xml',
  });
});

// ── POST /nmap/apply ─────────────────────────────────────────────────────

const applyNmapActions = db.transaction((actions: NmapApplyAction[], projectId: number) => {
  let created = 0;
  let merged = 0;
  let skipped = 0;
  let portsAdded = 0;

  for (const action of actions) {
    if (action.action === 'skip') { skipped++; continue; }

    if (action.action === 'create') {
      const name = action.newDeviceName?.trim() || action.hostnames[0] || action.ip;
      const type = (action.newDeviceType && DEVICE_TYPES.includes(action.newDeviceType) ? action.newDeviceType : 'server') as DeviceType;
      const mac = action.macs.length > 0 ? action.macs[0] : null;

      const result = insertDevice.run(name, type, mac, projectId, null, null);
      const deviceId = result.lastInsertRowid as number;

      insertIp.run(deviceId, action.ip, null, 1);

      if (action.addPorts !== false) {
        for (const p of action.ports) {
          const svc = p.service ? `${p.protocol}/${p.port} ${p.service}${p.version ? ' ' + p.version : ''}` : `${p.protocol}/${p.port}`;
          insertPort.run(deviceId, projectId, p.port, p.state.toUpperCase(), svc);
          portsAdded++;
        }
      }

      created++;
      continue;
    }

    if (action.action === 'merge' && action.mergeDeviceId) {
      const device = getDevice.get(action.mergeDeviceId, projectId) as { id: number; mac_address: string | null } | undefined;
      if (!device) { skipped++; continue; }

      if (!ipExists.get(device.id, action.ip)) {
        insertIp.run(device.id, action.ip, null, 0);
      }

      if (!device.mac_address && action.macs.length > 0) {
        updateMac.run(action.macs[0], device.id);
      }

      if (action.addPorts !== false) {
        for (const p of action.ports) {
          if (!portExists.get(device.id, p.port, projectId)) {
            const svc = p.service ? `${p.protocol}/${p.port} ${p.service}${p.version ? ' ' + p.version : ''}` : `${p.protocol}/${p.port}`;
            insertPort.run(device.id, projectId, p.port, p.state.toUpperCase(), svc);
            portsAdded++;
          }
        }
      }

      merged++;
    }
  }

  return { created, merged, skipped, portsAdded };
});

router.post('/nmap/apply', (req, res) => {
  const projectId = res.locals.projectId as number;
  const { actions } = req.body as { actions?: NmapApplyAction[] };

  if (!actions || !Array.isArray(actions) || actions.length === 0) {
    return res.status(400).json({ error: 'actions array is required' });
  }

  try {
    const result = applyNmapActions(actions, projectId);

    logActivity({
      projectId,
      action: 'imported_nmap',
      resourceType: 'nmap',
      details: result,
    });

    res.json(result);
  } catch (e) {
    console.error('Nmap apply error:', e);
    res.status(500).json({ error: 'Failed to apply Nmap import actions' });
  }
});

export default router;
