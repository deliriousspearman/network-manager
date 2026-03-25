import type { DeviceAttachment } from 'shared/types';

function base(projectId: number, deviceId: number) {
  return `/api/projects/${projectId}/devices/${deviceId}/attachments`;
}

export function attachmentUrl(projectId: number, deviceId: number, attachmentId: number): string {
  return `${base(projectId, deviceId)}/${attachmentId}`;
}

export async function fetchDeviceAttachments(projectId: number, deviceId: number): Promise<DeviceAttachment[]> {
  const res = await fetch(base(projectId, deviceId));
  if (!res.ok) throw new Error('Failed to fetch attachments');
  return res.json();
}

export async function uploadDeviceAttachment(
  projectId: number,
  deviceId: number,
  payload: { filename: string; mime_type: string; size: number; data: string },
): Promise<DeviceAttachment> {
  const res = await fetch(base(projectId, deviceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to upload attachment');
  return res.json();
}

export async function deleteDeviceAttachment(projectId: number, deviceId: number, attachmentId: number): Promise<void> {
  const res = await fetch(`${base(projectId, deviceId)}/${attachmentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete attachment');
}
