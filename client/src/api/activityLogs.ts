import type { ActivityLog } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';
import type { PagedResult, PagedParams } from './devices';

export type { ActivityLog };

export interface LogFilters extends PagedParams {
  resource_type?: string;
  action?: string;
}

export async function fetchActivityLogs(projectId: number): Promise<ActivityLog[]> {
  const res = await fetch(projectBase(projectId, 'logs'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch activity logs');
  return res.json();
}

export async function fetchActivityLogsPaged(projectId: number, params: LogFilters = {}): Promise<PagedResult<ActivityLog>> {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 50) });
  if (params.search) q.set('search', params.search);
  if (params.resource_type) q.set('resource_type', params.resource_type);
  if (params.action) q.set('action', params.action);
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
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 50) });
  if (params.search) q.set('search', params.search);
  if (params.resource_type) q.set('resource_type', params.resource_type);
  if (params.action) q.set('action', params.action);
  const res = await fetch(`/api/admin/logs?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch admin logs');
  return res.json();
}
