import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router();

router.get('/', asyncHandler((_req, res) => {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
}));

router.put('/', asyncHandler((req, res) => {
  const { timezone, notification_enabled, notification_text, notification_bg_color, notification_text_color, notification_height, notification_font_size, notification_bold } = req.body as Record<string, string | undefined>;
  const upsert = db.prepare(`INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  if (timezone !== undefined) {
    upsert.run('timezone', timezone);
    logActivity({ action: 'updated', resourceType: 'settings', resourceName: 'timezone', details: { timezone } });
  }
  if (notification_enabled !== undefined) upsert.run('notification_enabled', notification_enabled);
  if (notification_text !== undefined) upsert.run('notification_text', typeof notification_text === 'string' ? notification_text.slice(0, 1000) : '');
  if (notification_bg_color !== undefined) upsert.run('notification_bg_color', notification_bg_color);
  if (notification_text_color !== undefined) upsert.run('notification_text_color', notification_text_color);
  if (notification_height !== undefined) upsert.run('notification_height', notification_height);
  if (notification_font_size !== undefined) upsert.run('notification_font_size', notification_font_size);
  if (notification_bold !== undefined) upsert.run('notification_bold', notification_bold);
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as { key: string; value: string }[];
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
}));

export default router;
