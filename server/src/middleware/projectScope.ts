import { RequestHandler } from 'express';
import db from '../db/connection.js';

export const projectScope: RequestHandler = (req, res, next) => {
  const { projectId } = req.params;
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  res.locals.projectId = Number(projectId);
  next();
};
