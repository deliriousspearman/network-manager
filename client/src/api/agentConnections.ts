import type { AgentConnection } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number): string {
  return projectBase(projectId, 'agent-connections');
}

export interface CreateAgentConnectionRequest {
  source_agent_id?: number | null;
  target_agent_id?: number | null;
  source_image_id?: number | null;
  target_image_id?: number | null;
  label?: string | null;
  connection_type?: string;
  edge_color?: string | null;
  edge_width?: number | null;
  label_color?: string | null;
  label_bg_color?: string | null;
  source_handle?: string | null;
  target_handle?: string | null;
  source_port?: string | null;
  target_port?: string | null;
}

export async function fetchAgentConnections(projectId: number): Promise<AgentConnection[]> {
  const res = await fetch(base(projectId));
  if (!res.ok) await throwApiError(res, 'Failed to fetch agent connections');
  return res.json();
}

export async function createAgentConnection(projectId: number, data: CreateAgentConnectionRequest): Promise<AgentConnection> {
  const res = await fetch(base(projectId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create agent connection');
  return res.json();
}

export async function updateAgentConnection(
  projectId: number,
  id: number,
  data: Partial<CreateAgentConnectionRequest>,
): Promise<AgentConnection> {
  const res = await fetch(`${base(projectId)}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update agent connection');
  return res.json();
}

export async function deleteAgentConnection(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete agent connection');
}
