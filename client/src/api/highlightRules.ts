import type { HighlightRule } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchHighlightRules(projectId: number): Promise<HighlightRule[]> {
  const res = await fetch(projectBase(projectId, 'highlight-rules'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch highlight rules');
  return res.json();
}

export async function createHighlightRule(projectId: number, data: { keyword: string; category: string; color: string; text_color?: string | null }): Promise<HighlightRule> {
  const res = await fetch(projectBase(projectId, 'highlight-rules'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create highlight rule');
  return res.json();
}

export async function updateHighlightRule(projectId: number, id: number, data: { keyword: string; category: string; color: string; text_color?: string | null }): Promise<HighlightRule> {
  const res = await fetch(`${projectBase(projectId, 'highlight-rules')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update highlight rule');
  return res.json();
}

export async function deleteHighlightRule(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'highlight-rules')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete highlight rule');
}
