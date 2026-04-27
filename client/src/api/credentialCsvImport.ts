import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export interface CredentialCsvPreviewRow {
  row: number;
  username: string;
  username_valid: boolean;
  host: string | null;
  password_masked: string;
  type: string;
  type_valid: boolean;
  source: string | null;
  used: boolean;
  device_name: string | null;
  /** true = matched, false = unmatched, null = no device_name given */
  device_matched: boolean | null;
}

export interface CredentialCsvPreviewResult {
  total: number;
  rows: CredentialCsvPreviewRow[];
}

export interface CredentialCsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export async function previewCredentialCsv(projectId: number, csvText: string): Promise<CredentialCsvPreviewResult> {
  const res = await fetch(`${projectBase(projectId, 'credential-csv-import')}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) await throwApiError(res, 'CSV preview failed');
  return res.json();
}

export async function applyCredentialCsv(projectId: number, csvText: string): Promise<CredentialCsvImportResult> {
  const res = await fetch(`${projectBase(projectId, 'credential-csv-import')}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) await throwApiError(res, 'CSV import failed');
  return res.json();
}

export function credentialCsvTemplateUrl(projectId: number): string {
  return `${projectBase(projectId, 'credential-csv-import')}/template`;
}
