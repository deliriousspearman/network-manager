import type { DeviceWithIps, CreateDeviceRequest } from 'shared/types';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import { validate, isObj, isNum, isStr, pagedEnvelope } from '../utils/apiValidation';

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
  const body = await res.json();
  return validate<DeviceWithIps>(body, v => {
    if (!isObj(v)) return 'expected object';
    if (!isNum(v.id) || !isStr(v.name)) return 'missing id/name';
    return null;
  }, 'fetchDevice');
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

export interface DeviceListParams extends PagedParams {
  type?: string;
  hosting_type?: string;
  status?: string;
  tags?: string[];
}

export async function fetchDevicesPaged(projectId: number, params: DeviceListParams = {}): Promise<PagedResult<DeviceWithIps>> {
  const q = buildPaginationParams(params);
  if (params.type) q.set('type', params.type);
  if (params.hosting_type) q.set('hosting_type', params.hosting_type);
  if (params.status) q.set('status', params.status);
  if (params.tags && params.tags.length > 0) q.set('tags', params.tags.join(','));
  const res = await fetch(`${projectBase(projectId, 'devices')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch devices');
  const body = await res.json();
  return validate<PagedResult<DeviceWithIps>>(body, v => {
    const env = pagedEnvelope(v);
    if (env) return env;
    const items = (v as Record<string, unknown>).items as unknown[];
    const first = items[0];
    if (first && (!isObj(first) || !isNum(first.id) || !isStr(first.name))) {
      return 'item missing id/name';
    }
    return null;
  }, 'fetchDevicesPaged');
}

export async function fetchDeviceTags(projectId: number): Promise<string[]> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/tags`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch device tags');
  return res.json();
}

export async function fetchHypervisors(projectId: number): Promise<{ id: number; name: string }[]> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/hypervisors`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch hypervisors');
  return res.json();
}

export interface BulkUpdateDevicesRequest {
  ids: number[];
  updates?: {
    status?: string | null;
    subnet_id?: number | null;
    hypervisor_id?: number | null;
    hosting_type?: string | null;
  };
  addTags?: string[];
  removeTags?: string[];
}

export async function bulkUpdateDevices(
  projectId: number,
  body: BulkUpdateDevicesRequest
): Promise<{ updated: number; skipped: number[] }> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/bulk`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update devices');
  return res.json();
}

export interface BulkDeleteResult {
  deleted: number[];
  failed: { id: number; error: string }[];
}

export async function bulkDeleteDevices(projectId: number, ids: number[]): Promise<BulkDeleteResult> {
  const res = await fetch(`${projectBase(projectId, 'devices')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete devices');
  return res.json();
}
