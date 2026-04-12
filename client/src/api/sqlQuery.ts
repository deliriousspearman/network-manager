import { projectBase } from './base';

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated: boolean;
}

export async function executeQuery(projectId: number, sql: string): Promise<QueryResult> {
  const res = await fetch(projectBase(projectId, 'query'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Query failed' }));
    throw new Error(body.error || 'Query failed');
  }
  return res.json();
}
