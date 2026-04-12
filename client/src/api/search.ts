import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export interface SearchResult {
  type: 'device' | 'subnet' | 'credential' | 'agent';
  id: number;
  name: string;
  detail: string;
}

export async function globalSearch(projectId: number, query: string): Promise<SearchResult[]> {
  const res = await fetch(`${projectBase(projectId, 'search')}?q=${encodeURIComponent(query)}`);
  if (!res.ok) await throwApiError(res, 'Search failed');
  return res.json();
}
