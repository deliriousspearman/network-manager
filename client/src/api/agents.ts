import type { AgentWithDevice, CreateAgentRequest, UpdateAgentRequest } from 'shared/types';
import type { PagedResult, PagedParams } from './devices';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchAgentsPaged(projectId: number, params: PagedParams = {}): Promise<PagedResult<AgentWithDevice>> {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 50) });
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  const res = await fetch(`${projectBase(projectId, 'agents')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch agents');
  return res.json();
}

export async function fetchAgent(projectId: number, id: number): Promise<AgentWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'agents')}/${id}`);
  if (!res.ok) await throwApiError(res, 'Agent not found');
  return res.json();
}

export async function createAgent(projectId: number, data: CreateAgentRequest): Promise<AgentWithDevice> {
  const res = await fetch(projectBase(projectId, 'agents'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create agent');
  return res.json();
}

export async function updateAgent(projectId: number, id: number, data: UpdateAgentRequest): Promise<AgentWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'agents')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update agent');
  return res.json();
}

export async function deleteAgent(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'agents')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete agent');
}
