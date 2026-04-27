import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { splitCsvLine } from '../parsers/csv.js';
import { requireString, optionalString } from '../validation.js';

const router = Router({ mergeParams: true });

const CREDENTIAL_TYPES = ['SSH', 'RDP', 'HTTP', 'SNMP', 'SQL', 'VPN', 'SSH Key', 'Other'];

interface CredentialRow {
  username: string;
  password: string;
  type: string;
  host: string;
  device_name: string;
  source: string;
  used: string;
}

/** Parse CSV text into credential rows (headers normalized to snake_case). */
function parseCredentialCsv(text: string): CredentialRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
  const rows: CredentialRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i]);
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = (values[j] || '').trim();
    }
    rows.push(row as unknown as CredentialRow);
  }
  return rows;
}

/** Map of lowercase device name → id, scoped to a project. */
function deviceNameMap(projectId: number): Map<string, number> {
  const rows = db.prepare('SELECT id, name FROM devices WHERE project_id = ?').all(projectId) as { id: number; name: string }[];
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.name.trim().toLowerCase(), r.id);
  return map;
}

function parseUsed(val: string | undefined): 0 | 1 {
  const s = (val || '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' ? 1 : 0;
}

/** POST /preview — parse CSV and return preview without creating anything */
router.post('/preview', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { csv_text } = req.body as { csv_text: string };
  if (!csv_text?.trim()) {
    return res.status(400).json({ error: 'csv_text is required' });
  }

  const rows = parseCredentialCsv(csv_text);
  const devices = deviceNameMap(projectId);

  const preview = rows.map((row, i) => {
    const deviceNameTrim = (row.device_name || '').trim();
    const deviceMatched = deviceNameTrim ? devices.has(deviceNameTrim.toLowerCase()) : null;
    return {
      row: i + 2,
      username: row.username || '',
      username_valid: !!row.username?.trim(),
      host: row.host || null,
      password_masked: row.password ? '•••••' : '',
      type: row.type || '',
      type_valid: !row.type || CREDENTIAL_TYPES.includes(row.type),
      source: row.source || null,
      used: parseUsed(row.used) === 1,
      device_name: deviceNameTrim || null,
      device_matched: deviceMatched,
    };
  });

  res.json({ total: preview.length, rows: preview });
}));

/** POST /apply — parse CSV and create credentials */
router.post('/apply', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { csv_text } = req.body as { csv_text: string };
  if (!csv_text?.trim()) {
    return res.status(400).json({ error: 'csv_text is required' });
  }

  const rows = parseCredentialCsv(csv_text);
  if (rows.length === 0) {
    return res.status(400).json({ error: 'No valid rows found in CSV' });
  }

  const devices = deviceNameMap(projectId);

  const insert = db.prepare(
    `INSERT INTO credentials (device_id, host, username, password, type, source, used, project_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const importCreds = db.transaction(() => {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const username = requireString(row.username, 'username', 200);
        const host = optionalString(row.host, 500);
        const password = optionalString(row.password, 500);
        const source = optionalString(row.source, 500);
        const type = row.type && CREDENTIAL_TYPES.includes(row.type) ? row.type : null;
        const used = parseUsed(row.used);

        const deviceNameTrim = (row.device_name || '').trim();
        const deviceId = deviceNameTrim ? devices.get(deviceNameTrim.toLowerCase()) ?? null : null;

        insert.run(deviceId, host, username, password, type, source, used, projectId);
        imported++;
      } catch (err: unknown) {
        skipped++;
        const msg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`Row ${i + 2}: ${msg}`);
      }
    }

    return { imported, skipped, errors };
  });

  const result = importCreds();

  logActivity({
    projectId,
    action: 'imported',
    resourceType: 'credential',
    resourceName: `CSV import (${result.imported} created)`,
  });

  res.json(result);
}));

/** GET /template — download a CSV template */
router.get('/template', (_req, res) => {
  const template = 'username,password,type,host,device_name,source,used\n'
    + 'admin,s3cret,SSH,192.168.1.1,Core Switch,Initial deploy,false\n'
    + 'readonly,,HTTP,10.0.0.5,,Monitoring,true\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="credential-import-template.csv"');
  res.send(template);
});

export default router;
