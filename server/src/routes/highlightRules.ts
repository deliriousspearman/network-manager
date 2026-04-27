import { Router } from 'express';
import db from '../db/connection.js';
import { validateColor, optionalString } from '../validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router({ mergeParams: true });

router.get('/', asyncHandler((_req, res) => {
  const projectId = res.locals.projectId;
  const rules = db.prepare('SELECT * FROM highlight_rules WHERE project_id = ? ORDER BY created_at').all(projectId);
  res.json(rules);
}));

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { keyword, category, color, text_color } = req.body as { keyword: string; category: string; color: string; text_color?: string };
  if (!keyword?.trim() || !category?.trim() || !color?.trim()) {
    res.status(400).json({ error: 'keyword, category, and color are required' });
    return;
  }
  const validKeyword = keyword.trim().slice(0, 200);
  const validCategory = category.trim().slice(0, 100);
  const validColor = validateColor(color) ?? color.trim().slice(0, 20);
  const validTextColor = validateColor(text_color) ?? optionalString(text_color, 20);
  const result = db.prepare(
    'INSERT INTO highlight_rules (keyword, category, color, text_color, project_id) VALUES (?, ?, ?, ?, ?)'
  ).run(validKeyword, validCategory, validColor, validTextColor, projectId);
  const rule = db.prepare('SELECT * FROM highlight_rules WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rule);
}));

router.put('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const id = parseInt(req.params.id as string);
  const { keyword, category, color, text_color } = req.body as { keyword: string; category: string; color: string; text_color?: string };
  if (!keyword?.trim() || !category?.trim() || !color?.trim()) {
    res.status(400).json({ error: 'keyword, category, and color are required' });
    return;
  }
  const existing = db.prepare('SELECT updated_at FROM highlight_rules WHERE id = ? AND project_id = ?').get(id, projectId) as { updated_at: string } | undefined;
  if (!existing) { res.status(404).json({ error: 'Not found' }); return; }
  if (req.body.updated_at && existing.updated_at !== req.body.updated_at) {
    res.status(409).json({ error: 'This rule was modified by another session. Please refresh and try again.' });
    return;
  }
  const validKeyword = keyword.trim().slice(0, 200);
  const validCategory = category.trim().slice(0, 100);
  const validColor = validateColor(color) ?? color.trim().slice(0, 20);
  const validTextColor = validateColor(text_color) ?? optionalString(text_color, 20);
  db.prepare(
    "UPDATE highlight_rules SET keyword = ?, category = ?, color = ?, text_color = ?, updated_at = datetime('now') WHERE id = ? AND project_id = ?"
  ).run(validKeyword, validCategory, validColor, validTextColor, id, projectId);
  const rule = db.prepare('SELECT * FROM highlight_rules WHERE id = ? AND project_id = ?').get(id, projectId);
  res.json(rule);
}));

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  db.prepare('DELETE FROM highlight_rules WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  res.status(204).send();
}));

export default router;
