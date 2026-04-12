import { describe, it, expect } from 'vitest';
import { parseArp } from './arp.js';

describe('parseArp', () => {
  it('parses standard arp -a output', () => {
    const input = `? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (192.168.1.2) at 11:22:33:44:55:66 [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff', interface: 'eth0' });
    expect(result[1]).toEqual({ ip: '192.168.1.2', mac: '11:22:33:44:55:66', interface: 'eth0' });
  });

  it('parses Linux table format', () => {
    const input = `Address          HWtype  HWaddress           Flags Mask  Iface
192.168.1.1      ether   aa:bb:cc:dd:ee:ff   C           eth0
10.0.0.1         ether   11:22:33:44:55:66   C           wlan0`;

    const result = parseArp(input);
    expect(result).toHaveLength(2);
    expect(result[0].ip).toBe('192.168.1.1');
    expect(result[1].ip).toBe('10.0.0.1');
  });

  it('skips incomplete entries', () => {
    const input = `? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (192.168.1.2) at <incomplete> on eth0
? (192.168.1.3) at 11:22:33:44:55:66 [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(2);
    expect(result.map(h => h.ip)).toEqual(['192.168.1.1', '192.168.1.3']);
  });

  it('deduplicates by IP', () => {
    const input = `? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (192.168.1.1) at 11:22:33:44:55:66 [ether] on wlan0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].mac).toBe('aa:bb:cc:dd:ee:ff'); // first one wins
  });

  it('filters multicast IPs (224-239)', () => {
    const input = `? (224.0.0.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (239.255.255.250) at 11:22:33:44:55:66 [ether] on eth0
? (192.168.1.1) at 22:33:44:55:66:77 [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('192.168.1.1');
  });

  it('filters link-local IPs (169.254.x.x)', () => {
    const input = `? (169.254.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (10.0.0.1) at 11:22:33:44:55:66 [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('10.0.0.1');
  });

  it('filters broadcast and zero MACs', () => {
    const input = `? (192.168.1.1) at ff:ff:ff:ff:ff:ff [ether] on eth0
? (192.168.1.2) at 00:00:00:00:00:00 [ether] on eth0
? (192.168.1.3) at aa:bb:cc:dd:ee:ff [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('192.168.1.3');
  });

  it('filters special IPs (0.0.0.0, 255.255.255.255)', () => {
    const input = `? (0.0.0.0) at aa:bb:cc:dd:ee:ff [ether] on eth0
? (255.255.255.255) at 11:22:33:44:55:66 [ether] on eth0
? (10.0.0.1) at 22:33:44:55:66:77 [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].ip).toBe('10.0.0.1');
  });

  it('normalizes MAC addresses (zero-pads and lowercases)', () => {
    const input = `? (192.168.1.1) at A:B:C:D:E:F [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
    expect(result[0].mac).toBe('0a:0b:0c:0d:0e:0f');
  });

  it('returns empty array for empty input', () => {
    expect(parseArp('')).toEqual([]);
    expect(parseArp('\n\n')).toEqual([]);
  });

  it('skips lines without both IP and MAC', () => {
    const input = `some random text
192.168.1.1
aa:bb:cc:dd:ee:ff
? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0`;

    const result = parseArp(input);
    expect(result).toHaveLength(1);
  });

  it('extracts interface name from "on" keyword', () => {
    const input = `? (10.0.0.1) at aa:bb:cc:dd:ee:ff [ether] on br-lan`;
    const result = parseArp(input);
    expect(result[0].interface).toBe('br-lan');
  });
});
