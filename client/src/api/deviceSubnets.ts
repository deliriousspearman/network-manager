import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function addSubnetMembership(projectId: number, deviceId: number, subnetId: number): Promise<void> {
  const res = await fetch(projectBase(projectId, 'device-subnets'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ device_id: deviceId, subnet_id: subnetId }),
  });
  if (!res.ok && res.status !== 409) await throwApiError(res, 'Failed to add subnet membership');
}

export async function removeSubnetMembership(projectId: number, deviceId: number, subnetId: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'device-subnets')}/${deviceId}/${subnetId}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to remove subnet membership');
}
