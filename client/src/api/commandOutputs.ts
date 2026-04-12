import type { CommandOutput, CommandOutputWithParsed, SubmitCommandOutputRequest, UpdateCommandOutputRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchOutputsForDevice(projectId: number, deviceId: number): Promise<CommandOutput[]> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/device/${deviceId}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch outputs');
  return res.json();
}

export async function fetchOutput(projectId: number, id: number): Promise<CommandOutputWithParsed> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}`);
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
