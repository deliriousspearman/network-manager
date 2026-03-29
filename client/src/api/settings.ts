import type { AppSettings } from 'shared/types';
import { throwApiError } from '../utils/apiError';

export async function fetchSettings(): Promise<AppSettings> {
  const res = await fetch('/api/settings');
  if (!res.ok) await throwApiError(res, 'Failed to fetch settings');
  return res.json();
}

export async function updateSettings(data: Partial<AppSettings>): Promise<AppSettings> {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update settings');
  return res.json();
}
