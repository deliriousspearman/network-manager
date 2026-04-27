// Sanity check that the test harness can boot the app, create a project,
// and tear down cleanly. If this fails, every other route-level test will
// fail for the same reason.

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { setupTestServer, type TestContext } from '../test/harness.js';

describe('test harness', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestServer();
  });

  afterAll(async () => {
    await ctx?.teardown();
  });

  it('can create and read a project', async () => {
    const create = await ctx.request('POST', '/api/projects', { name: 'Harness', slug: 'harness' });
    expect(create.status).toBe(201);
    const created = create.body as { id: number; slug: string };
    expect(created.slug).toBe('harness');

    const list = await ctx.request('GET', '/api/projects');
    expect(list.status).toBe(200);
    const projects = list.body as Array<{ id: number }>;
    expect(projects.some(p => p.id === created.id)).toBe(true);
  });
});
