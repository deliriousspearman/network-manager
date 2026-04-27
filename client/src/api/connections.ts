import type { Connection, CreateConnectionRequest } from 'shared/types';
import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export async function fetchConnections(projectId: number): Promise<Connection[]> {
  const res = await fetch(projectBase(projectId, 'connections'));
  if (!res.ok) await throwApiError(res, 'Failed to fetch connections');
  return res.json();
}

export async function createConnection(projectId: number, data: CreateConnectionRequest): Promise<Connection> {
  const res = await fetch(projectBase(projectId, 'connections'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to create connection');
  return res.json();
}

export async function updateConnection(projectId: number, id: number, data: { label?: string | null; connection_type?: string; edge_type?: string; edge_color?: string | null; edge_width?: number | null; label_color?: string | null; label_bg_color?: string | null; source_handle?: string | null; target_handle?: string | null; source_port?: string | null; target_port?: string | null; updated_at?: string }): Promise<Connection> {
  const res = await fetch(`${projectBase(projectId, 'connections')}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) await throwApiError(res, 'Failed to update connection');
  return res.json();
}

export async function deleteConnection(projectId: number, id: number): Promise<void> {
  const res = await fetch(`${projectBase(projectId, 'connections')}/${id}`, { method: 'DELETE' });
  if (!res.ok) await throwApiError(res, 'Failed to delete connection');
}
