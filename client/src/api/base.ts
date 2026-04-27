export function projectBase(projectId: number, resource: string): string {
  return `/api/projects/${projectId}/${resource}`;
}

export function buildPaginationParams(p: {
  page?: number;
  limit?: number;
  search?: string;
  sort?: string;
  order?: 'asc' | 'desc';
}): URLSearchParams {
  const q = new URLSearchParams({
    page: String(p.page ?? 1),
    limit: String(p.limit ?? 50),
  });
  if (p.search) q.set('search', p.search);
  if (p.sort) q.set('sort', p.sort);
  if (p.order) q.set('order', p.order);
  return q;
}
