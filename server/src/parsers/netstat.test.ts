import { describe, it, expect } from 'vitest';
import { parseNetstat } from './netstat.js';

describe('parseNetstat', () => {
  it('parses netstat -tulpn output', () => {
    const input = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
tcp        0      0 127.0.0.1:3306          0.0.0.0:*               LISTEN      5678/mysqld
udp        0      0 0.0.0.0:68              0.0.0.0:*                           9012/dhclient`;

    const result = parseNetstat(input);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      protocol: 'tcp',
      local_addr: '0.0.0.0:22',
      foreign_addr: '0.0.0.0:*',
      state: 'LISTEN',
      pid_program: '1234/sshd',
    });

    expect(result[1].local_addr).toBe('127.0.0.1:3306');
    expect(result[1].pid_program).toBe('5678/mysqld');

    expect(result[2].protocol).toBe('udp');
  });

  it('parses ss -tulpn output', () => {
    const input = `Netid State  Recv-Q Send-Q    Local Address:Port     Peer Address:Port  Process
tcp   LISTEN 0      128       0.0.0.0:22            0.0.0.0:*          users:(("sshd",pid=1234,fd=3))
tcp   LISTEN 0      80        127.0.0.1:3306        0.0.0.0:*          users:(("mysqld",pid=5678,fd=21))
udp   UNCONN 0      0         0.0.0.0:68            0.0.0.0:*          users:(("dhclient",pid=9012,fd=6))`;

    const result = parseNetstat(input);
    expect(result).toHaveLength(3);

    expect(result[0]).toEqual({
      protocol: 'tcp',
      local_addr: '0.0.0.0:22',
      foreign_addr: '0.0.0.0:*',
      state: 'LISTEN',
      pid_program: 'users:(("sshd",pid=1234,fd=3))',
    });

    expect(result[1].local_addr).toBe('127.0.0.1:3306');
    expect(result[2].protocol).toBe('udp');
    expect(result[2].state).toBe('UNCONN');
  });

  it('returns empty array for empty input', () => {
    expect(parseNetstat('')).toEqual([]);
    expect(parseNetstat('\n\n')).toEqual([]);
  });

  it('returns empty array for header only', () => {
    const input = `Active Internet connections (only servers)
Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name`;
    expect(parseNetstat(input)).toEqual([]);
  });

  it('skips non-tcp/udp protocols in netstat format', () => {
    const input = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
raw        0      0 0.0.0.0:255             0.0.0.0:*               7           0/kernel
unix       0      0 /var/run/dbus           stream CONNECTED        5678/dbus`;

    const result = parseNetstat(input);
    expect(result).toHaveLength(1);
    expect(result[0].protocol).toBe('tcp');
  });

  it('handles tcp6 and udp6 protocols', () => {
    const input = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp6       0      0 :::80                   :::*                    LISTEN      1234/nginx
udp6       0      0 :::5353                 :::*                                5678/avahi`;

    const result = parseNetstat(input);
    expect(result).toHaveLength(2);
    expect(result[0].protocol).toBe('tcp6');
    expect(result[1].protocol).toBe('udp6');
  });

  it('skips lines with too few columns', () => {
    const input = `Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name
tcp        0      0 0.0.0.0:22              0.0.0.0:*               LISTEN      1234/sshd
short line`;

    const result = parseNetstat(input);
    expect(result).toHaveLength(1);
  });
});
