import { Router } from 'express';
import db from '../db/connection.js';
import { logActivity } from '../db/activityLog.js';
import { ValidationError, requireString, requireOneOf, optionalString, optionalInt, optionalOneOf } from '../validation.js';
import { sanitizeRichText } from '../sanitizeHtml.js';

const AGENT_TYPES = ['wazuh', 'zabbix', 'elk', 'prometheus', 'grafana', 'nagios', 'datadog', 'splunk', 'ossec', 'custom'];
const AGENT_STATUSES = ['active', 'inactive', 'error', 'unknown'];

const router = Router({ mergeParams: true });

const SORT_MAP: Record<string, string> = {
  name: 'a.name', agent_type: 'a.agent_type', device_name: 'd.name',
  status: 'a.status', checkin_schedule: 'a.checkin_schedule', version: 'a.version',
};

// GET / — paginated list
router.get('/', (req, res) => {
  const projectId = res.locals.projectId;

  const selectCols = `a.*, d.name as device_name, d.os as device_os`;
  const fromClause = `FROM agents a LEFT JOIN devices d ON a.device_id = d.id WHERE a.project_id = ?`;

  const search = ((req.query.search as string) || '').trim();
  let searchClause = '';
  const searchParams: any[] = [];
  if (search) {
    const like = `%${search}%`;
    searchClause = ` AND (a.name LIKE ? OR a.agent_type LIKE ? OR d.name LIKE ? OR a.version LIKE ?)`;
    searchParams.push(like, like, like, like);
  }

  const sortCol = SORT_MAP[req.query.sort as string] || 'a.name';
  const sortDir = req.query.order === 'desc' ? 'DESC' : 'ASC';

  if (req.query.page !== undefined) {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;
    const baseParams = [projectId, ...searchParams];
    const { total } = db.prepare(`SELECT COUNT(*) as total ${fromClause}${searchClause}`).get(...baseParams) as { total: number };
    const rows = db.prepare(`SELECT ${selectCols} ${fromClause}${searchClause} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`).all(...baseParams, limit, offset);
    return res.json({ items: rows, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }

  const rows = db.prepare(`SELECT ${selectCols} ${fromClause}${searchClause} ORDER BY ${sortCol} ${sortDir}`).all(projectId, ...searchParams);
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

function validateAgentBody(body: any) {
  const name = requireString(body.name, 'name', 200);
  const agent_type = requireOneOf(body.agent_type, 'agent_type', AGENT_TYPES);
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
    const fields = validateAgentBody(req.body);
    const result = insertAgent.run({ ...fields, project_id: projectId });
    const agentId = Number(result.lastInsertRowid);
    const agent = db.prepare(
      `SELECT a.*, d.name as device_name, d.os as device_os
       FROM agents a LEFT JOIN devices d ON a.device_id = d.id
       WHERE a.id = ?`
    ).get(agentId);
    logActivity({ projectId, action: 'created', resourceType: 'agent', resourceId: agentId, resourceName: fields.name });
    res.status(201).json(agent);
  } catch (err: any) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
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
    const existing = db.prepare('SELECT * FROM agents WHERE id = ? AND project_id = ?').get(id, projectId) as any;
    if (!existing) return res.status(404).json({ error: 'Agent not found' });

    if (req.body.updated_at && req.body.updated_at !== existing.updated_at) {
      return res.status(409).json({ error: 'Record was modified by another user. Please refresh and try again.' });
    }

    const fields = validateAgentBody(req.body);
    updateAgent.run({ ...fields, id, project_id: projectId });
    const agent = db.prepare(
      `SELECT a.*, d.name as device_name, d.os as device_os
       FROM agents a LEFT JOIN devices d ON a.device_id = d.id
       WHERE a.id = ?`
    ).get(id);
    logActivity({ projectId, action: 'updated', resourceType: 'agent', resourceId: id, resourceName: fields.name });
    res.json(agent);
  } catch (err: any) {
    if (err.name === 'ValidationError') return res.status(400).json({ error: err.message });
    throw err;
  }
});

// DELETE /:id
router.delete('/:id', (req, res) => {
  const projectId = res.locals.projectId;
  const id = Number(req.params.id);
  const agent = db.prepare('SELECT name FROM agents WHERE id = ? AND project_id = ?').get(id, projectId) as any;
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  db.prepare('DELETE FROM agents WHERE id = ? AND project_id = ?').run(id, projectId);
  logActivity({ projectId, action: 'deleted', resourceType: 'agent', resourceId: id, resourceName: agent.name });
  res.status(204).end();
});

export default router;
