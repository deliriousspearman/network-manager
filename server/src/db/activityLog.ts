import db from './connection.js';

interface LogParams {
  projectId?: number | null;
  action: string;
  resourceType: string;
  resourceId?: number | null;
  resourceName?: string | null;
  details?: Record<string, unknown> | null;
  previousState?: Record<string, unknown> | null;
  canUndo?: boolean;
}

const insertLog = db.prepare(`
  INSERT INTO activity_logs (project_id, action, resource_type, resource_id, resource_name, details, previous_state, can_undo)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function logActivity(p: LogParams): number | null {
  try {
    const result = insertLog.run(
      p.projectId ?? null,
      p.action,
      p.resourceType,
      p.resourceId ?? null,
      p.resourceName ?? null,
      p.details ? JSON.stringify(p.details) : null,
      p.previousState ? JSON.stringify(p.previousState) : null,
      p.canUndo ? 1 : 0,
    );
    return Number(result.lastInsertRowid);
  } catch {
    return null;
  }
}
