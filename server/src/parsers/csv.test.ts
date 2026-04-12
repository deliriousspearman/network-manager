import { describe, it, expect } from 'vitest';
import { parseCsv, splitCsvLine } from './csv.js';

describe('splitCsvLine', () => {
  it('splits simple comma-separated values', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles single value', () => {
    expect(splitCsvLine('hello')).toEqual(['hello']);
  });

  it('handles empty fields', () => {
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(splitCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(splitCsvLine('"say ""hi""",b')).toEqual(['say "hi"', 'b']);
  });

  it('handles empty quoted field', () => {
    expect(splitCsvLine('"",b')).toEqual(['', 'b']);
  });

  it('handles trailing comma', () => {
    expect(splitCsvLine('a,b,')).toEqual(['a', 'b', '']);
  });
});

describe('parseCsv', () => {
  it('parses basic CSV with name and type', () => {
    const csv = 'name,type\nWeb Server,server\nFirewall,firewall';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Web Server');
    expect(rows[0].type).toBe('server');
    expect(rows[1].name).toBe('Firewall');
    expect(rows[1].type).toBe('firewall');
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsv('name,type')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(parseCsv('')).toEqual([]);
  });

  it('returns empty array for single line', () => {
    expect(parseCsv('name')).toEqual([]);
  });

  it('skips rows without a name', () => {
    const csv = 'name,type\nWeb Server,server\n,firewall\nRouter,router';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toBe('Web Server');
    expect(rows[1].name).toBe('Router');
  });

  it('normalizes headers to lowercase with underscores', () => {
    const csv = 'Name,IP Address,Mac Address\nServer,10.0.0.1,AA:BB:CC:DD:EE:FF';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Server');
    expect(rows[0].ip_address).toBe('10.0.0.1');
    expect(rows[0].mac_address).toBe('AA:BB:CC:DD:EE:FF');
  });

  it('handles Windows-style line endings (\\r\\n)', () => {
    const csv = 'name,type\r\nServer,server\r\nSwitch,switch';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });

  it('handles all supported columns', () => {
    const csv = 'name,type,ip_address,mac_address,os,hostname,domain,location,tags\nSrv,server,10.0.0.1,AA:BB:CC:DD:EE:FF,Ubuntu,srv01,example.com,Rack A,web;prod';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Srv',
      type: 'server',
      ip_address: '10.0.0.1',
      mac_address: 'AA:BB:CC:DD:EE:FF',
      os: 'Ubuntu',
      hostname: 'srv01',
      domain: 'example.com',
      location: 'Rack A',
      tags: 'web;prod',
    });
  });

  it('handles quoted fields with commas in values', () => {
    const csv = 'name,location\n"Server, Main","Rack A, Floor 2"';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Server, Main');
    expect(rows[0].location).toBe('Rack A, Floor 2');
  });

  it('handles fewer values than headers', () => {
    const csv = 'name,type,os\nServer';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Server');
    expect(rows[0].type).toBe('');
  });

  it('trims whitespace from values', () => {
    const csv = 'name , type \n  Web Server  ,  server  ';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Web Server');
    expect(rows[0].type).toBe('server');
  });

  it('skips blank lines', () => {
    const csv = 'name,type\n\nServer,server\n\nSwitch,switch\n';
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(2);
  });
});
