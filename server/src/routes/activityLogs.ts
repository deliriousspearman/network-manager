import { Router } from 'express';
import db from '../db/connection.js';
import { pagedResponse } from '../utils/pagination.js';
import { buildListQuery } from '../utils/listQuery.js';

const router = Router({ mergeParams: true });

router.get('/', (req, res) => {
  const projectId = res.locals.projectId;

  const { whereClause, whereParams, orderBy, pagination } = buildListQuery(req, {
    projectId,
    projectColumn: 'a.project_id',
    search: { columns: ['a.resource_name', 'a.details'] },
    filters: {
      resource_type: { column: 'a.resource_type', type: 'string' },
      action: { column: 'a.action', type: 'string' },
      resource_id: { column: 'a.resource_id', type: 'int' },
      since: { column: 'a.created_at', type: 'datetime', operator: '>=' },
      // valueSuffix makes 12:00 cover 12:00:00–12:00:59 (datetime-local has no seconds).
      until: { column: 'a.created_at', type: 'datetime', operator: '<=', valueSuffix: ':59' },
    },
    sort: { map: {}, default: 'a.created_at', defaultDir: 'desc' },
    pagination: { maxLimit: 500 },
  });

  if (pagination) {
    const { page, limit, offset } = pagination;
    const { total } = db.prepare(`SELECT COUNT(*) as total FROM activity_logs a ${whereClause}`).get(...whereParams) as { total: number };
    const items = db.prepare(
      `SELECT a.*, p.name AS project_name
       FROM activity_logs a
       LEFT JOIN projects p ON a.project_id = p.id
       ${whereClause}
       ${orderBy}
       LIMIT ? OFFSET ?`
    ).all(...whereParams, limit, offset) as unknown[];
    return res.json(pagedResponse(items, total, page, limit));
  }

  const logs = db.prepare(
    `SELECT a.*, p.name AS project_name
     FROM activity_logs a
     LEFT JOIN projects p ON a.project_id = p.id
     ${whereClause}
     ${orderBy}`
  ).all(...whereParams);
  res.json(logs);
});

export default router;
