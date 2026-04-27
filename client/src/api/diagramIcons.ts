import type { DiagramImage } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

function base(projectId: number) {
  return projectBase(projectId, 'diagram-icons');
}

export type IconUploadPayload =
  | { icon_source?: 'upload'; filename: string; mime_type: string; data: string; color?: string | null }
  | { icon_source: 'library'; library_id: string; library_icon_key: string; color?: string | null };

// ── Type default icons ───────────────────────────────────────

export interface TypeDefaultRow {
  id: number;
  device_type: string;
  filename: string | null;
  icon_source: 'upload' | 'library';
  library_id: string | null;
  library_icon_key: string | null;
  color: string | null;
}

export async function fetchTypeDefaults(projectId: number): Promise<TypeDefaultRow[]> {
  const res = await fetch(`${base(projectId)}/type-defaults`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch type default icons');
  return res.json();
}

export function typeDefaultIconUrl(projectId: number, deviceType: string): string {
  return `${base(projectId)}/type-defaults/${deviceType}/image`;
}

export async function uploadTypeDefault(projectId: number, deviceType: string, payload: IconUploadPayload): Promise<void> {
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

// ── Per-device icon overrides ────────────────────────────────

export function deviceIconOverrideUrl(projectId: number, deviceId: number): string {
  return `${base(projectId)}/device/${deviceId}/image`;
}

export async function uploadDeviceIconOverride(projectId: number, deviceId: number, payload: IconUploadPayload): Promise<void> {
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
