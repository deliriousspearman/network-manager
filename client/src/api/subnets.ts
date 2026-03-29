import type { Subnet, CreateSubnetRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';
import type { PagedResult, PagedParams } from './devices';

export async function fetchSubnets(projectId: number): Promise<Subnet[]> {
  const res = await fetch(projectBase(projectId, 'subnets'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch subnets');
  return res.json();
}

export async function fetchSubnetsPaged(projectId: number, params: PagedParams = {}): Promise<PagedResult<Subnet>> {
  const q = new URLSearchParams({ page: String(params.page ?? 1), limit: String(params.limit ?? 50) });
  if (params.search) q.set('search', params.search);
  if (params.sort) q.set('sort', params.sort);
  if (params.order) q.set('order', params.order);
  const res = await fetch(`${projectBase(projectId, 'subnets')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch subnets');
  return res.json();
}

export async function fetchSubnet(projectId: number, id: number): Promise<Subnet & { devices: any[] }> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`);
  if (!res.ok) await throwApiError(res, 'Subnet not found');
  return res.json();
}

export async function createSubnet(projectId: number, data: CreateSubnetRequest): Promise<Subnet> {
  const res = await fetch(projectBase(projectId, 'subnets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create subnet');
  return res.json();
}

export async function updateSubnet(projectId: number, id: number, data: CreateSubnetRequest): Promise<Subnet> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update subnet');
  return res.json();
}

export async function deleteSubnet(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete subnet');
}
