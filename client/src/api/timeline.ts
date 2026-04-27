import type { TimelineEntry, CreateTimelineEntryRequest, UpdateTimelineEntryRequest } from 'shared/types';
import type { PagedResult } from './devices';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import { validate, pagedEnvelope } from '../utils/apiValidation';

export interface TimelineFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  from?: string;
  to?: string;
}

export interface TimelineSummaryItem {
  id: number;
  event_date: string;
  category: TimelineEntry['category'];
  title: string;
}

export async function fetchTimelineSummary(
  projectId: number,
  params: Omit<TimelineFilters, 'page' | 'limit'> = {}
): Promise<TimelineSummaryItem[]> {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.category) q.set('category', params.category);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  const res = await fetch(`${projectBase(projectId, 'timeline')}/summary${qs ? `?${qs}` : ''}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch timeline summary');
  return res.json();
}

export async function fetchTimelineEntries(
  projectId: number,
  params: TimelineFilters = {}
): Promise<PagedResult<TimelineEntry>> {
  const q = buildPaginationParams(params);
  if (params.category) q.set('category', params.category);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const res = await fetch(`${projectBase(projectId, 'timeline')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch timeline');
  return validate<PagedResult<TimelineEntry>>(await res.json(), pagedEnvelope, 'fetchTimelineEntries');
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
): Promise<{ log_id: number | null }> {
  const res = await fetch(`${projectBase(projectId, 'timeline')}/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete timeline entry');
  return res.json();
}

export async function bulkDeleteTimelineEntries(projectId: number, ids: number[]): Promise<{ deleted: number[]; failed: { id: number; error: string }[] }> {
  const res = await fetch(`${projectBase(projectId, 'timeline')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete timeline entries');
  return res.json();
}
