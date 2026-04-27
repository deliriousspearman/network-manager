import { Router } from 'express';
import db from '../db/connection.js';
import { parsePagination, pagedResponse } from '../utils/pagination.js';

const router = Router();

router.get('/', (req, res) => {
  const search = ((req.query.search as string) || '').trim();
  const resourceType = ((req.query.resource_type as string) || '').trim();
  const action = ((req.query.action as string) || '').trim();

  let filterClause = '';
  const filterParams: unknown[] = [];
  if (search) {
    const like = `%${search}%`;
    filterClause += ` AND (a.resource_name LIKE ? OR a.details LIKE ?)`;
    filterParams.push(like, like);
  }
  if (resourceType) {
    filterClause += ` AND a.resource_type = ?`;
    filterParams.push(resourceType);
  }
  if (action) {
    filterClause += ` AND a.action = ?`;
    filterParams.push(action);
  }

  const where = `WHERE 1=1${filterClause}`;

  if (req.query.page !== undefined) {
    const { page, limit, offset } = parsePagination(req, { maxLimit: 500 });
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM activity_logs a ${where}`).get(...filterParams) as { total: number };
    const items = db.prepare(
      `SELECT a.*, p.name AS project_name
       FROM activity_logs a
       LEFT JOIN projects p ON a.project_id = p.id
       ${where}
       ORDER BY a.created_at DESC
       LIMIT ? OFFSET ?`
    ).all(...filterParams, limit, offset) as unknown[];
    return res.json(pagedResponse(items, total, page, limit));
  }

  const logs = db.prepare(
    `SELECT a.*, p.name AS project_name
     FROM activity_logs a
     LEFT JOIN projects p ON a.project_id = p.id
     ${where}
     ORDER BY a.created_at DESC`
  ).all(...filterParams);
  res.json(logs);
});

export default router;
