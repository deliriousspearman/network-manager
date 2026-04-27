import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { optionalString, verifyDeviceOwnership, verifySubnetOwnership } from '../validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { publishSafe } from '../events/bus.js';
import type { CreateConnectionRequest } from 'shared/types.js';

const router = Router({ mergeParams: true });

router.get('/', asyncHandler((_req, res) => {
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
}));

router.post('/', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const { source_device_id, target_device_id, label, connection_type, source_handle, target_handle, source_port, target_port, edge_type, edge_color, edge_width } = req.body as CreateConnectionRequest;
  const source_subnet_id = req.body.source_subnet_id ?? null;
  const target_subnet_id = req.body.target_subnet_id ?? null;

  // Verify all referenced entities belong to this project
  if (source_device_id && !verifyDeviceOwnership(source_device_id, projectId)) {
    return res.status(400).json({ error: 'Source device not found in this project' });
  }
  if (target_device_id && !verifyDeviceOwnership(target_device_id, projectId)) {
    return res.status(400).json({ error: 'Target device not found in this project' });
  }
  if (source_subnet_id && !verifySubnetOwnership(source_subnet_id, projectId)) {
    return res.status(400).json({ error: 'Source subnet not found in this project' });
  }
  if (target_subnet_id && !verifySubnetOwnership(target_subnet_id, projectId)) {
    return res.status(400).json({ error: 'Target subnet not found in this project' });
  }

  const result = db.prepare(
    'INSERT INTO connections (source_device_id, target_device_id, source_subnet_id, target_subnet_id, label, connection_type, edge_type, edge_color, edge_width, project_id, source_handle, target_handle, source_port, target_port) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    source_device_id ?? null, target_device_id ?? null,
    source_subnet_id, target_subnet_id,
    optionalString(label, 500), optionalString(connection_type, 50) ?? 'ethernet',
    optionalString(edge_type, 50) ?? 'default', optionalString(edge_color, 50), edge_width != null ? Number(edge_width) : null,
    projectId,
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
  publishSafe(projectId, 'connection', 'created', result.lastInsertRowid as number);
  res.status(201).json(connection);
}));

router.put('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const existing = db.prepare('SELECT * FROM connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as Record<string, unknown> & { updated_at?: string } | undefined;
  if (!existing) return res.status(404).json({ error: 'Connection not found' });

  if (req.body.updated_at && existing.updated_at !== req.body.updated_at) {
    return res.status(409).json({ error: 'This connection was modified by another session. Please refresh and try again.' });
  }

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
    "UPDATE connections SET label = ?, connection_type = ?, edge_type = ?, edge_color = ?, edge_width = ?, label_color = ?, label_bg_color = ?, source_handle = ?, target_handle = ?, source_port = ?, target_port = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(label ?? null, connection_type, edge_type, edge_color, edge_width, label_color, label_bg_color, source_handle, target_handle, source_port, target_port, req.params.id);

  const connection = db.prepare('SELECT * FROM connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId);
  publishSafe(projectId, 'connection', 'updated', Number(req.params.id));
  res.json(connection);
}));

router.delete('/:id', asyncHandler((req, res) => {
  const projectId = res.locals.projectId;
  const connection = db.prepare('SELECT * FROM connections WHERE id = ? AND project_id = ?').get(req.params.id, projectId) as Record<string, unknown> | undefined;
  if (!connection) return res.status(404).json({ error: 'Connection not found' });

  const conn = db.prepare(
    `SELECT sd.name as source_name, td.name as target_name,
            ss.name as source_subnet_name, ts.name as target_subnet_name
     FROM connections c
     LEFT JOIN devices sd ON c.source_device_id = sd.id
     LEFT JOIN devices td ON c.target_device_id = td.id
     LEFT JOIN subnets ss ON c.source_subnet_id = ss.id
     LEFT JOIN subnets ts ON c.target_subnet_id = ts.id
     WHERE c.id = ?`
  ).get(req.params.id) as { source_name?: string; target_name?: string; source_subnet_name?: string; target_subnet_name?: string } | undefined;
  const srcName = conn?.source_name || conn?.source_subnet_name || '?';
  const tgtName = conn?.target_name || conn?.target_subnet_name || '?';

  db.prepare('DELETE FROM connections WHERE id = ? AND project_id = ?').run(req.params.id, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'connection',
    resourceId: Number(req.params.id), resourceName: `${srcName} → ${tgtName}`,
    previousState: { connection },
    canUndo: true,
  });
  publishSafe(projectId, 'connection', 'deleted', Number(req.params.id));
  res.status(204).send();
}));

export default router;
