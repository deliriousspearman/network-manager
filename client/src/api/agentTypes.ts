import type { AgentType } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number) {
  return projectBase(projectId, 'agent-types');
}

export interface CreateAgentTypeRequest {
  label: string;
  key?: string;
  icon_source: 'builtin' | 'upload';
  icon_builtin_key?: string;
  filename?: string;
  mime_type?: string;
  data?: string;
  sort_order?: number;
}

export interface UpdateAgentTypeRequest {
  label?: string;
  sort_order?: number;
  icon_source?: 'builtin' | 'upload';
  icon_builtin_key?: string;
  filename?: string;
  mime_type?: string;
  data?: string;
}

export class AgentTypeInUseError extends Error {
  constructor(message: string, public readonly inUseCount: number) {
    super(message);
    this.name = 'AgentTypeInUseError';
  }
}

export async function fetchAgentTypes(projectId: number): Promise<AgentType[]> {
  const res = await fetch(base(projectId));
  if (!res.ok) await throwApiError(res, 'Failed to fetch agent types');
  return res.json();
}

export async function createAgentType(projectId: number, body: CreateAgentTypeRequest): Promise<AgentType> {
  const res = await fetch(base(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create agent type');
  return res.json();
}

export async function updateAgentType(projectId: number, id: number, body: UpdateAgentTypeRequest): Promise<AgentType> {
  const res = await fetch(`${base(projectId)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update agent type');
  return res.json();
}

export async function deleteAgentType(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/${id}`, { method: 'DELETE' });
  if (res.ok) return;
  if (res.status === 409) {
    let body: { error?: string; in_use_count?: number } = {};
    try { body = await res.json(); } catch { /* ignore */ }
    throw new AgentTypeInUseError(body.error || 'Agent type is in use', body.in_use_count ?? 0);
  }
  await throwApiError(res, 'Failed to delete agent type');
}

export function agentTypeIconUrl(projectId: number, typeId: number): string {
  return `${base(projectId)}/${typeId}/image`;
}
