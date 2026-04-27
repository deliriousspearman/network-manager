import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, optionalString, optionalInt, optionalOneOf } from '../validation.js';
import { sanitizeRichText } from '../sanitizeHtml.js';
import { pagedResponse } from '../utils/pagination.js';
import { buildListQuery } from '../utils/listQuery.js';
import { publishSafe } from '../events/bus.js';

const AGENT_STATUSES = ['active', 'inactive', 'error', 'unknown'];

const router = Router({ mergeParams: true });

// GET / — paginated list
router.get('/', (req, res) => {
  const projectId = res.locals.projectId;

  const selectCols = `a.*, d.name as device_name, d.os as device_os`;
  const joinClause = `FROM agents a LEFT JOIN devices d ON a.device_id = d.id`;

  const { whereClause, whereParams, orderBy, pagination } = buildListQuery(req, {
    projectId,
    projectColumn: 'a.project_id',
    search: { columns: ['a.name', 'a.agent_type', 'd.name', 'a.version'] },
    filters: {
      status: {
        column: 'a.status',
        type: 'string',
        allowed: AGENT_STATUSES,
        sentinels: { none: "(a.status IS NULL OR a.status = '')" },
      },
      agent_type: { column: 'a.agent_type', type: 'string' },
    },
    sort: {
      map: {
        name: 'a.name', agent_type: 'a.agent_type', device_name: 'd.name',
        status: 'a.status', checkin_schedule: 'a.checkin_schedule', version: 'a.version',
      },
      default: 'a.name',
    },
  });

  if (pagination) {
    const { page, limit, offset } = pagination;
    const { total } = db.prepare(`SELECT COUNT(*) as total ${joinClause} ${whereClause}`).get(...whereParams) as { total: number };
    const rows = db.prepare(`SELECT ${selectCols} ${joinClause} ${whereClause} ${orderBy} LIMIT ? OFFSET ?`).all(...whereParams, limit, offset) as unknown[];
    return res.json(pagedResponse(rows, total, page, limit));
  }

  const rows = db.prepare(`SELECT ${selectCols} ${joinClause} ${whereClause} ${orderBy}`).all(...whereParams);
  res.json(rows);
});

// GET /:id — single agent
router.get('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const agent = db.prepare(
    `SELECT a.*, d.name as device_name, d.os as device_os
     FROM agents a LEFT JOIN devices d ON a.device_id = d.id
     WHERE a.id = ? AND a.project_id = ?`
  ).get(req.params.id, projectId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

type AgentBody = Partial<{ name: string; agent_type: string; device_id: number; checkin_schedule: string; config: string; disk_path: string; status: string; version: string; notes: string }>;

function validateAgentBody(body: AgentBody, projectId: number) {
  const name = requireString(body.name, 'name', 200);
  const agent_type = requireString(body.agent_type, 'agent_type', 100);
  const typeRow = db.prepare('SELECT 1 FROM agent_types WHERE project_id = ? AND key = ?').get(projectId, agent_type);
  if (!typeRow) throw new ValidationError('Invalid agent_type for this project');
  const device_id = optionalInt(body.device_id, 1);
  const checkin_schedule = optionalString(body.checkin_schedule, 1000);
  const config = optionalString(body.config, 10000);
  const disk_path = optionalString(body.disk_path, 500);
  const status = optionalOneOf(body.status, AGENT_STATUSES);
  const version = optionalString(body.version, 100);
  // notes is rich-text HTML produced by the client RichToolbar. Sanitize server-side
  // (defense-in-depth — API callers can bypass the client DOMPurify pass) and reject
  // payloads larger than 200k chars before they touch sanitize-html.
  let notes: string | null = null;
  if (body.notes != null && body.notes !== '') {
    if (typeof body.notes !== 'string') throw new ValidationError('notes must be a string');
    if (body.notes.length > 200_000) throw new ValidationError('notes must be at most 200000 characters');
    notes = sanitizeRichText(body.notes) || null;
  }
  return { name, agent_type, device_id, checkin_schedule, config, disk_path, status, version, notes };
}

const insertAgent = db.prepare(
  `INSERT INTO agents (name, agent_type, device_id, checkin_schedule, config, disk_path, status, version, notes, project_id)
   VALUES (@name, @agent_type, @device_id, @checkin_schedule, @config, @disk_path, @status, @version, @notes, @project_id)`
);

// POST / — create
router.post('/', (req, res) => {
  const projectId = res.locals.projectId;
  try {
    const fields = validateAgentBody(req.body, projectId);
    const result = insertAgent.run({ ...fields, project_id: projectId });
    const agentId = Number(result.lastInsertRowid);
    const agent = db.prepare(
      `SELECT a.*, d.name as device_name, d.os as device_os
       FROM agents a LEFT JOIN devices d ON a.device_id = d.id
       WHERE a.id = ?`
    ).get(agentId);
    logActivity({ projectId, action: 'created', resourceType: 'agent', resourceId: agentId, resourceName: fields.name });
    publishSafe(projectId, 'agent', 'created', agentId);
    res.status(201).json(agent);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    throw err;
  }
});

const updateAgent = db.prepare(
  `UPDATE agents SET name=@name, agent_type=@agent_type, device_id=@device_id, checkin_schedule=@checkin_schedule,
   config=@config, disk_path=@disk_path, status=@status, version=@version, notes=@notes,
   updated_at=datetime('now') WHERE id=@id AND project_id=@project_id`
);

// PUT /:id — update
router.put('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = Number(req.params.id);
  try {
    const existing = db.prepare('SELECT * FROM agents WHERE id = ? AND project_id = ?').get(id, projectId) as { updated_at: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    if (req.body.updated_at && req.body.updated_at !== existing.updated_at) {
      return res.status(409).json({ error: 'Record was modified by another user. Please refresh and try again.' });
    }

    const fields = validateAgentBody(req.body, projectId);
    updateAgent.run({ ...fields, id, project_id: projectId });
    const agent = db.prepare(
      `SELECT a.*, d.name as device_name, d.os as device_os
       FROM agents a LEFT JOIN devices d ON a.device_id = d.id
       WHERE a.id = ?`
    ).get(id);
    logActivity({ projectId, action: 'updated', resourceType: 'agent', resourceId: id, resourceName: fields.name });
    publishSafe(projectId, 'agent', 'updated', id);
    res.json(agent);
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    throw err;
  }
});

// Snapshot + DELETE + activity log in one transaction. Throws 'NOT_FOUND'
// if the agent doesn't exist in this project.
const deleteAgentRow = db.transaction((agentId: number, projectId: number) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND project_id = ?').get(agentId, projectId) as Record<string, unknown> | undefined;
  if (!agent) throw new Error('NOT_FOUND');
  db.prepare('DELETE FROM agents WHERE id = ? AND project_id = ?').run(agentId, projectId);
  logActivity({
    projectId, action: 'deleted', resourceType: 'agent',
    resourceId: agentId, resourceName: agent.name as string,
    previousState: { agent },
    canUndo: true,
  });
  return agent;
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = Number(req.params.id);
  try {
    deleteAgentRow(id, projectId);
  } catch (err) {
    // Idempotent: a missing row means another tab already deleted it.
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      return res.status(204).end();
    }
    throw err;
  }
  publishSafe(projectId, 'agent', 'deleted', id);
  res.status(204).end();
});

const AGENT_BULK_MAX_IDS = 500;

router.post('/bulk-delete', (req, res) => {
  const projectId = res.locals.projectId;
  const body = req.body as { ids?: unknown };
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' });
  }
  if (body.ids.length > AGENT_BULK_MAX_IDS) {
    return res.status(400).json({ error: `Cannot delete more than ${AGENT_BULK_MAX_IDS} agents at once` });
  }
  const ids = body.ids.map(v => Number(v));
  if (ids.some(n => !Number.isFinite(n) || n <= 0 || !Number.isInteger(n))) {
    return res.status(400).json({ error: 'ids must be positive integers' });
  }

  const deleted: number[] = [];
  const failed: { id: number; error: string }[] = [];
  for (const id of ids) {
    try {
      deleteAgentRow(id, projectId);
      publishSafe(projectId, 'agent', 'deleted', id);
      deleted.push(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      failed.push({ id, error: msg === 'NOT_FOUND' ? 'Not found' : msg });
    }
  }
  res.json({ deleted, failed });
});

export default router;
