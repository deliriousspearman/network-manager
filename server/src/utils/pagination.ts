import type { Request } from 'express';

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ParsePaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
}

// Parse `?page` / `?limit` from an Express request into normalized page/limit/offset.
// Negative or non-numeric inputs fall back to sensible defaults. Callers should gate
// on `req.query.page !== undefined` before calling to preserve legacy "unpaginated" mode.
export function parsePagination(req: Request, opts: ParsePaginationOptions = {}): PageParams {
  const defaultLimit = opts.defaultLimit ?? 50;
  const maxLimit = opts.maxLimit ?? 200;
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit as string) || defaultLimit));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function pagedResponse<T>(items: T[], total: number, page: number, limit: number): PagedResponse<T> {
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
