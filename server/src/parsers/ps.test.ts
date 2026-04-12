import { describe, it, expect } from 'vitest';
import { parsePs } from './ps.js';

describe('parsePs', () => {
  it('parses standard ps aux output', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 169236 12400 ?        Ss   Mar20   0:15 /sbin/init
www-data  1234  2.5  1.2 456789 98765 ?        Sl   10:30   5:42 /usr/sbin/apache2 -k start
nobody    5678  0.1  0.0  12345  2048 ?        S    09:00   0:02 /usr/bin/dbus-daemon`;

    const result = parsePs(input);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      pid: 1,
      user: 'root',
      cpu_percent: 0.0,
      mem_percent: 0.1,
      command: '/sbin/init',
    });

    expect(result[1].pid).toBe(1234);
    expect(result[1].user).toBe('www-data');
    expect(result[1].cpu_percent).toBe(2.5);
    expect(result[1].command).toBe('/usr/sbin/apache2 -k start');

    expect(result[2].pid).toBe(5678);
  });

  it('returns empty array for header only', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND`;
    expect(parsePs(input)).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(parsePs('')).toEqual([]);
    expect(parsePs('\n')).toEqual([]);
  });

  it('returns empty array when COMMAND column is missing', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME
root         1  0.0  0.1 169236 12400 ?        Ss   Mar20   0:15`;
    expect(parsePs(input)).toEqual([]);
  });

  it('handles commands with spaces', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root       100  0.0  0.0  1000   500 ?        S    10:00   0:00 /usr/bin/python3 /opt/app/main.py --flag value`;

    const result = parsePs(input);
    expect(result).toHaveLength(1);
    expect(result[0].command).toContain('/opt/app/main.py --flag value');
  });

  it('skips lines with non-numeric PID', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 169236 12400 ?        Ss   Mar20   0:15 /sbin/init
badline  abc  0.0  0.0      0     0 ?        S    10:00   0:00 /bin/bad`;

    const result = parsePs(input);
    expect(result).toHaveLength(1);
    expect(result[0].pid).toBe(1);
  });

  it('skips lines with too few columns', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  0.0  0.1 169236 12400 ?        Ss   Mar20   0:15 /sbin/init
short`;

    const result = parsePs(input);
    expect(result).toHaveLength(1);
  });

  it('defaults NaN cpu/mem to 0', () => {
    const input = `USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND
root         1  N/A  N/A 169236 12400 ?        Ss   Mar20   0:15 /sbin/init`;

    const result = parsePs(input);
    expect(result).toHaveLength(1);
    expect(result[0].cpu_percent).toBe(0);
    expect(result[0].mem_percent).toBe(0);
  });
});
