import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { parseCsv } from '../parsers/csv.js';

const router = Router({ mergeParams: true });

const VALID_DEVICE_TYPES = ['server', 'workstation', 'router', 'switch', 'nas', 'firewall', 'access_point', 'iot', 'camera', 'phone'];

/** POST /preview — parse CSV and return preview without creating anything */
router.post('/preview', asyncHandler((req, res) => {
  const { csv_text } = req.body as { csv_text: string };
  if (!csv_text?.trim()) {
    return res.status(400).json({ error: 'csv_text is required' });
  }

  const rows = parseCsv(csv_text);
  const preview = rows.map((row, i) => ({
    row: i + 2, // 1-indexed, +1 for header
    name: row.name,
    type: row.type || 'server',
    type_valid: !row.type || VALID_DEVICE_TYPES.includes(row.type.toLowerCase()),
    ip_address: row.ip_address || null,
    mac_address: row.mac_address || null,
    os: row.os || null,
    hostname: row.hostname || null,
    domain: row.domain || null,
    location: row.location || null,
    tags: row.tags || null,
  }));

  res.json({ total: preview.length, rows: preview });
}));

/** POST /apply — parse CSV and create devices */
router.post('/apply', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { csv_text } = req.body as { csv_text: string };
  if (!csv_text?.trim()) {
    return res.status(400).json({ error: 'csv_text is required' });
  }

  const rows = parseCsv(csv_text);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid rows found in CSV' });
  }

  const insertDevice = db.prepare(
    'INSERT INTO devices (name, type, mac_address, os, hostname, domain, location, project_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insertIp = db.prepare(
    'INSERT INTO device_ips (device_id, ip_address, is_primary) VALUES (?, ?, 1)'
  );
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO device_tags (device_id, tag) VALUES (?, ?)'
  );

  const importDevices = db.transaction(() => {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const type = VALID_DEVICE_TYPES.includes((row.type || '').toLowerCase())
          ? row.type.toLowerCase()
          : 'server';

        const result = insertDevice.run(
          row.name.slice(0, 200),
          type,
          (row.mac_address || '').slice(0, 50) || null,
          (row.os || '').slice(0, 200) || null,
          (row.hostname || '').slice(0, 200) || null,
          (row.domain || '').slice(0, 200) || null,
          (row.location || '').slice(0, 200) || null,
          projectId,
        );
        const deviceId = result.lastInsertRowid as number;

        if (row.ip_address) {
          // Support multiple IPs separated by semicolons
          const ips = row.ip_address.split(';').map(ip => ip.trim()).filter(Boolean);
          for (let j = 0; j < ips.length; j++) {
            db.prepare(
              'INSERT INTO device_ips (device_id, ip_address, is_primary) VALUES (?, ?, ?)'
            ).run(deviceId, ips[j].slice(0, 50), j === 0 ? 1 : 0);
          }
        }

        if (row.tags) {
          const tags = row.tags.split(';').map(t => t.trim()).filter(Boolean);
          for (const tag of tags) {
            insertTag.run(deviceId, tag.slice(0, 100));
          }
        }

        created++;
      } catch (err: any) {
        skipped++;
        errors.push(`Row ${i + 2}: ${err?.message || 'Unknown error'}`);
      }
    }

    return { created, skipped, errors };
  });

  const result = importDevices();

  logActivity({
    projectId,
    action: 'imported',
    resourceType: 'device',
    resourceName: `CSV import (${result.created} created)`,
  });

  res.json(result);
}));

/** GET /template — download a CSV template */
router.get('/template', (_req, res) => {
  const template = 'name,type,ip_address,mac_address,os,hostname,domain,location,tags\n'
    + 'Web Server 01,server,192.168.1.10,AA:BB:CC:DD:EE:FF,Ubuntu 22.04,web01,example.com,Rack A,web;production\n'
    + 'Core Switch,switch,10.0.0.1,,Cisco IOS,,,,network;core\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="device-import-template.csv"');
  res.send(template);
});

export default router;
