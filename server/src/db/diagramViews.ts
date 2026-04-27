import db from './connection.js';

export function getViewId(projectId: number, requestedViewId?: string | number): number {
  if (requestedViewId) {
    const vid = Number(requestedViewId);
    const view = db.prepare('SELECT id FROM diagram_views WHERE id = ? AND project_id = ?').get(vid, projectId) as { id: number } | undefined;
    if (view) return view.id;
  }
  const defaultView = db.prepare('SELECT id FROM diagram_views WHERE project_id = ? AND is_default = 1').get(projectId) as { id: number } | undefined;
  if (defaultView) return defaultView.id;
  const result = db.prepare('INSERT INTO diagram_views (project_id, name, is_default) VALUES (?, ?, 1)').run(projectId, 'Default');
  return result.lastInsertRowid as number;
}
