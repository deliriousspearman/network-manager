import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function exportBackup(projectId: number, includeCommandOutputs: boolean, includeCredentials: boolean): Promise<void> {
  const params = new URLSearchParams();
  if (!includeCommandOutputs) params.set('includeCommandOutputs', 'false');
  if (!includeCredentials) params.set('includeCredentials', 'false');

  const res = await fetch(`${projectBase(projectId, 'backup')}/export?${params}`);
  if (!res.ok) await throwApiError(res, 'Export failed');

  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `network-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBackup(projectId: number, data: unknown): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'backup')}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Import failed');
}

export async function exportFullBackup(includeCommandOutputs: boolean, includeCredentials: boolean): Promise<void> {
  const params = new URLSearchParams();
  if (!includeCommandOutputs) params.set('includeCommandOutputs', 'false');
  if (!includeCredentials) params.set('includeCredentials', 'false');

  const res = await fetch(`/api/backup/export?${params}`);
  if (!res.ok) await throwApiError(res, 'Export failed');

  const blob = await res.blob();
  const date = new Date().toISOString().slice(0, 10);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `network-full-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importFullBackup(data: unknown): Promise<void> {
  const res = await fetch('/api/backup/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Import failed');
}
