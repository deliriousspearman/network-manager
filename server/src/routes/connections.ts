import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import type { CreateConnectionRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const connections = db.prepare(
    `SELECT c.*,
      sd.name as source_name, td.name as target_name
     FROM connections c
     JOIN devices sd ON c.source_device_id = sd.id
     JOIN devices td ON c.target_device_id = td.id
     WHERE c.project_id = ?
     ORDER BY c.created_at DESC`
  ).all(projectId);
  res.json(connections);
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { source_device_id, target_device_id, label, connection_type, source_handle, target_handle } = req.body as CreateConnectionRequest;
  const result = db.prepare(
    'INSERT INTO connections (source_device_id, target_device_id, label, connection_type, project_id, source_handle, target_handle) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(source_device_id, target_device_id, label ?? null, connection_type ?? 'ethernet', projectId, source_handle ?? null, target_handle ?? null);

  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);
  const src = db.prepare('SELECT name FROM devices WHERE id = ?').get(source_device_id) as { name: string } | undefined;
  const tgt = db.prepare('SELECT name FROM devices WHERE id = ?').get(target_device_id) as { name: string } | undefined;
  logActivity({ projectId, action: 'created', resourceType: 'connection', resourceId: result.lastInsertRowid as number, resourceName: `${src?.name ?? source_device_id} → ${tgt?.name ?? target_device_id}` });
  res.status(201).json(connection);
});

router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT * FROM connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as any;
  if (!existing) return res.status(404).json({ error: 'Connection not found' });

  const label = req.body.label !== undefined ? req.body.label : existing.label;
  const connection_type = req.body.connection_type !== undefined ? req.body.connection_type : existing.connection_type;
  const edge_type = req.body.edge_type !== undefined ? req.body.edge_type : (existing.edge_type ?? 'default');
  const edge_color = req.body.edge_color !== undefined ? req.body.edge_color : (existing.edge_color ?? null);
  const edge_width = req.body.edge_width !== undefined ? req.body.edge_width : (existing.edge_width ?? null);
  const label_color = req.body.label_color !== undefined ? req.body.label_color : (existing.label_color ?? null);
  const label_bg_color = req.body.label_bg_color !== undefined ? req.body.label_bg_color : (existing.label_bg_color ?? null);
  const source_handle = req.body.source_handle !== undefined ? req.body.source_handle : (existing.source_handle ?? null);
  const target_handle = req.body.target_handle !== undefined ? req.body.target_handle : (existing.target_handle ?? null);

  db.prepare(
    'UPDATE connections SET label = ?, connection_type = ?, edge_type = ?, edge_color = ?, edge_width = ?, label_color = ?, label_bg_color = ?, source_handle = ?, target_handle = ? WHERE id = ?'
  ).run(label ?? null, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, req.params.id);

  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  res.json(connection);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const conn = db.prepare(
    `SELECT c.id, sd.name as source_name, td.name as target_name
     FROM connections c
     JOIN devices sd ON c.source_device_id = sd.id
     JOIN devices td ON c.target_device_id = td.id
     WHERE c.id = ? AND c.project_id = ?`
  ).get(req.params.id, projectId) as { id: number; source_name: string; target_name: string } | undefined;
  if (!conn) return res.status(404).json({ error: 'Connection not found' });
  db.prepare('DELETE FROM connections WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'connection', resourceId: Number(req.params.id), resourceName: `${conn.source_name} → ${conn.target_name}` });
  res.status(204).send();
});

export default router;
