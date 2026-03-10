import type { CommandOutput, CommandOutputWithParsed, SubmitCommandOutputRequest } from 'shared/types';
import { projectBase } from './base';

export async function fetchOutputsForDevice(projectId: number, deviceId: number): Promise<CommandOutput[]> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/device/${deviceId}`);
  if (!res.ok) throw new Error('Failed to fetch outputs');
  return res.json();
}

export async function fetchOutput(projectId: number, id: number): Promise<CommandOutputWithParsed> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}`);
  if (!res.ok) throw new Error('Output not found');
  return res.json();
}

export async function submitOutput(projectId: number, deviceId: number, data: SubmitCommandOutputRequest): Promise<CommandOutput> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/device/${deviceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to submit output');
  return res.json();
}

export async function deleteOutput(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'command-outputs')}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete output');
}
