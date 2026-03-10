import type { Subnet, CreateSubnetRequest } from 'shared/types';
import { projectBase } from './base';

export async function fetchSubnets(projectId: number): Promise<Subnet[]> {
  const res = await fetch(projectBase(projectId, 'subnets'));
  if (!res.ok) throw new Error('Failed to fetch subnets');
  return res.json();
}

export async function fetchSubnet(projectId: number, id: number): Promise<Subnet & { devices: any[] }> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`);
  if (!res.ok) throw new Error('Subnet not found');
  return res.json();
}

export async function createSubnet(projectId: number, data: CreateSubnetRequest): Promise<Subnet> {
  const res = await fetch(projectBase(projectId, 'subnets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create subnet');
  return res.json();
}

export async function updateSubnet(projectId: number, id: number, data: CreateSubnetRequest): Promise<Subnet> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update subnet');
  return res.json();
}

export async function deleteSubnet(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'subnets')}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete subnet');
}
