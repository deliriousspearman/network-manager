import type { DeviceWithIps, CreateDeviceRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PagedParams {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}

export async function fetchDevices(projectId: number): Promise<DeviceWithIps[]> {
  const res = await fetch(projectBase(projectId, 'devices'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch devices');
  return res.json();
}

export async function fetchDevice(projectId: number, id: number): Promise<DeviceWithIps> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`);
  if (!res.ok) await throwApiError(res, 'Device not found');
  return res.json();
}

export async function createDevice(projectId: number, data: CreateDeviceRequest): Promise<DeviceWithIps> {
  const res = await fetch(projectBase(projectId, 'devices'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create device');
  return res.json();
}

export async function updateDevice(projectId: number, id: number, data: Partial<CreateDeviceRequest>): Promise<DeviceWithIps> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update device');
  return res.json();
}

export async function deleteDevice(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete device');
}

export async function fetchDevicesPaged(projectId: number, params: PagedParams = {}): Promise<PagedResult<DeviceWithIps>> {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 50) });
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  const res = await fetch(`${projectBase(projectId, 'devices')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch devices');
  return res.json();
}

export async function fetchHypervisors(projectId: number): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/hypervisors`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch hypervisors');
  return res.json();
}
