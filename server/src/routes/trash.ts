import { Router } from 'express';
import db from '../db/connection.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = Router({ mergeParams: true });

// Trash is a filtered view of the activity log: entries where a resource was
// deleted, we captured enough state to restore it, and the user hasn't
// restored or purged it yet. Restoring uses the existing /undo/:logId route.
// Resource types eligible to surface in Trash. Extend this list when you add
// a new entry to the dispatch map in `undo.ts`.
const TRASH_TYPES = ['device', 'subnet', 'credential', 'agent', 'connection', 'timeline_entry', 'annotation', 'agent_annotation'];

router.get('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId as number;
  const typeFilter = (req.query.type as string | undefined)?.trim();
  // Optional: cap result set size. The global undo hotkey uses `?limit=1` to
  // peek at the most-recent undoable entry without scanning the whole log.
  const rawLimit = req.query.limit;
  const parsedLimit = rawLimit != null ? Number(rawLimit) : NaN;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(Math.floor(parsedLimit), 500) : null;

  const params: unknown[] = [projectId];
  let typeClause = '';
  if (typeFilter && TRASH_TYPES.includes(typeFilter)) {
    typeClause = ' AND resource_type = ?';
    params.push(typeFilter);
  }
  let limitClause = '';
  if (limit != null) {
    limitClause = ' LIMIT ?';
    params.push(limit);
  }

  const items = db.prepare(
    `SELECT id, action, resource_type, resource_id, resource_name, created_at
     FROM activity_logs
     WHERE project_id = ?
       AND action = 'deleted'
       AND can_undo = 1
       AND undone_at IS NULL
       AND previous_state IS NOT NULL
       ${typeClause}
     ORDER BY created_at DESC${limitClause}`
  ).all(...params);

  const counts = db.prepare(
    `SELECT resource_type, COUNT(*) as count
     FROM activity_logs
     WHERE project_id = ?
       AND action = 'deleted'
       AND can_undo = 1
       AND undone_at IS NULL
       AND previous_state IS NOT NULL
     GROUP BY resource_type`
  ).all(projectId) as { resource_type: string; count: number }[];

  res.json({ items, counts });
}));

// Permanently remove a trash entry. This is a soft action on the log row
// itself: the deleted row is already gone, so we just mark the log entry as
// non-undoable and clear previous_state to reclaim space (credential file_data
// blobs can be large).
router.delete('/:logId', asyncHandler((req, res) => {
  const projectId = res.locals.projectId as number;
  const logId = Number(req.params.logId);
  if (!Number.isFinite(logId)) return res.status(400).json({ error: 'Invalid log id' });

  const row = db.prepare(
    `SELECT id FROM activity_logs
     WHERE id = ? AND project_id = ?
       AND action = 'deleted' AND can_undo = 1 AND undone_at IS NULL`
  ).get(logId, projectId);
  if (!row) return res.status(404).json({ error: 'Trash entry not found' });

  db.prepare(
    `UPDATE activity_logs
     SET can_undo = 0, previous_state = NULL
     WHERE id = ?`
  ).run(logId);

  res.status(204).send();
}));

// Empty trash: permanently purge every undoable deletion for this project.
router.delete('/', asyncHandler((_req, res) => {
  const projectId = res.locals.projectId as number;
  db.prepare(
    `UPDATE activity_logs
     SET can_undo = 0, previous_state = NULL
     WHERE project_id = ?
       AND action = 'deleted'
       AND can_undo = 1
       AND undone_at IS NULL`
  ).run(projectId);
  res.status(204).send();
}));

export default router;
