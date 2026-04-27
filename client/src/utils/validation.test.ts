import { describe, it, expect } from 'vitest';
import { isValidIpv4, isValidIpv6, isValidIp, isValidCidr } from './validation';

describe('isValidIpv4', () => {
  it.each([
    '0.0.0.0',
    '127.0.0.1',
    '192.168.1.1',
    '255.255.255.255',
    '10.0.0.1',
  ])('accepts %s', (ip) => {
    expect(isValidIpv4(ip)).toBe(true);
  });

  it.each([
    '',
    '1.2.3',
    '1.2.3.4.5',
    '256.0.0.1',
    '999.1.1.1',
    '1.1.1.-1',
    '1.1.1.a',
    'abc.def.ghi.jkl',
  ])('rejects %s', (ip) => {
    expect(isValidIpv4(ip)).toBe(false);
  });
});

describe('isValidIpv6', () => {
  it.each([
    '::',
    '::1',
    '2001:db8::',
    '2001:db8::1',
    '2001:0db8:0000:0000:0000:0000:0000:0001',
    'fe80::1',
    'fe80::a00:27ff:fe4e:66a1',
  ])('accepts %s', (ip) => {
    expect(isValidIpv6(ip)).toBe(true);
  });

  it.each([
    '',
    '1.2.3.4',
    '2001::1::2',
    'xyzq::',
    '12345::',
  ])('rejects %s', (ip) => {
    expect(isValidIpv6(ip)).toBe(false);
  });
});

describe('isValidIp', () => {
  it('accepts v4 and v6', () => {
    expect(isValidIp('192.168.1.1')).toBe(true);
    expect(isValidIp('::1')).toBe(true);
  });
  it('rejects garbage', () => {
    expect(isValidIp('hello')).toBe(false);
    expect(isValidIp('')).toBe(false);
  });
});

describe('isValidCidr', () => {
  it.each([
    ['192.168.1.0/24', true],
    ['10.0.0.0/8', true],
    ['0.0.0.0/0', true],
    ['255.255.255.255/32', true],
    ['2001:db8::/32', true],
    ['::/0', true],
    ['fe80::/10', true],
  ] as const)('accepts %s', (cidr, expected) => {
    expect(isValidCidr(cidr)).toBe(expected);
  });

  it.each([
    '192.168.1.0',
    '192.168.1.0/',
    '192.168.1.0/33',
    '192.168.1.0/-1',
    '999.0.0.0/24',
    '2001:db8::/129',
    'invalid/24',
    '',
  ])('rejects %s', (cidr) => {
    expect(isValidCidr(cidr)).toBe(false);
  });
});
