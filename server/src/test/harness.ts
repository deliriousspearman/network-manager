// Per-test-process server harness for route-level integration tests.
// Each test file gets its own fresh DATA_DIR (set BEFORE importing the app
// so connection.ts picks it up), spins up the express app on a random port,
// and exposes a small `request(...)` helper that wraps fetch.
//
// Usage:
//   import { setupTestServer } from '../test/harness.js';
//   const ctx = await setupTestServer();
//   const res = await ctx.request('POST', '/api/projects', { name: 'x', slug: 'x' });
//   ...
//   await ctx.teardown();

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

export interface TestContext {
  baseUrl: string;
  request: (method: string, urlPath: string, body?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: unknown; raw: Response }>;
  teardown: () => Promise<void>;
  dataDir: string;
}

export async function setupTestServer(): Promise<TestContext> {
  // Unique data dir per harness so two test files don't share a DB even
  // when running in the same worker. Set BEFORE importing the app.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'netdiag-test-'));
  process.env.DATA_DIR = dataDir;
  // Signal test mode so the rate limiter (and any other test-aware middleware)
  // can relax limits that don't make sense for synthetic test traffic.
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';

  // Dynamic import so DATA_DIR (set above) is honored when connection.ts
  // first loads. Vitest isolates test files into separate worker contexts
  // by default, so a single setupTestServer per file gets its own DB.
  const mod = await import('../app.js') as { default: import('express').Express };
  const app = mod.default;

  const server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('server.address() unexpected');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  const request: TestContext['request'] = async (method, urlPath, body, headers = {}) => {
    const res = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let parsed: unknown = null;
    if (text) {
      try { parsed = JSON.parse(text); } catch { parsed = text; }
    }
    return { status: res.status, body: parsed, raw: res };
  };

  const teardown: TestContext['teardown'] = async () => {
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  };

  return { baseUrl, request, teardown, dataDir };
}
