import type { PagedResult, PagedParams } from '../api/devices';

export const CSV_EXPORT_PAGE_SIZE = 200;
export const CSV_EXPORT_MAX_ROWS = 50_000;

type Fetcher<T> = (params: PagedParams) => Promise<PagedResult<T>>;

/**
 * Drains every page of a paginated list endpoint into one array, stopping at
 * CSV_EXPORT_MAX_ROWS. Returns the accumulated rows and a flag indicating
 * whether the export was truncated. Callers build the CSV from `items`.
 */
export async function drainPaged<T>(
  fetcher: Fetcher<T>,
  baseParams: Omit<PagedParams, 'page' | 'limit'>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let page = 1;
  let truncated = false;
  while (items.length < CSV_EXPORT_MAX_ROWS) {
    const r = await fetcher({ ...baseParams, page, limit: CSV_EXPORT_PAGE_SIZE });
    items.push(...r.items);
    if (page >= r.totalPages || r.items.length === 0) break;
    page++;
    if (items.length >= CSV_EXPORT_MAX_ROWS) {
      truncated = true;
      items.length = CSV_EXPORT_MAX_ROWS;
      break;
    }
  }
  return { items, truncated };
}

/** Turn a 2-D row array into a CSV string with proper quoting. */
export function rowsToCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(csv: string, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
