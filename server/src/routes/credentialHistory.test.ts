// End-to-end tests for credential password history:
// - PUT auto-snapshots prior password into credential_password_history
// - First-set (null → value) does NOT snapshot
// - Manual POST records 'invalid' entries
// - DELETE credential + undo restores both credential and history
// - History endpoints reject cross-project access

import { describe, it, beforeAll, afterAll, expect } from 'vitest';
import { setupTestServer, type TestContext } from '../test/harness.js';

interface ProjectRow { id: number }
interface CredentialRow { id: number; password: string | null; updated_at: string }
interface HistoryRow {
  id: number;
  credential_id: number;
  password: string | null;
  file_name: string | null;
  status: 'previous' | 'invalid';
  note: string | null;
  created_at: string;
  has_file: number;
}
interface TrashItem { id: number; resource_type: string; resource_name: string }

async function makeProject(ctx: TestContext, slug: string): Promise<number> {
  const res = await ctx.request('POST', '/api/projects', { name: slug, slug });
  return (res.body as ProjectRow).id;
}

async function makeCred(ctx: TestContext, projectId: number, body: Record<string, unknown>): Promise<CredentialRow> {
  const res = await ctx.request('POST', `/api/projects/${projectId}/credentials`, { username: 'admin', ...body });
  expect(res.status).toBe(201);
  return res.body as CredentialRow;
}

describe('credential password history', () => {
  let ctx: TestContext;
  beforeAll(async () => { ctx = await setupTestServer(); });
  afterAll(async () => { await ctx?.teardown(); });

  it('auto-snapshots when password is rotated', async () => {
    const pid = await makeProject(ctx, 'rotate');
    const cred = await makeCred(ctx, pid, { password: 'old1' });

    // Update to new password — should snapshot the prior 'old1'.
    const upd = await ctx.request('PUT', `/api/projects/${pid}/credentials/${cred.id}`, { username: 'admin', password: 'new1' });
    expect(upd.status).toBe(200);

    const hist = await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`);
    expect(hist.status).toBe(200);
    const rows = hist.body as HistoryRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].password).toBe('old1');
    expect(rows[0].status).toBe('previous');
  });

  it('does NOT snapshot when password is set for the first time (null → value)', async () => {
    const pid = await makeProject(ctx, 'firstset');
    // Create with no password
    const cred = await makeCred(ctx, pid, {});
    // First-set: assign a password
    await ctx.request('PUT', `/api/projects/${pid}/credentials/${cred.id}`, { username: 'admin', password: 'first' });
    const hist = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(hist).toHaveLength(0);
  });

  it('does NOT snapshot when password is unchanged', async () => {
    const pid = await makeProject(ctx, 'noop');
    const cred = await makeCred(ctx, pid, { password: 'same' });
    await ctx.request('PUT', `/api/projects/${pid}/credentials/${cred.id}`, { username: 'admin', password: 'same', host: 'edited' });
    const hist = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(hist).toHaveLength(0);
  });

  it('does snapshot when a value is cleared (value → null)', async () => {
    const pid = await makeProject(ctx, 'clear');
    const cred = await makeCred(ctx, pid, { password: 'forgetme' });
    await ctx.request('PUT', `/api/projects/${pid}/credentials/${cred.id}`, { username: 'admin' });
    const hist = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(hist).toHaveLength(1);
    expect(hist[0].password).toBe('forgetme');
  });

  it('records manual invalid entries via POST', async () => {
    const pid = await makeProject(ctx, 'invalid');
    const cred = await makeCred(ctx, pid, { password: 'real' });
    const post = await ctx.request('POST', `/api/projects/${pid}/credentials/${cred.id}/history`, {
      status: 'invalid', password: 'tried1', note: 'from incident',
    });
    expect(post.status).toBe(201);

    const hist = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(hist).toHaveLength(1);
    expect(hist[0].status).toBe('invalid');
    expect(hist[0].password).toBe('tried1');
    expect(hist[0].note).toBe('from incident');
  });

  it('rejects history POST with no payload', async () => {
    const pid = await makeProject(ctx, 'empty');
    const cred = await makeCred(ctx, pid, { password: 'x' });
    const post = await ctx.request('POST', `/api/projects/${pid}/credentials/${cred.id}/history`, { status: 'invalid' });
    expect(post.status).toBe(400);
  });

  it('rejects bad status', async () => {
    const pid = await makeProject(ctx, 'badstatus');
    const cred = await makeCred(ctx, pid, { password: 'x' });
    const post = await ctx.request('POST', `/api/projects/${pid}/credentials/${cred.id}/history`, { status: 'whatever', password: 'y' });
    expect(post.status).toBe(400);
  });

  it('PATCH updates note and DELETE removes the entry', async () => {
    const pid = await makeProject(ctx, 'editdel');
    const cred = await makeCred(ctx, pid, { password: 'x' });
    const created = (await ctx.request('POST', `/api/projects/${pid}/credentials/${cred.id}/history`, {
      status: 'invalid', password: 'tried', note: 'first note',
    })).body as HistoryRow;

    const upd = await ctx.request('PATCH', `/api/projects/${pid}/credentials/${cred.id}/history/${created.id}`, { note: 'updated' });
    expect(upd.status).toBe(200);
    expect((upd.body as HistoryRow).note).toBe('updated');

    const del = await ctx.request('DELETE', `/api/projects/${pid}/credentials/${cred.id}/history/${created.id}`);
    expect(del.status).toBe(204);

    const hist = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(hist).toHaveLength(0);
  });

  it('history endpoints reject cross-project access', async () => {
    const p1 = await makeProject(ctx, 'p1');
    const p2 = await makeProject(ctx, 'p2');
    const cred = await makeCred(ctx, p1, { password: 'x' });

    // Listing as p2 should 404
    const list = await ctx.request('GET', `/api/projects/${p2}/credentials/${cred.id}/history`);
    expect(list.status).toBe(404);

    // Posting as p2 should 404
    const post = await ctx.request('POST', `/api/projects/${p2}/credentials/${cred.id}/history`, { status: 'invalid', password: 'x' });
    expect(post.status).toBe(404);
  });

  it('undo of credential delete restores history rows', async () => {
    const pid = await makeProject(ctx, 'undohist');
    const cred = await makeCred(ctx, pid, { password: 'old1' });

    // Build up two history rows: one auto from rotation, one manual invalid
    await ctx.request('PUT', `/api/projects/${pid}/credentials/${cred.id}`, { username: 'admin', password: 'new1' });
    await ctx.request('POST', `/api/projects/${pid}/credentials/${cred.id}/history`, { status: 'invalid', password: 'tried' });

    const before = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(before).toHaveLength(2);

    // Delete the credential
    await ctx.request('DELETE', `/api/projects/${pid}/credentials/${cred.id}`);

    // Find the trash entry and undo it
    const trash = (await ctx.request('GET', `/api/projects/${pid}/trash?type=credential`)).body as { items: TrashItem[] };
    const entry = trash.items.find(i => i.resource_type === 'credential')!;
    expect(entry).toBeTruthy();
    const undo = await ctx.request('POST', `/api/projects/${pid}/undo/${entry.id}`);
    expect(undo.status).toBe(200);

    // Both history rows should be back
    const after = (await ctx.request('GET', `/api/projects/${pid}/credentials/${cred.id}/history`)).body as HistoryRow[];
    expect(after).toHaveLength(2);
    const passwords = after.map(h => h.password).sort();
    expect(passwords).toEqual(['old1', 'tried']);
  });
});
