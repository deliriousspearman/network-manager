import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { optionalString } from '../validation.js';
import type { CreateConnectionRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', (_req, res) => {
  const projectId = res.locals.projectId;
  const connections = db.prepare(
    `SELECT c.*,
      sd.name as source_name, td.name as target_name,
      ss.name as source_subnet_name, ts.name as target_subnet_name
     FROM connections c
     LEFT JOIN devices sd ON c.source_device_id = sd.id
     LEFT JOIN devices td ON c.target_device_id = td.id
     LEFT JOIN subnets ss ON c.source_subnet_id = ss.id
     LEFT JOIN subnets ts ON c.target_subnet_id = ts.id
     WHERE c.project_id = ?
     ORDER BY c.created_at DESC`
  ).all(projectId);
  res.json(connections);
});

router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  const { source_device_id, target_device_id, label, connection_type, source_handle, target_handle, source_port, target_port } = req.body as CreateConnectionRequest;
  const source_subnet_id = req.body.source_subnet_id ?? null;
  const target_subnet_id = req.body.target_subnet_id ?? null;
  const result = db.prepare(
    'INSERT INTO connections (source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, project_id, source_handle, target_handle, source_port, target_port) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    source_device_id ?? null, target_device_id ?? null,
    source_subnet_id, target_subnet_id,
    optionalString(label, 500), optionalString(connection_type, 50) ?? 'ethernet', projectId,
    optionalString(source_handle, 100), optionalString(target_handle, 100),
    optionalString(source_port, 100), optionalString(target_port, 100),
  );

  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(result.lastInsertRowid);

  // Build resource name from whatever endpoints exist
  const srcName = source_device_id
    ? (db.prepare('SELECT name FROM devices WHERE id = ?').get(source_device_id) as { name: string } | undefined)?.name
    : source_subnet_id
    ? (db.prepare('SELECT name FROM subnets WHERE id = ?').get(source_subnet_id) as { name: string } | undefined)?.name
    : '?';
  const tgtName = target_device_id
    ? (db.prepare('SELECT name FROM devices WHERE id = ?').get(target_device_id) as { name: string } | undefined)?.name
    : target_subnet_id
    ? (db.prepare('SELECT name FROM subnets WHERE id = ?').get(target_subnet_id) as { name: string } | undefined)?.name
    : '?';
  logActivity({ projectId, action: 'created', resourceType: 'connection', resourceId: result.lastInsertRowid as number, resourceName: `${srcName} → ${tgtName}` });
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
  const source_port = req.body.source_port !== undefined ? req.body.source_port : (existing.source_port ?? null);
  const target_port = req.body.target_port !== undefined ? req.body.target_port : (existing.target_port ?? null);

  db.prepare(
    'UPDATE connections SET label = ?, connection_type = ?, edge_type = ?, edge_color = ?, edge_width = ?, label_color = ?, label_bg_color = ?, source_handle = ?, target_handle = ?, source_port = ?, target_port = ? WHERE id = ?'
  ).run(label ?? null, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, source_port, target_port, req.params.id);

  const connection = db.prepare('SELECT * FROM connections WHERE id = ?').get(req.params.id);
  res.json(connection);
});

router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT id FROM connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  if (!existing) return res.status(404).json({ error: 'Connection not found' });

  // Build name for log
  const conn = db.prepare(
    `SELECT c.*, sd.name as source_name, td.name as target_name,
            ss.name as source_subnet_name, ts.name as target_subnet_name
     FROM connections c
     LEFT JOIN devices sd ON c.source_device_id = sd.id
     LEFT JOIN devices td ON c.target_device_id = td.id
     LEFT JOIN subnets ss ON c.source_subnet_id = ss.id
     LEFT JOIN subnets ts ON c.target_subnet_id = ts.id
     WHERE c.id = ?`
  ).get(req.params.id) as any;
  const srcName = conn?.source_name || conn?.source_subnet_name || '?';
  const tgtName = conn?.target_name || conn?.target_subnet_name || '?';

  db.prepare('DELETE FROM connections WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'connection', resourceId: Number(req.params.id), resourceName: `${srcName} → ${tgtName}` });
  res.status(204).send();
});

export default router;
