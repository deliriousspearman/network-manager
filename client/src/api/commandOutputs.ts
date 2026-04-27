import type { CommandOutput, CommandOutputWithParsed, SubmitCommandOutputRequest, UpdateCommandOutputRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchOutputsForDevice(
  projectId: number,
  deviceId: number,
  params?: { from?: string; to?: string },
): Promise<CommandOutput[]> {
  const q = new URLSearchParams();
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  const qs = q.toString();
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/device/${deviceId}${qs ? `?${qs}` : ''}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch outputs');
  return res.json();
}

export async function fetchOutput(
  projectId: number,
  id: number,
  params?: { limit?: number; offset?: number },
): Promise<CommandOutputWithParsed> {
  const q = new URLSearchParams();
  if (params?.limit) q.set('limit', String(params.limit));
  if (params?.offset) q.set('offset', String(params.offset));
  const qs = q.toString();
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}${qs ? `?${qs}` : ''}`);
  if (!res.ok) await throwApiError(res, 'Output not found');
  return res.json();
}

export async function submitOutput(projectId: number, deviceId: number, data: SubmitCommandOutputRequest): Promise<CommandOutput> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/device/${deviceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to submit output');
  return res.json();
}

export async function updateOutput(projectId: number, id: number, data: UpdateCommandOutputRequest): Promise<CommandOutput> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update output');
  return res.json();
}

export async function toggleParseOutput(projectId: number, id: number, parseOutput: boolean): Promise<CommandOutput> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}/parse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parse_output: parseOutput }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to toggle parsing');
  return res.json();
}

export async function deleteOutput(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete output');
}

export async function bulkDeleteOutputs(projectId: number, ids: number[]): Promise<{ deleted: number[]; failed: { id: number; error: string }[] }> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete outputs');
  return res.json();
}
