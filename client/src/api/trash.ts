import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';
import { validate, isObj } from '../utils/apiValidation';

export type TrashResourceType =
  | 'device'
  | 'subnet'
  | 'credential'
  | 'agent'
  | 'connection'
  | 'timeline_entry'
  | 'annotation'
  | 'agent_annotation';

export interface TrashItem {
  id: number;
  action: string;
  resource_type: TrashResourceType;
  resource_id: number | null;
  resource_name: string | null;
  created_at: string;
}

export interface TrashResponse {
  items: TrashItem[];
  counts: { resource_type: string; count: number }[];
}

export async function fetchTrash(projectId: number, type?: string, limit?: number): Promise<TrashResponse> {
  const params: string[] = [];
  if (type) params.push(`type=${encodeURIComponent(type)}`);
  if (limit && limit > 0) params.push(`limit=${limit}`);
  const q = params.length ? `?${params.join('&')}` : '';
  const res = await fetch(`${projectBase(projectId, 'trash')}${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch trash');
  return validate<TrashResponse>(await res.json(), v => {
    if (!isObj(v)) return 'expected object';
    if (!Array.isArray(v.items)) return 'missing items array';
    if (!Array.isArray(v.counts)) return 'missing counts array';
    return null;
  }, 'fetchTrash');
}

export async function purgeTrashEntry(projectId: number, logId: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'trash')}/${logId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to purge entry');
}

export async function emptyTrash(projectId: number): Promise<void> {
  const res = await fetch(projectBase(projectId, 'trash'), { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to empty trash');
}
