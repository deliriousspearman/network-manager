import type { AgentWithDevice, CreateAgentRequest, UpdateAgentRequest } from 'shared/types';
import type { PagedResult, PagedParams } from './devices';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import { validate, pagedEnvelope } from '../utils/apiValidation';

export interface AgentListParams extends PagedParams {
  status?: string;
  agent_type?: string;
}

export async function fetchAgentsPaged(projectId: number, params: AgentListParams = {}): Promise<PagedResult<AgentWithDevice>> {
  const q = buildPaginationParams(params);
  if (params.status) q.set('status', params.status);
  if (params.agent_type) q.set('agent_type', params.agent_type);
  const res = await fetch(`${projectBase(projectId, 'agents')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch agents');
  return validate<PagedResult<AgentWithDevice>>(await res.json(), pagedEnvelope, 'fetchAgentsPaged');
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

export async function bulkDeleteAgents(projectId: number, ids: number[]): Promise<{ deleted: number[]; failed: { id: number; error: string }[] }> {
  const res = await fetch(`${projectBase(projectId, 'agents')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete agents');
  return res.json();
}
