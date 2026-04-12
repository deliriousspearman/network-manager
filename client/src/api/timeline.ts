import type { TimelineEntry, CreateTimelineEntryRequest, UpdateTimelineEntryRequest } from 'shared/types';
import type { PagedResult } from './devices';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export interface TimelineFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  from?: string;
  to?: string;
}

export async function fetchTimelineEntries(
  projectId: number,
  params: TimelineFilters = {}
): Promise<PagedResult<TimelineEntry>> {
  const q = new URLSearchParams({
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  });
  if (params.search) q.set('search', params.search);
  if (params.category) q.set('category', params.category);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const res = await fetch(`${projectBase(projectId, 'timeline')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch timeline');
  return res.json();
}

export async function createTimelineEntry(
  projectId: number,
  data: CreateTimelineEntryRequest
): Promise<TimelineEntry> {
  const res = await fetch(projectBase(projectId, 'timeline'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create timeline entry');
  return res.json();
}

export async function updateTimelineEntry(
  projectId: number,
  id: number,
  data: UpdateTimelineEntryRequest & { updated_at?: string }
): Promise<TimelineEntry> {
  const res = await fetch(`${projectBase(projectId, 'timeline')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update timeline entry');
  return res.json();
}

export async function deleteTimelineEntry(
  projectId: number,
  id: number
): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'timeline')}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete timeline entry');
}
