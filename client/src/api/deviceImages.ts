import type { DeviceImage } from 'shared/types';
import { throwApiError } from '../utils/apiError';

function base(projectId: number, deviceId: number) {
  return `/api/projects/${projectId}/devices/${deviceId}/images`;
}

export function imageUrl(projectId: number, deviceId: number, imageId: number): string {
  return `${base(projectId, deviceId)}/${imageId}`;
}

export async function fetchDeviceImages(projectId: number, deviceId: number): Promise<DeviceImage[]> {
  const res = await fetch(base(projectId, deviceId));
  if (!res.ok) await throwApiError(res, 'Failed to fetch images');
  return res.json();
}

export async function uploadDeviceImage(
  projectId: number,
  deviceId: number,
  payload: { filename: string; mime_type: string; data: string },
): Promise<DeviceImage> {
  const res = await fetch(base(projectId, deviceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) await throwApiError(res, 'Failed to upload image');
  return res.json();
}

export async function deleteDeviceImage(projectId: number, deviceId: number, imageId: number): Promise<void> {
  const res = await fetch(`${base(projectId, deviceId)}/${imageId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete image');
}
