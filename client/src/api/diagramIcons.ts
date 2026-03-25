import type { DiagramImage } from 'shared/types';
import { projectBase } from './base';

function base(projectId: number) {
  return projectBase(projectId, 'diagram-icons');
}

async function throwWithDetail(res: Response, fallback: string): Promise<never> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body.error || JSON.stringify(body);
  } catch { /* no json body */ }
  throw new Error(detail || `${fallback} (${res.status})`);
}

// ── Type default icons ───────────────────────────────────────

export async function fetchTypeDefaults(projectId: number): Promise<{ id: number; device_type: string; filename: string }[]> {
  const res = await fetch(`${base(projectId)}/type-defaults`);
  if (!res.ok) await throwWithDetail(res, 'Failed to fetch type default icons');
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
  if (!res.ok) await throwWithDetail(res, 'Failed to upload type default icon');
}

export async function deleteTypeDefault(projectId: number, deviceType: string): Promise<void> {
  const res = await fetch(`${base(projectId)}/type-defaults/${deviceType}`, { method: 'DELETE' });
  if (!res.ok) await throwWithDetail(res, 'Failed to delete type default icon');
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
  if (!res.ok) await throwWithDetail(res, 'Failed to upload device icon override');
}

export async function deleteDeviceIconOverride(projectId: number, deviceId: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/device/${deviceId}`, { method: 'DELETE' });
  if (!res.ok) await throwWithDetail(res, 'Failed to delete device icon override');
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
  if (!res.ok) await throwWithDetail(res, 'Failed to create diagram image');
  return res.json();
}

export async function updateDiagramImage(projectId: number, id: number, data: Partial<{ x: number; y: number; width: number; height: number; label: string }>): Promise<DiagramImage> {
  const res = await fetch(`${base(projectId)}/images/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwWithDetail(res, 'Failed to update diagram image');
  return res.json();
}

export async function deleteDiagramImage(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${base(projectId)}/images/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwWithDetail(res, 'Failed to delete diagram image');
}
