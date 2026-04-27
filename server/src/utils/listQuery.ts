import type { Request } from 'express';
import { parsePagination, type ParsePaginationOptions } from './pagination.js';

// Declarative list-route helper for the pattern we repeat in activityLogs, agents,
// subnets, credentials, and (to a lesser extent) devices: take a request's query
// params, validate sort/filters against a whitelist, and return a WHERE clause
// plus ORDER BY + LIMIT/OFFSET that can be composed with a route-specific SELECT.
//
// Intentionally does NOT execute the query — each route has its own JOINs,
// FTS handling, and projection shape. This helper only owns the parts that were
// duplicated verbatim across routes: filter param parsing, sort-column validation,
// search LIKE expansion, and pagination plumbing.

export type FilterType = 'string' | 'int' | 'bool' | 'bool01' | 'datetime';

export interface FilterSpec {
  column: string; // SQL column reference, e.g. 'a.resource_type' or 'vlan_id'
  type: FilterType;
  // Optional allow-list for string filters; values outside it are ignored.
  allowed?: readonly string[];
  // Sentinel values that don't compare directly — e.g. 'none' means IS NULL.
  // Each entry maps a raw query value to a replacement SQL fragment (no params).
  sentinels?: Record<string, string>;
  // Comparison operator. Defaults to '='. Useful for datetime range filters
  // where the "since" field maps to `>=` and "until" maps to `<=`.
  operator?: '=' | '>=' | '<=' | '>' | '<';
  // Optional string suffix appended to the coerced value before binding. Used
  // by activityLogs' "until" filter to turn 12:00 into 12:00:59 so inclusive
  // upper bounds cover the whole minute.
  valueSuffix?: string;
}

export interface SearchSpec {
  columns: readonly string[]; // columns to LIKE %search% against, OR'd together
}

export interface SortSpec {
  // Map of externally-visible sort key -> SQL column. Only keys in this map
  // are honored; anything else falls back to `default`.
  map: Readonly<Record<string, string>>;
  default: string; // SQL column reference used when no/invalid sort provided
  defaultDir?: 'asc' | 'desc';
}

export interface BuildListQueryOptions {
  projectColumn?: string; // defaults to 'project_id'
  projectId: number;
  filters?: Readonly<Record<string, FilterSpec>>;
  search?: SearchSpec;
  sort: SortSpec;
  pagination?: ParsePaginationOptions;
}

export interface ListQueryResult {
  // "WHERE <projectColumn> = ? AND ..." — always starts with WHERE.
  whereClause: string;
  // Params to bind against whereClause, in order (projectId first).
  whereParams: unknown[];
  // "ORDER BY <col> <dir>"
  orderBy: string;
  // Present only when req.query.page !== undefined.
  pagination: { page: number; limit: number; offset: number } | null;
}

function coerceFilterValue(raw: string, spec: FilterSpec): unknown | undefined {
  switch (spec.type) {
    case 'string': {
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      if (spec.allowed && !spec.allowed.includes(trimmed)) return undefined;
      return trimmed;
    }
    case 'int': {
      const n = parseInt(raw);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'bool': {
      if (raw === 'true' || raw === '1') return 1;
      if (raw === 'false' || raw === '0') return 0;
      return undefined;
    }
    case 'bool01': {
      if (raw === '1') return 1;
      if (raw === '0') return 0;
      return undefined;
    }
    case 'datetime': {
      // datetime-local sends "YYYY-MM-DDTHH:MM"; SQLite stores "YYYY-MM-DD HH:MM:SS".
      const trimmed = raw.trim();
      if (!trimmed) return undefined;
      return trimmed.replace('T', ' ');
    }
  }
}

export function buildListQuery(req: Request, opts: BuildListQueryOptions): ListQueryResult {
  const projectColumn = opts.projectColumn ?? 'project_id';
  const clauses: string[] = [];
  const params: unknown[] = [];

  clauses.push(`${projectColumn} = ?`);
  params.push(opts.projectId);

  if (opts.search) {
    const raw = ((req.query.search as string) || '').trim();
    if (raw) {
      const like = `%${raw}%`;
      const ors = opts.search.columns.map(c => `${c} LIKE ?`).join(' OR ');
      clauses.push(`(${ors})`);
      for (const _ of opts.search.columns) params.push(like);
    }
  }

  if (opts.filters) {
    for (const [queryKey, spec] of Object.entries(opts.filters)) {
      const raw = req.query[queryKey];
      if (typeof raw !== 'string' || raw === '') continue;

      if (spec.sentinels && raw in spec.sentinels) {
        clauses.push(spec.sentinels[raw]);
        continue;
      }

      const value = coerceFilterValue(raw, spec);
      if (value === undefined) continue;
      const operator = spec.operator ?? '=';
      const finalValue = spec.valueSuffix !== undefined && typeof value === 'string'
        ? `${value}${spec.valueSuffix}`
        : value;
      clauses.push(`${spec.column} ${operator} ?`);
      params.push(finalValue);
    }
  }

  const sortKey = req.query.sort as string | undefined;
  const sortCol = (sortKey && opts.sort.map[sortKey]) || opts.sort.default;
  const defaultDir = opts.sort.defaultDir === 'desc' ? 'DESC' : 'ASC';
  const sortDir = req.query.order === 'desc'
    ? 'DESC'
    : req.query.order === 'asc'
      ? 'ASC'
      : defaultDir;
  const orderBy = `ORDER BY ${sortCol} ${sortDir}`;

  const pagination = req.query.page !== undefined
    ? parsePagination(req, opts.pagination)
    : null;

  return {
    whereClause: `WHERE ${clauses.join(' AND ')}`,
    whereParams: params,
    orderBy,
    pagination,
  };
}
