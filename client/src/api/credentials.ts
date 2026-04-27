import type { CredentialWithDevice, CreateCredentialRequest, CredentialPasswordHistoryEntry, CreateCredentialHistoryEntryRequest, UpdateCredentialHistoryEntryRequest } from 'shared/types';
import { projectBase, buildPaginationParams } from './base';
import { throwApiError } from '../utils/apiError';
import type { PagedResult, PagedParams } from './devices';
import { validate, pagedEnvelope } from '../utils/apiValidation';

export async function fetchCredentials(projectId: number): Promise<CredentialWithDevice[]> {
  const res = await fetch(projectBase(projectId, 'credentials'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch credentials');
  return res.json();
}

export async function fetchCredentialsPaged(projectId: number, params: PagedParams & { used?: string; hidden?: string } = {}): Promise<PagedResult<CredentialWithDevice>> {
  const q = buildPaginationParams(params);
  if (params.used) q.set('used', params.used);
  if (params.hidden) q.set('hidden', params.hidden);
  const res = await fetch(`${projectBase(projectId, 'credentials')}?${q}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch credentials');
  return validate<PagedResult<CredentialWithDevice>>(await res.json(), pagedEnvelope, 'fetchCredentialsPaged');
}

export async function toggleCredentialHidden(projectId: number, id: number, hidden: boolean): Promise<CredentialWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/hidden`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hidden }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update credential');
  return res.json();
}

export async function fetchCredential(projectId: number, id: number): Promise<CredentialWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`);
  if (!res.ok) await throwApiError(res, 'Credential not found');
  return res.json();
}

export async function createCredential(projectId: number, data: CreateCredentialRequest): Promise<CredentialWithDevice> {
  const res = await fetch(projectBase(projectId, 'credentials'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create credential');
  return res.json();
}

export async function updateCredential(projectId: number, id: number, data: CreateCredentialRequest): Promise<CredentialWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update credential');
  return res.json();
}

export async function deleteCredential(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete credential');
}

export async function bulkDeleteCredentials(projectId: number, ids: number[]): Promise<{ deleted: number[]; failed: { id: number; error: string }[] }> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) await throwApiError(res, 'Failed to delete credentials');
  return res.json();
}

export async function fetchCredentialsByDevice(projectId: number, deviceId: number): Promise<CredentialWithDevice[]> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}?device_id=${deviceId}`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch credentials');
  return res.json();
}

export async function fetchCredentialFileText(projectId: number, id: number): Promise<string> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/file`);
  if (!res.ok) await throwApiError(res, 'File not found');
  return res.text();
}

export async function downloadCredentialFile(projectId: number, id: number, fileName: string): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/file`);
  if (!res.ok) await throwApiError(res, 'File not found');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchCredentialHistory(projectId: number, id: number): Promise<CredentialPasswordHistoryEntry[]> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/history`);
  if (!res.ok) await throwApiError(res, 'Failed to fetch password history');
  return res.json();
}

export async function addCredentialHistoryEntry(projectId: number, id: number, body: CreateCredentialHistoryEntryRequest): Promise<CredentialPasswordHistoryEntry> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/history`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, 'Failed to add history entry');
  return res.json();
}

export async function updateCredentialHistoryEntry(projectId: number, id: number, hid: number, body: UpdateCredentialHistoryEntryRequest): Promise<CredentialPasswordHistoryEntry> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/history/${hid}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update history entry');
  return res.json();
}

export async function deleteCredentialHistoryEntry(projectId: number, id: number, hid: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/history/${hid}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete history entry');
}

export async function downloadCredentialHistoryFile(projectId: number, id: number, hid: number, fileName: string): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/history/${hid}/file`);
  if (!res.ok) await throwApiError(res, 'File not found');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
