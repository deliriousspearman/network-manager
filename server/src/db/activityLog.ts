import db from './connection.js';

interface LogParams {
  projectId?: number | null;
  action: string;
  resourceType: string;
  resourceId?: number | null;
  resourceName?: string | null;
  details?: Record<string, unknown> | null;
}

const insertLog = db.prepare(`
  INSERT INTO activity_logs (project_id, action, resource_type, resource_id, resource_name, details)
  VALUES (?, ?, ?, ?, ?, ?)
`);

export function logActivity(p: LogParams): void {
  try {
    insertLog.run(
      p.projectId ?? null,
      p.action,
      p.resourceType,
      p.resourceId ?? null,
      p.resourceName ?? null,
      p.details ? JSON.stringify(p.details) : null
    );
  } catch {
    // Never let logging failure affect the main operation
  }
}
