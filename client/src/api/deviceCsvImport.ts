import { projectBase } from './base';
import { throwApiError } from '../utils/apiError';

export interface CsvPreviewRow {
  row: number;
  name: string;
  type: string;
  type_valid: boolean;
  ip_address: string | null;
  mac_address: string | null;
  os: string | null;
  hostname: string | null;
  domain: string | null;
  location: string | null;
  tags: string | null;
}

export interface CsvPreviewResult {
  total: number;
  rows: CsvPreviewRow[];
}

export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

export async function previewCsvImport(projectId: number, csvText: string): Promise<CsvPreviewResult> {
  const res = await fetch(`${projectBase(projectId, 'device-csv-import')}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) await throwApiError(res, 'CSV preview failed');
  return res.json();
}

export async function applyCsvImport(projectId: number, csvText: string): Promise<CsvImportResult> {
  const res = await fetch(`${projectBase(projectId, 'device-csv-import')}/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: csvText }),
  });
  if (!res.ok) await throwApiError(res, 'CSV import failed');
  return res.json();
}

export function csvTemplateUrl(projectId: number): string {
  return `${projectBase(projectId, 'device-csv-import')}/template`;
}
