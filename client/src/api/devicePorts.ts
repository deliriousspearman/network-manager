import type { DevicePort } from 'shared/types';

function base(projectId: number, deviceId: number) {
  return `/api/projects/${projectId}/devices/${deviceId}/ports`;
}

export async function fetchDevicePorts(projectId: number, deviceId: number): Promise<DevicePort[]> {
  const res = await fetch(base(projectId, deviceId));
  if (!res.ok) throw new Error('Failed to fetch ports');
  return res.json();
}

export async function createDevicePort(
  projectId: number,
  deviceId: number,
  payload: { port_number: number; state: string; service?: string },
): Promise<DevicePort> {
  const res = await fetch(base(projectId, deviceId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create port');
  return res.json();
}

export async function updateDevicePort(
  projectId: number,
  deviceId: number,
  portId: number,
  payload: { port_number: number; state: string; service?: string },
): Promise<DevicePort> {
  const res = await fetch(`${base(projectId, deviceId)}/${portId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update port');
  return res.json();
}

export async function deleteDevicePort(projectId: number, deviceId: number, portId: number): Promise<void> {
  const res = await fetch(`${base(projectId, deviceId)}/${portId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete port');
}
