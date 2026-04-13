import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, optionalString, optionalOneOf } from '../validation.js';

const router = Router({ mergeParams: true });

const VALID_CATEGORIES = ['general', 'decision', 'change', 'incident', 'milestone', 'note'] as const;

function validateEventDate(val: unknown): string | null {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(val)) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  return val;
}

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;
  const category = ((req.query.category as string) || '').trim();
  const from = ((req.query.from as string) || '').trim();
  const to = ((req.query.to as string) || '').trim();
  const search = ((req.query.search as string) || '').trim();

  let filterClause = '';
  const filterParams: unknown[] = [];
  if (category && (VALID_CATEGORIES as readonly string[]).includes(category)) {
    filterClause += ' AND category = ?';
    filterParams.push(category);
  }
  if (from) {
    filterClause += ' AND event_date >= ?';
    filterParams.push(from);
  }
  if (to) {
    filterClause += ' AND event_date <= ?';
    filterParams.push(to + 'T23:59:59');
  }
  if (search) {
    const like = `%${search}%`;
    filterClause += ' AND (title LIKE ? OR description LIKE ?)';
    filterParams.push(like, like);
  }

  const where = `WHERE project_id = ?${filterClause}`;
  const baseParams = [projectId, ...filterParams];

  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
  const offset = (page - 1) * limit;

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM timeline_entries ${where}`
  ).get(...baseParams) as { total: number };

  const items = db.prepare(
    `SELECT * FROM timeline_entries ${where} ORDER BY event_date DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...baseParams, limit, offset);

  res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!entry) return res.status(404).json({ error: 'Timeline entry not found' });
  res.json(entry);
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  let title: string;
  try {
    title = requireString(req.body.title, 'title', 200);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }
  const description = optionalString(req.body.description, 5000);
  const category = optionalOneOf(req.body.category, [...VALID_CATEGORIES]) || 'general';
  const eventDate = validateEventDate(req.body.event_date);

  const result = db.prepare(
    `INSERT INTO timeline_entries (project_id, title, description, event_date, category)
     VALUES (?, ?, ?, ${eventDate ? '?' : "datetime('now')"}, ?)`
  ).run(...[projectId, title, description, ...(eventDate ? [eventDate] : []), category]);

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(result.lastInsertRowid);
  logActivity({ projectId, action: 'created', resourceType: 'timeline_entry', resourceId: result.lastInsertRowid as number, resourceName: title });
  res.status(201).json(entry);
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  let title: string;
  try {
    title = requireString(req.body.title, 'title', 200);
  } catch (e) {
    if (e instanceof ValidationError) return res.status(400).json({ error: e.message });
    throw e;
  }

  if (req.body.updated_at) {
    const existing = db.prepare('SELECT updated_at FROM timeline_entries WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { updated_at: string } | undefined;
    if (existing && existing.updated_at !== req.body.updated_at) {
      return res.status(409).json({ error: 'This entry was modified by another session. Please refresh and try again.' });
    }
  }

  const description = optionalString(req.body.description, 5000);
  const category = optionalOneOf(req.body.category, [...VALID_CATEGORIES]) || 'general';
  const eventDate = validateEventDate(req.body.event_date);

  const result = db.prepare(
    `UPDATE timeline_entries SET title = ?, description = ?, event_date = ${eventDate ? '?' : 'event_date'}, category = ?, updated_at = datetime('now')
     WHERE id = ? AND project_id = ?`
  ).run(...[title, description, ...(eventDate ? [eventDate] : []), category, req.params.id, projectId]);

  if (result.changes === 0) return res.status(404).json({ error: 'Timeline entry not found' });

  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ?').get(req.params.id);
  logActivity({ projectId, action: 'updated', resourceType: 'timeline_entry', resourceId: Number(req.params.id), resourceName: title });
  res.json(entry);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT title FROM timeline_entries WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as { title: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Timeline entry not found' });
  db.prepare('DELETE FROM timeline_entries WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'timeline_entry', resourceId: Number(req.params.id), resourceName: existing.title });
  res.status(204).send();
});

export default router;
