// End-to-end backup tests. Exercise the export → import-into-fresh-project
// round-trip for the most surface-heavy resource (devices) so the
// scoped/full INSERT helper introduced in the backup refactor stays
// behaviorally correct as the schema grows.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { setupTestServer, type TestContext } from '../test/harness.js';

interface ProjectRow { id: number; slug: string }
interface DeviceListItem { id: number; name: string; tags: string[]; primary_ip?: string | null; hypervisor_id?: number | null; hypervisor_name?: string | null }
interface SubnetRow { id: number; cidr: string }

describe('backup export/import round-trip', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestServer();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('round-trips devices, subnets, IPs, tags, hypervisor link, and connections through scoped import', async () => {
    // Source project
    const src = (await ctx.request('POST', '/api/projects', { name: 'Src', slug: 'src' })).body as ProjectRow;
    const subProd = (await ctx.request('POST', `/api/projects/${src.id}/subnets`, { name: 'prod', cidr: '10.0.0.0/24' })).body as { id: number };
    const subDev  = (await ctx.request('POST', `/api/projects/${src.id}/subnets`, { name: 'dev',  cidr: '10.0.1.0/24' })).body as { id: number };

    const hv = (await ctx.request('POST', `/api/projects/${src.id}/devices`, {
      name: 'hyperv01', type: 'server', hosting_type: 'hypervisor',
      subnet_id: subProd.id, tags: ['infra'],
      ips: [{ ip_address: '10.0.0.1', is_primary: 1 }],
    })).body as { id: number };

    const vm = (await ctx.request('POST', `/api/projects/${src.id}/devices`, {
      name: 'vm01', type: 'server', hosting_type: 'vm',
      hypervisor_id: hv.id, subnet_id: subProd.id, tags: ['production', 'web'],
      ips: [{ ip_address: '10.0.0.10', is_primary: 1 }, { ip_address: '10.0.0.11', is_primary: 0 }],
    })).body as { id: number };

    await ctx.request('POST', `/api/projects/${src.id}/devices`, {
      name: 'dev01', type: 'workstation', subnet_id: subDev.id, tags: ['dev'],
      ips: [{ ip_address: '10.0.1.5', is_primary: 1 }],
    });

    await ctx.request('POST', `/api/projects/${src.id}/connections`, {
      source_device_id: hv.id, target_device_id: vm.id, label: 'vmlink', connection_type: 'ethernet',
    });

    // Export
    const exp = await ctx.request('GET', `/api/projects/${src.id}/backup/export?includeCommandOutputs=true&includeCredentials=true&includeImages=true`);
    expect(exp.status).toBe(200);
    const backup = exp.body as { version: number; data: Record<string, unknown[]> };
    expect(backup.version).toBe(2);
    expect(backup.data.devices.length).toBe(3);
    expect(backup.data.subnets.length).toBe(2);
    expect(backup.data.device_ips.length).toBe(4);
    expect(backup.data.device_tags.length).toBeGreaterThanOrEqual(4);
    expect(backup.data.connections.length).toBe(1);

    // Fresh target project
    const tgt = (await ctx.request('POST', '/api/projects', { name: 'Tgt', slug: 'tgt' })).body as ProjectRow;

    // Import
    const imp = await ctx.request('POST', `/api/projects/${tgt.id}/backup/import`, backup);
    expect(imp.status).toBe(200);

    // Read back and verify
    const tgtSubnets = (await ctx.request('GET', `/api/projects/${tgt.id}/subnets`)).body as SubnetRow[];
    expect(tgtSubnets.map(s => s.cidr).sort()).toEqual(['10.0.0.0/24', '10.0.1.0/24']);

    const tgtDeviceList = (await ctx.request('GET', `/api/projects/${tgt.id}/devices?page=1&limit=100`)).body as { items: DeviceListItem[]; total: number };
    expect(tgtDeviceList.total).toBe(3);
    const byName = Object.fromEntries(tgtDeviceList.items.map(d => [d.name, d]));
    expect(byName.hyperv01).toBeTruthy();
    expect(byName.vm01).toBeTruthy();
    expect(byName.dev01).toBeTruthy();

    // Hypervisor link survives id-remap (vm01 still points at the new hyperv01).
    expect(byName.vm01.hypervisor_name).toBe('hyperv01');
    // Tags survive.
    expect(byName.vm01.tags.sort()).toEqual(['production', 'web']);
    // Primary IP survives (the join in the list query picks is_primary=1).
    expect(byName.vm01.primary_ip).toBe('10.0.0.10');

    // Connection survives.
    const tgtConns = (await ctx.request('GET', `/api/projects/${tgt.id}/connections`)).body as Array<{ label: string }>;
    expect(tgtConns.length).toBe(1);
    expect(tgtConns[0].label).toBe('vmlink');
  });

  it('re-importing into the same project (wipe-then-restore) is clean', async () => {
    const proj = (await ctx.request('POST', '/api/projects', { name: 'Roundtrip', slug: 'roundtrip' })).body as ProjectRow;
    await ctx.request('POST', `/api/projects/${proj.id}/subnets`, { name: 's', cidr: '10.1.0.0/24' });
    const dev = (await ctx.request('POST', `/api/projects/${proj.id}/devices`, {
      name: 'd', type: 'server', tags: ['x'],
      ips: [{ ip_address: '10.1.0.1', is_primary: 1 }],
    })).body as { id: number };
    expect(dev.id).toBeGreaterThan(0);

    const backup = (await ctx.request('GET', `/api/projects/${proj.id}/backup/export?includeCredentials=true&includeImages=true`)).body;

    const imp = await ctx.request('POST', `/api/projects/${proj.id}/backup/import`, backup);
    expect(imp.status).toBe(200);

    const after = (await ctx.request('GET', `/api/projects/${proj.id}/devices?page=1&limit=100`)).body as { total: number; items: DeviceListItem[] };
    expect(after.total).toBe(1);
    expect(after.items[0].name).toBe('d');
    expect(after.items[0].tags).toEqual(['x']);
  });
});
