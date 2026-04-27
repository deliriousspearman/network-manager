import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { requireString, optionalString, optionalOneOf } from '../validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { parsePagination, pagedResponse } from '../utils/pagination.js';

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

router.get('/', asyncHandler((req, res) => {
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

  const { page, limit, offset } = parsePagination(req);

  const { total } = db.prepare(
    `SELECT COUNT(*) as total FROM timeline_entries ${where}`
  ).get(...baseParams) as { total: number };

  const items = db.prepare(
    `SELECT * FROM timeline_entries ${where} ORDER BY event_date DESC, created_at DESC LIMIT ? OFFSET ?`
  ).all(...baseParams, limit, offset) as unknown[];

  res.json(pagedResponse(items, total, page, limit));
}));

// Lightweight projection used by the timeline axis overview: no pagination,
// no description field, just the minimum needed to place a dot on the axis.
router.get('/summary', asyncHandler((req, res) => {
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

  const rows = db.prepare(
    `SELECT id, event_date, category, title FROM timeline_entries
     WHERE project_id = ?${filterClause}
     ORDER BY event_date ASC`
  ).all(projectId, ...filterParams);

  res.json(rows);
}));

router.get('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!entry) return res.status(404).json({ error: 'Timeline entry not found' });
  res.json(entry);
}));

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const title = requireString(req.body.title, 'title', 200);
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
}));

router.put('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const title = requireString(req.body.title, 'title', 200);

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
}));

// Snapshot + DELETE + activity log in one transaction. Throws 'NOT_FOUND'
// if the entry doesn't exist in this project. Returns the log id (or null
// if logActivity failed) so the single-DELETE handler can echo it back.
const deleteTimelineRow = db.transaction((entryId: number, projectId: number) => {
  const entry = db.prepare('SELECT * FROM timeline_entries WHERE id = ? AND project_id = ?').get(entryId, projectId) as Record<string, unknown> | undefined;
  if (!entry) throw new Error('NOT_FOUND');
  db.prepare('DELETE FROM timeline_entries WHERE id = ? AND project_id = ?').run(entryId, projectId);
  const logId = logActivity({
    projectId, action: 'deleted', resourceType: 'timeline_entry',
    resourceId: entryId, resourceName: entry.title as string,
    previousState: { entry },
    canUndo: true,
  });
  return { entry, logId };
});

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  try {
    const { logId } = deleteTimelineRow(Number(req.params.id), projectId);
    res.json({ log_id: logId });
  } catch (err) {
    // Idempotent: a missing row means another tab already deleted it.
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.json({ log_id: null });
    }
    throw err;
  }
}));

const TIMELINE_BULK_MAX_IDS = 500;

router.post('/bulk-delete', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > TIMELINE_BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot delete more than ${TIMELINE_BULK_MAX_IDS} entries at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      deleteTimelineRow(id, projectId);
      deleted.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id, error: msg === 'NOT_FOUND' ? 'Not found' : msg });
    }
  }
  res.json({ deleted, failed });
}));

export default router;
