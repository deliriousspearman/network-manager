import { Router } from 'express';
import db from '../db/connection.js';

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
  const result = db.prepare(
    'INSERT INTO highlight_rules (keyword, category, color, text_color, project_id) VALUES (?, ?, ?, ?, ?)'
  ).run(keyword.trim(), category.trim(), color.trim(), text_color?.trim() || null, projectId);
  const rule = db.prepare('SELECT * FROM highlight_rules WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(rule);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  db.prepare('DELETE FROM highlight_rules WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  res.status(204).send();
});

export default router;
