import { describe, it, expect } from 'vitest';
import { diffRows, ROW_KEY_FNS } from './rowDiff';

describe('diffRows', () => {
  it('returns empty diff for identical rows', () => {
    const rows = [{ id: 1, a: 'x' }, { id: 2, a: 'y' }];
    const out = diffRows(rows, rows, r => String(r.a));
    expect(out.added).toHaveLength(0);
    expect(out.removed).toHaveLength(0);
    expect(out.changed).toHaveLength(0);
    expect(out.unchanged).toHaveLength(2);
  });

  it('detects added and removed rows', () => {
    const before = [{ id: 1, a: 'x' }];
    const after = [{ id: 1, a: 'x' }, { id: 2, a: 'y' }];
    const out = diffRows(before, after, r => String(r.a));
    expect(out.added).toHaveLength(1);
    expect(out.added[0].a).toBe('y');
    expect(out.removed).toHaveLength(0);
  });

  it('detects changed rows with per-field tracking', () => {
    const before = [{ id: 1, pid: 100, cpu: '1.0', command: 'bash' }];
    const after = [{ id: 1, pid: 100, cpu: '5.0', command: 'bash' }];
    const out = diffRows(before, after, r => `${r.pid}|${r.command}`);
    expect(out.changed).toHaveLength(1);
    expect(out.changed[0].fields).toEqual(['cpu']);
  });

  it('ignores id and output_id fields by default', () => {
    const before = [{ id: 1, output_id: 10, name: 'eth0' }];
    const after = [{ id: 999, output_id: 999, name: 'eth0' }];
    const out = diffRows(before, after, r => String(r.name));
    expect(out.unchanged).toHaveLength(1);
    expect(out.changed).toHaveLength(0);
  });

  it('handles PID reuse with different commands as separate entries', () => {
    const before = [{ pid: 100, command: 'bash' }];
    const after = [{ pid: 100, command: 'vim' }];
    const out = diffRows(before, after, ROW_KEY_FNS.parsed_processes);
    expect(out.added).toHaveLength(1);
    expect(out.removed).toHaveLength(1);
    expect(out.changed).toHaveLength(0);
  });
});

describe('ROW_KEY_FNS', () => {
  it('processes key is pid|command', () => {
    expect(ROW_KEY_FNS.parsed_processes({ pid: 42, command: 'nginx' })).toBe('42|nginx');
  });
  it('router acls key is name|seq', () => {
    expect(ROW_KEY_FNS.parsed_router_acls({ acl_name: 'LAN', sequence: 10 })).toBe('LAN|10');
  });
});
