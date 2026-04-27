/**
 * Centralized TanStack Query key factory.
 *
 * Use these helpers instead of inline array literals so key shapes stay
 * consistent across useQuery, invalidateQueries, and setQueryData.
 *
 * Singular vs plural roots are intentional where they appear (e.g. `device`
 * for detail, `devices` for lists) — they represent distinct cache scopes
 * that don't share a prefix for invalidation. Keep the same distinction here.
 */

export const queryKeys = {
  // -------- credentials --------
  credentials: {
    all: (projectId: number) => ['credentials', projectId] as const,
    paged: (
      projectId: number,
      p: {
        page: number;
        limit: number;
        search: string;
        sort: string;
        dir: 'asc' | 'desc';
        used: string;
        hidden: string;
      },
    ) =>
      ['credentials', projectId, 'paged', p.page, p.limit, p.search, p.sort, p.dir, p.used, p.hidden] as const,
    forDevice: (projectId: number, deviceId: number) =>
      ['credentials', projectId, 'device', deviceId] as const,
    detail: (projectId: number, id: number) => ['credential', projectId, id] as const,
    history: (projectId: number, id: number) => ['credential', projectId, id, 'history'] as const,
  },

  // -------- agents --------
  agents: {
    all: (projectId: number) => ['agents', projectId] as const,
    paged: (
      projectId: number,
      p: {
        page: number;
        limit: number;
        search: string;
        sort: string;
        dir: 'asc' | 'desc';
        status: string;
        type: string;
      },
    ) =>
      ['agents', projectId, 'paged', p.page, p.limit, p.search, p.sort, p.dir, p.status, p.type] as const,
    // Detail key intentionally shares the 'agents' root (not 'agent') to match
    // the existing cache key shape; invalidating all() will also invalidate details.
    detail: (projectId: number, id: number) => ['agents', projectId, id] as const,
  },

  // -------- subnets --------
  subnets: {
    all: (projectId: number) => ['subnets', projectId] as const,
    paged: (
      projectId: number,
      p: {
        page: number;
        limit: number;
        search: string;
        sort: string;
        dir: 'asc' | 'desc';
        vlan: string;
      },
    ) =>
      ['subnets', projectId, 'paged', p.page, p.limit, p.search, p.sort, p.dir, p.vlan] as const,
    detail: (projectId: number, id: number) => ['subnet', projectId, id] as const,
  },

  // -------- devices --------
  devices: {
    all: (projectId: number) => ['devices', projectId] as const,
    paged: (
      projectId: number,
      p: {
        page: number;
        limit: number;
        search: string;
        sort: string;
        dir: 'asc' | 'desc';
        type: string;
        hostingType: string;
        status: string;
        // Tags are joined into a single string for cache-key stability — array
        // identity changes on every render, breaking React Query's structural sharing.
        tags?: string;
      },
    ) =>
      ['devices', projectId, 'paged', p.page, p.limit, p.search, p.sort, p.dir, p.type, p.hostingType, p.status, p.tags ?? ''] as const,
    picker: (projectId: number, search: string) =>
      ['devices', projectId, 'picker', search] as const,
    detail: (projectId: number, id: number) => ['device', projectId, id] as const,
    tags: (projectId: number) => ['devices', projectId, 'tags'] as const,
  },
};
