// End-to-end undo tests. Verify that a delete + undo round-trip restores
// the resource with all its cascading state captured in the activity log
// (the exact thing the global Ctrl+Z hook relies on).

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { setupTestServer, type TestContext } from '../test/harness.js';

interface ProjectRow { id: number }
interface DeviceItem { id: number; name: string; tags: string[]; primary_ip?: string | null; subnet_name?: string | null }
interface TrashItem { id: number; resource_type: string; resource_id: number | null; resource_name: string | null }

describe('undo: device delete round-trip', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestServer();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('restores a deleted device with its IPs, tags, and subnet link', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'Undo', slug: 'undo' })).body as ProjectRow;
    const sub = (await ctx.request('POST', `/api/projects/${proj.id}/subnets`, { name: 'lan', cidr: '10.10.0.0/24' })).body as { id: number };
    const dev = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, {
      name: 'web01', type: 'server', subnet_id: sub.id, tags: ['production', 'web'],
      ips: [{ ip_address: '10.10.0.5', is_primary: 1 }],
    })).body as { id: number };

    // Delete
    const del = await ctx.request('DELETE', `/api/projects/${proj.id}/devices/${dev.id}`);
    expect(del.status).toBe(204);

    // Trash entry created
    const trash = (await ctx.request('GET', `/api/projects/${proj.id}/trash`)).body as { items: TrashItem[] };
    const entry = trash.items.find(i => i.resource_type === 'device' && i.resource_name === 'web01');
    expect(entry).toBeTruthy();

    // Undo
    const undo = await ctx.request('POST', `/api/projects/${proj.id}/undo/${entry!.id}`);
    expect(undo.status).toBe(200);

    // Device + state restored
    const list = (await ctx.request('GET', `/api/projects/${proj.id}/devices?page=1&limit=100`)).body as { items: DeviceItem[]; total: number };
    expect(list.total).toBe(1);
    const restored = list.items[0];
    expect(restored.name).toBe('web01');
    expect(restored.subnet_name).toBe('lan');
    expect(restored.primary_ip).toBe('10.10.0.5');
    expect(restored.tags.sort()).toEqual(['production', 'web']);
  });

  it('refuses to undo the same log entry twice', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'UndoX', slug: 'undox' })).body as ProjectRow;
    const dev = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: 'a', type: 'server' })).body as { id: number };
    await ctx.request('DELETE', `/api/projects/${proj.id}/devices/${dev.id}`);
    const trash = (await ctx.request('GET', `/api/projects/${proj.id}/trash`)).body as { items: TrashItem[] };
    const entry = trash.items[0];

    const first = await ctx.request('POST', `/api/projects/${proj.id}/undo/${entry.id}`);
    expect(first.status).toBe(200);

    const second = await ctx.request('POST', `/api/projects/${proj.id}/undo/${entry.id}`);
    expect(second.status).toBe(400);
    // Server flips can_undo=0 AND sets undone_at on first undo; the
    // can_undo guard fires first, so either error message is acceptable.
    expect((second.body as { error: string }).error).toMatch(/cannot be undone|already been undone/i);
  });

  it('restores a deleted subnet AND re-attaches its child devices', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'UndoSubnet', slug: 'undo-subnet' })).body as ProjectRow;
    const sub = (await ctx.request('POST', `/api/projects/${proj.id}/subnets`, { name: 'srv', cidr: '10.20.0.0/24' })).body as { id: number };
    const a = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: 'a', type: 'server', subnet_id: sub.id })).body as { id: number };
    const b = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, { name: 'b', type: 'server', subnet_id: sub.id })).body as { id: number };

    // Delete subnet — devices stay (FK ON DELETE SET NULL) but lose subnet_id.
    await ctx.request('DELETE', `/api/projects/${proj.id}/subnets/${sub.id}`);

    const orphaned = (await ctx.request('GET', `/api/projects/${proj.id}/devices?page=1&limit=100`)).body as { items: DeviceItem[] };
    expect(orphaned.items.find(d => d.id === a.id)?.subnet_name).toBeFalsy();
    expect(orphaned.items.find(d => d.id === b.id)?.subnet_name).toBeFalsy();

    // Undo
    const trash = (await ctx.request('GET', `/api/projects/${proj.id}/trash`)).body as { items: TrashItem[] };
    const entry = trash.items.find(i => i.resource_type === 'subnet')!;
    await ctx.request('POST', `/api/projects/${proj.id}/undo/${entry.id}`);

    // Both devices reattached
    const after = (await ctx.request('GET', `/api/projects/${proj.id}/devices?page=1&limit=100`)).body as { items: DeviceItem[] };
    expect(after.items.find(d => d.id === a.id)?.subnet_name).toBe('srv');
    expect(after.items.find(d => d.id === b.id)?.subnet_name).toBe('srv');
  });
});
