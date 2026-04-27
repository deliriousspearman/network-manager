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
    'INSERT INTO device_ips (device_id, ip_address, is_primary) VALUES (?, ?, ?)'
  );
  const insertTag = db.prepare(
    'INSERT OR IGNORE INTO device_tags (device_id, tag) VALUES (?, ?)'
  );

  // Batch the inserts so a 100k-row CSV doesn't hold the WAL lock for minutes
  // and roll back slowly on a parser bug. Each batch commits independently;
  // a per-row failure inside a batch still gets caught and reported (the
  // batch-level catch is just a safety net for unexpected errors that
  // escape the inner try/catch — those abort that batch only).
  const BATCH_SIZE = 5000;

  const importBatch = db.transaction((batch: typeof rows, startIndex: number) => {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < batch.length; i++) {
      const row = batch[i];
      const csvRowNum = startIndex + i + 2; // header + 1-indexed
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
            insertIp.run(deviceId, ips[j].slice(0, 50), j === 0 ? 1 : 0);
          }
        }

        if (row.tags) {
          const tags = row.tags.split(';').map(t => t.trim()).filter(Boolean);
          for (const tag of tags) {
            insertTag.run(deviceId, tag.slice(0, 100));
          }
        }

        created++;
      } catch (err: unknown) {
        skipped++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Row ${csvRowNum}: ${msg}`);
      }
    }

    return { created, skipped, errors };
  });

  const result = { created: 0, skipped: 0, errors: [] as string[] };
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const slice = rows.slice(offset, offset + BATCH_SIZE);
    try {
      const r = importBatch(slice, offset);
      result.created += r.created;
      result.skipped += r.skipped;
      result.errors.push(...r.errors);
    } catch (err: unknown) {
      // Whole-batch failure (rare — e.g. SQLite locked under contention).
      // Mark all rows in the batch as skipped and continue with later batches.
      const msg = err instanceof Error ? err.message : 'Unknown error';
      result.skipped += slice.length;
      result.errors.push(`Rows ${offset + 2}-${offset + 1 + slice.length}: batch failed (${msg})`);
    }
  }

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
