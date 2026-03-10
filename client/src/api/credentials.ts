import type { CredentialWithDevice, CreateCredentialRequest } from 'shared/types';
import { projectBase } from './base';

export async function fetchCredentials(projectId: number): Promise<CredentialWithDevice[]> {
  const res = await fetch(projectBase(projectId, 'credentials'));
  if (!res.ok) throw new Error('Failed to fetch credentials');
  return res.json();
}

export async function fetchCredential(projectId: number, id: number): Promise<CredentialWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`);
  if (!res.ok) throw new Error('Credential not found');
  return res.json();
}

export async function createCredential(projectId: number, data: CreateCredentialRequest): Promise<CredentialWithDevice> {
  const res = await fetch(projectBase(projectId, 'credentials'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create credential');
  return res.json();
}

export async function updateCredential(projectId: number, id: number, data: CreateCredentialRequest): Promise<CredentialWithDevice> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update credential');
  return res.json();
}

export async function deleteCredential(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete credential');
}

export async function fetchCredentialsByDevice(projectId: number, deviceId: number): Promise<CredentialWithDevice[]> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}?device_id=${deviceId}`);
  if (!res.ok) throw new Error('Failed to fetch credentials');
  return res.json();
}

export async function fetchCredentialFileText(projectId: number, id: number): Promise<string> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/file`);
  if (!res.ok) throw new Error('File not found');
  return res.text();
}

export async function downloadCredentialFile(projectId: number, id: number, fileName: string): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'credentials')}/${id}/file`);
  if (!res.ok) throw new Error('File not found');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
