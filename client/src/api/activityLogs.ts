import type { ActivityLog } from 'shared/types';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import type { PagedResult, PagedParams } from './devices';

export type { ActivityLog };

export interface LogFilters extends PagedParams {
  resource_type?: string;
  action?: string;
  resource_id?: number;
  since?: string;
  until?: string;
}

export async function fetchActivityLogs(projectId: number): Promise<ActivityLog[]> {
  const res = await fetch(projectBase(projectId, 'logs'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch activity logs');
  return res.json();
}

export async function fetchActivityLogsPaged(projectId: number, params: LogFilters = {}): Promise<PagedResult<ActivityLog>> {
  const q = buildPaginationParams(params);
  if (params.resource_type) q.set('resource_type', params.resource_type);
  if (params.action) q.set('action', params.action);
  if (params.resource_id != null) q.set('resource_id', String(params.resource_id));
  if (params.since) q.set('since', params.since);
  if (params.until) q.set('until', params.until);
  const res = await fetch(`${projectBase(projectId, 'logs')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch activity logs');
  return res.json();
}

export async function fetchAllActivityLogs(): Promise<ActivityLog[]> {
  const res = await fetch('/api/admin/logs');
  if (!res.ok) await throwApiError(res, 'Failed to fetch admin logs');
  return res.json();
}

export async function fetchAllActivityLogsPaged(params: LogFilters = {}): Promise<PagedResult<ActivityLog>> {
  const q = buildPaginationParams(params);
  if (params.resource_type) q.set('resource_type', params.resource_type);
  if (params.action) q.set('action', params.action);
  const res = await fetch(`/api/admin/logs?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch admin logs');
  return res.json();
}

export interface UndoResponse {
  success: true;
  resource_id: number | null;
  log_id: number;
}

export async function undoActivity(projectId: number, logId: number): Promise<UndoResponse> {
  const res = await fetch(`${projectBase(projectId, 'undo')}/${logId}`, { method: 'POST' });
  if (!res.ok) await throwApiError(res, 'Failed to undo action');
  return res.json();
}
