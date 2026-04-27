// End-to-end bulk-delete tests. The bulk endpoints are best-effort — they
// process each row in its own transaction and return a partition of
// {deleted: [...ids], failed: [{id, error}]}. Single DELETE is idempotent
// (returns 204 on already-gone). Each bulk-deleted row creates its own
// trash entry so individual undo from Trash still works.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { setupTestServer, type TestContext } from '../test/harness.js';

interface ProjectRow { id: number }
interface BulkResult { deleted: number[]; failed: Array<{ id: number; error: string }> }

describe('bulk-delete: devices', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestServer();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('deletes valid ids and partitions failures cleanly', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'Bulk', slug: 'bulk' })).body as ProjectRow;
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const d = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: `d${i}`, type: 'server' })).body as { id: number };
      ids.push(d.id);
    }

    const res = await ctx.request('POST', `/api/projects/${proj.id}/devices/bulk-delete`, {
      ids: [...ids, 99999],
    });
    expect(res.status).toBe(200);
    const body = res.body as BulkResult;
    expect(body.deleted.sort((a, b) => a - b)).toEqual(ids.sort((a, b) => a - b));
    expect(body.failed).toHaveLength(1);
    expect(body.failed[0].id).toBe(99999);

    // Each deletion produced its own trash entry
    const trash = (await ctx.request('GET', `/api/projects/${proj.id}/trash`)).body as { items: Array<{ resource_type: string }> };
    expect(trash.items.filter(i => i.resource_type === 'device').length).toBe(5);
  });

  it('rejects empty or oversized id lists', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'BulkX', slug: 'bulkx' })).body as ProjectRow;

    const empty = await ctx.request('POST', `/api/projects/${proj.id}/devices/bulk-delete`, { ids: [] });
    expect(empty.status).toBe(400);

    const huge = await ctx.request('POST', `/api/projects/${proj.id}/devices/bulk-delete`, {
      ids: Array.from({ length: 501 }, (_, i) => i + 1),
    });
    expect(huge.status).toBe(400);
  });

  it('single DELETE is idempotent on a missing id (204, not 404)', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'Idem', slug: 'idem' })).body as ProjectRow;
    const res = await ctx.request('DELETE', `/api/projects/${proj.id}/devices/99999`);
    expect(res.status).toBe(204);
  });
});

describe('bulk-delete: subnets re-attach devices on undo', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestServer();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('restoring a bulk-deleted subnet re-binds its devices', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'BulkSub', slug: 'bulksub' })).body as ProjectRow;
    const subA = (await ctx.request('POST', `/api/projects/${proj.id}/subnets`, { name: 'a', cidr: '10.30.0.0/24' })).body as { id: number };
    const subB = (await ctx.request('POST', `/api/projects/${proj.id}/subnets`, { name: 'b', cidr: '10.31.0.0/24' })).body as { id: number };
    const dA = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: 'da', type: 'server', subnet_id: subA.id })).body as { id: number };
    const dB = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: 'db', type: 'server', subnet_id: subB.id })).body as { id: number };

    const res = await ctx.request('POST', `/api/projects/${proj.id}/subnets/bulk-delete`, { ids: [subA.id, subB.id] });
    expect((res.body as BulkResult).deleted.length).toBe(2);

    // Pick the subnet 'a' trash entry and undo it
    const trash = (await ctx.request('GET', `/api/projects/${proj.id}/trash?type=subnet`)).body as { items: Array<{ id: number; resource_name: string }> };
    const aEntry = trash.items.find(i => i.resource_name === 'a')!;
    await ctx.request('POST', `/api/projects/${proj.id}/undo/${aEntry.id}`);

    // Device da is rebound to subnet 'a'; db remains orphaned
    const after = (await ctx.request('GET', `/api/projects/${proj.id}/devices?page=1&limit=100`)).body as { items: Array<{ id: number; subnet_name: string | null }> };
    expect(after.items.find(d => d.id === dA.id)?.subnet_name).toBe('a');
    expect(after.items.find(d => d.id === dB.id)?.subnet_name).toBeFalsy();
  });
});
