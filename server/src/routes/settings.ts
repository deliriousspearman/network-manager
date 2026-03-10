import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';

const router = Router();

router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

router.put('/', (req, res) => {
  const { timezone } = req.body as { timezone?: string };
  if (timezone) {
    db.prepare(
      `INSERT INTO app_settings (key, value) VALUES ('timezone', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(timezone);
    logActivity({ action: 'updated', resourceType: 'settings', resourceName: 'timezone', details: { timezone } });
  }
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

export default router;
