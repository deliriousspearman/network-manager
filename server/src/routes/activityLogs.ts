import { Router } from 'express';
import db from '../db/connection.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const logs = db.prepare(
    `SELECT a.*, p.name AS project_name
     FROM activity_logs a
     LEFT JOIN projects p ON a.project_id = p.id
     WHERE a.project_id = ?
     ORDER BY a.created_at DESC`
  ).all(projectId);
  res.json(logs);
});

export default router;
