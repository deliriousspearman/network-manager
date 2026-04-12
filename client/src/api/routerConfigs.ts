import type { RouterConfig, RouterConfigWithParsed, SubmitRouterConfigRequest, UpdateRouterConfigRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchConfigsForDevice(projectId: number, deviceId: number): Promise<RouterConfig[]> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/device/${deviceId}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch router configs');
  return res.json();
}

export async function fetchConfig(projectId: number, id: number): Promise<RouterConfigWithParsed> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/${id}`);
  if (!res.ok) await throwApiError(res, 'Router config not found');
  return res.json();
}

export async function submitConfig(projectId: number, deviceId: number, data: SubmitRouterConfigRequest): Promise<RouterConfig> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/device/${deviceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to submit router config');
  return res.json();
}

export async function updateConfig(projectId: number, id: number, data: UpdateRouterConfigRequest): Promise<RouterConfig> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update router config');
  return res.json();
}

export async function toggleParseConfig(projectId: number, id: number, parseOutput: boolean): Promise<RouterConfig> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/${id}/parse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse_output: parseOutput }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to toggle parsing');
  return res.json();
}

export async function deleteConfig(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'router-configs')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete router config');
}
