import { projectBase } from './base';

export interface ActivityLog {
  id: number;
  project_id: number | null;
  project_name: string | null;
  action: string;
  resource_type: string;
  resource_id: number | null;
  resource_name: string | null;
  details: string | null;
  created_at: string;
}

export async function fetchActivityLogs(projectId: number): Promise<ActivityLog[]> {
  const res = await fetch(projectBase(projectId, 'logs'));
  if (!res.ok) throw new Error('Failed to fetch activity logs');
  return res.json();
}
