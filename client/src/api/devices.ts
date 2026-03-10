import type { DeviceWithIps, CreateDeviceRequest } from 'shared/types';
import { projectBase } from './base';

export async function fetchDevices(projectId: number): Promise<DeviceWithIps[]> {
  const res = await fetch(projectBase(projectId, 'devices'));
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchDevice(projectId: number, id: number): Promise<DeviceWithIps> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`);
  if (!res.ok) throw new Error('Device not found');
  return res.json();
}

export async function createDevice(projectId: number, data: CreateDeviceRequest): Promise<DeviceWithIps> {
  const res = await fetch(projectBase(projectId, 'devices'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create device');
  return res.json();
}

export async function updateDevice(projectId: number, id: number, data: CreateDeviceRequest): Promise<DeviceWithIps> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update device');
  return res.json();
}

export async function deleteDevice(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete device');
}

export async function fetchHypervisors(projectId: number): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/hypervisors`);
  if (!res.ok) throw new Error('Failed to fetch hypervisors');
  return res.json();
}
