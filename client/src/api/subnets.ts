import type { Subnet, CreateSubnetRequest, Device } from 'shared/types';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import type { PagedResult, PagedParams } from './devices';
import { validate, pagedEnvelope } from '../utils/apiValidation';

export async function fetchSubnets(projectId: number): Promise<Subnet[]> {
  const res = await fetch(projectBase(projectId, 'subnets'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch subnets');
  return res.json();
}

export interface SubnetListParams extends PagedParams {
  vlan?: 'has' | 'none';
}

export async function fetchSubnetsPaged(projectId: number, params: SubnetListParams = {}): Promise<PagedResult<Subnet>> {
  const q = buildPaginationParams(params);
  if (params.vlan) q.set('vlan', params.vlan);
  const res = await fetch(`${projectBase(projectId, 'subnets')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch subnets');
  return validate<PagedResult<Subnet>>(await res.json(), pagedEnvelope, 'fetchSubnetsPaged');
}

export async function fetchSubnet(projectId: number, id: number): Promise<Subnet & { devices: Device[] }> {
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

export async function bulkDeleteSubnets(projectId: number, ids: number[]): Promise<{ deleted: number[]; failed: { id: number; error: string }[] }> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete subnets');
  return res.json();
}
