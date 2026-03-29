import { Router } from 'express';
import db from '../db/connection.js';
import { validateColor, optionalString } from '../validation.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const rules = db.prepare('SELECT * FROM highlight_rules WHERE project_id = ? ORDER BY created_at').all(projectId);
  res.json(rules);
});

router.post('/', (req, res) => {
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
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = parseInt(req.params.id);
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
    'UPDATE highlight_rules SET keyword = ?, category = ?, color = ?, text_color = ? WHERE id = ? AND project_id = ?'
  ).run(validKeyword, validCategory, validColor, validTextColor, id, projectId);
  if (result.changes === 0) { res.status(404).json({ error: 'Not found' }); return; }
  const rule = db.prepare('SELECT * FROM highlight_rules WHERE id = ?').get(id);
  res.json(rule);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  db.prepare('DELETE FROM highlight_rules WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  res.status(204).send();
});

export default router;
