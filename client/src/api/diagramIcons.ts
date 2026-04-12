import type { DiagramImage } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number) {
  return projectBase(projectId, 'diagram-icons');
}

// ── Type default icons ───────────────────────────────────────

export async function fetchTypeDefaults(projectId: number): Promise<{ id: number; device_type: string; filename: string }[]> {
  const res = await fetch(`${base(projectId)}/type-defaults`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch type default icons');
  return res.json();
}

export function typeDefaultIconUrl(projectId: number, deviceType: string): string {
  return `${base(projectId)}/type-defaults/${deviceType}/image`;
}

export async function uploadTypeDefault(projectId: number, deviceType: string, payload: { filename: string; mime_type: string; data: string }): Promise<void> {
  const res = await fetch(`${base(projectId)}/type-defaults/${deviceType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to upload type default icon');
}

export async function deleteTypeDefault(projectId: number, deviceType: string): Promise<void> {
  const res = await fetch(`${base(projectId)}/type-defaults/${deviceType}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete type default icon');
}

// ── Agent type default icons ─────────────────────────────────

export async function fetchAgentTypeDefaults(projectId: number): Promise<{ id: number; agent_type: string; filename: string }[]> {
  const res = await fetch(`${base(projectId)}/agent-type-defaults`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch agent type default icons');
  return res.json();
}

export function agentTypeDefaultIconUrl(projectId: number, agentType: string): string {
  return `${base(projectId)}/agent-type-defaults/${agentType}/image`;
}

export async function uploadAgentTypeDefault(projectId: number, agentType: string, payload: { filename: string; mime_type: string; data: string }): Promise<void> {
  const res = await fetch(`${base(projectId)}/agent-type-defaults/${agentType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to upload agent type default icon');
}

export async function deleteAgentTypeDefault(projectId: number, agentType: string): Promise<void> {
  const res = await fetch(`${base(projectId)}/agent-type-defaults/${agentType}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete agent type default icon');
}

// ── Per-device icon overrides ────────────────────────────────

export function deviceIconOverrideUrl(projectId: number, deviceId: number): string {
  return `${base(projectId)}/device/${deviceId}/image`;
}

export async function uploadDeviceIconOverride(projectId: number, deviceId: number, payload: { filename: string; mime_type: string; data: string }): Promise<void> {
  const res = await fetch(`${base(projectId)}/device/${deviceId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to upload device icon override');
}

export async function deleteDeviceIconOverride(projectId: number, deviceId: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/device/${deviceId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete device icon override');
}

// ── Standalone diagram images ────────────────────────────────

export function diagramImageUrl(projectId: number, imageId: number): string {
  return `${base(projectId)}/images/${imageId}/image`;
}

export async function createDiagramImage(projectId: number, data: { x: number; y: number; width?: number; height?: number; filename: string; mime_type: string; data: string; label?: string; view_id?: number }): Promise<DiagramImage> {
  const res = await fetch(`${base(projectId)}/images`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create diagram image');
  return res.json();
}

export async function updateDiagramImage(projectId: number, id: number, data: Partial<{ x: number; y: number; width: number; height: number; label: string }>): Promise<DiagramImage> {
  const res = await fetch(`${base(projectId)}/images/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update diagram image');
  return res.json();
}

export async function deleteDiagramImage(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/images/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete diagram image');
}
