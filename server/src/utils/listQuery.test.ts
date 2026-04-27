import { describe, it, expect } from 'vitest';
import type { Request } from 'express';
import { buildListQuery } from './listQuery.js';

function makeReq(query: Record<string, string> = {}): Request {
  return { query } as unknown as Request;
}

describe('buildListQuery', () => {
  it('adds projectId predicate with no filters or search', () => {
    const out = buildListQuery(makeReq(), {
      projectId: 42,
      sort: { map: { name: 's.name' }, default: 's.name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ?');
    expect(out.whereParams).toEqual([42]);
    expect(out.orderBy).toBe('ORDER BY s.name ASC');
    expect(out.pagination).toBeNull();
  });

  it('honors a custom project column', () => {
    const out = buildListQuery(makeReq(), {
      projectId: 7,
      projectColumn: 'a.project_id',
      sort: { map: {}, default: 'a.created_at', defaultDir: 'desc' },
    });
    expect(out.whereClause).toBe('WHERE a.project_id = ?');
    expect(out.orderBy).toBe('ORDER BY a.created_at DESC');
  });

  it('expands search into OR\'d LIKEs', () => {
    const out = buildListQuery(makeReq({ search: 'router' }), {
      projectId: 1,
      search: { columns: ['name', 'description'] },
      sort: { map: {}, default: 'name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND (name LIKE ? OR description LIKE ?)');
    expect(out.whereParams).toEqual([1, '%router%', '%router%']);
  });

  it('skips empty/whitespace search', () => {
    const out = buildListQuery(makeReq({ search: '   ' }), {
      projectId: 1,
      search: { columns: ['name'] },
      sort: { map: {}, default: 'name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ?');
    expect(out.whereParams).toEqual([1]);
  });

  it('applies string filter with allow-list', () => {
    const out = buildListQuery(makeReq({ status: 'active' }), {
      projectId: 1,
      filters: { status: { column: 's.status', type: 'string', allowed: ['active', 'inactive'] } },
      sort: { map: {}, default: 'name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND s.status = ?');
    expect(out.whereParams).toEqual([1, 'active']);
  });

  it('ignores string filter values outside the allow-list', () => {
    const out = buildListQuery(makeReq({ status: 'bogus' }), {
      projectId: 1,
      filters: { status: { column: 's.status', type: 'string', allowed: ['active'] } },
      sort: { map: {}, default: 'name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ?');
    expect(out.whereParams).toEqual([1]);
  });

  it('coerces int filters and drops non-numeric inputs', () => {
    const out1 = buildListQuery(makeReq({ resource_id: '123' }), {
      projectId: 1,
      filters: { resource_id: { column: 'a.resource_id', type: 'int' } },
      sort: { map: {}, default: 'a.id' },
    });
    expect(out1.whereParams).toEqual([1, 123]);

    const out2 = buildListQuery(makeReq({ resource_id: 'nope' }), {
      projectId: 1,
      filters: { resource_id: { column: 'a.resource_id', type: 'int' } },
      sort: { map: {}, default: 'a.id' },
    });
    expect(out2.whereClause).toBe('WHERE project_id = ?');
  });

  it('supports bool01 filters as 1/0', () => {
    const out = buildListQuery(makeReq({ used: '1' }), {
      projectId: 1,
      filters: { used: { column: 'c.used', type: 'bool01' } },
      sort: { map: {}, default: 'c.id' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND c.used = ?');
    expect(out.whereParams).toEqual([1, 1]);
  });

  it('normalizes datetime-local inputs', () => {
    const out = buildListQuery(makeReq({ since: '2026-04-20T08:30' }), {
      projectId: 1,
      filters: { since: { column: 'a.created_at', type: 'datetime' } },
      sort: { map: {}, default: 'a.created_at' },
    });
    expect(out.whereParams).toEqual([1, '2026-04-20 08:30']);
  });

  it('applies sentinel clauses (e.g. IS NULL) without a param', () => {
    const out = buildListQuery(makeReq({ vlan: 'none' }), {
      projectId: 1,
      filters: {
        vlan: {
          column: 'vlan_id',
          type: 'string',
          sentinels: { none: 'vlan_id IS NULL', has: 'vlan_id IS NOT NULL' },
        },
      },
      sort: { map: {}, default: 'name' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND vlan_id IS NULL');
    expect(out.whereParams).toEqual([1]);
  });

  it('validates sort key against the map and honors order=desc', () => {
    const out = buildListQuery(makeReq({ sort: 'name', order: 'desc' }), {
      projectId: 1,
      sort: { map: { name: 's.name', cidr: 's.cidr' }, default: 's.id' },
    });
    expect(out.orderBy).toBe('ORDER BY s.name DESC');
  });

  it('falls back to default sort when the key is unknown', () => {
    const out = buildListQuery(makeReq({ sort: 'wat' }), {
      projectId: 1,
      sort: { map: { name: 's.name' }, default: 's.id' },
    });
    expect(out.orderBy).toBe('ORDER BY s.id ASC');
  });

  it('returns pagination when page is present', () => {
    const out = buildListQuery(makeReq({ page: '3', limit: '25' }), {
      projectId: 1,
      sort: { map: {}, default: 'id' },
    });
    expect(out.pagination).toEqual({ page: 3, limit: 25, offset: 50 });
  });

  it('omits pagination when page is absent', () => {
    const out = buildListQuery(makeReq({ limit: '25' }), {
      projectId: 1,
      sort: { map: {}, default: 'id' },
    });
    expect(out.pagination).toBeNull();
  });

  it('supports custom comparison operators (datetime ranges)', () => {
    const out = buildListQuery(makeReq({ since: '2026-04-20T08:30', until: '2026-04-20T09:00' }), {
      projectId: 1,
      filters: {
        since: { column: 'a.created_at', type: 'datetime', operator: '>=' },
        until: { column: 'a.created_at', type: 'datetime', operator: '<=', valueSuffix: ':59' },
      },
      sort: { map: {}, default: 'a.created_at' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND a.created_at >= ? AND a.created_at <= ?');
    expect(out.whereParams).toEqual([1, '2026-04-20 08:30', '2026-04-20 09:00:59']);
  });

  it('stacks multiple filters in the order they appear in the spec', () => {
    const out = buildListQuery(makeReq({ status: 'active', agent_type: 'wazuh' }), {
      projectId: 1,
      filters: {
        status: { column: 'a.status', type: 'string', allowed: ['active', 'inactive'] },
        agent_type: { column: 'a.agent_type', type: 'string' },
      },
      sort: { map: {}, default: 'a.id' },
    });
    expect(out.whereClause).toBe('WHERE project_id = ? AND a.status = ? AND a.agent_type = ?');
    expect(out.whereParams).toEqual([1, 'active', 'wazuh']);
  });
});
