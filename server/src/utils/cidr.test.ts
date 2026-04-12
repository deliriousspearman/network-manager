import { describe, it, expect } from 'vitest';
import { isValidCidr } from './cidr.js';

describe('isValidCidr', () => {
  // Valid IPv4
  it('accepts valid IPv4 CIDR', () => {
    expect(isValidCidr('192.168.1.0/24')).toBe(true);
    expect(isValidCidr('10.0.0.0/8')).toBe(true);
    expect(isValidCidr('172.16.0.0/12')).toBe(true);
  });

  it('accepts /0 and /32 for IPv4', () => {
    expect(isValidCidr('0.0.0.0/0')).toBe(true);
    expect(isValidCidr('192.168.1.1/32')).toBe(true);
  });

  // Valid IPv6
  it('accepts valid IPv6 CIDR', () => {
    expect(isValidCidr('2001:db8::/32')).toBe(true);
    expect(isValidCidr('fe80::/10')).toBe(true);
    expect(isValidCidr('::1/128')).toBe(true);
  });

  it('accepts /0 and /128 for IPv6', () => {
    expect(isValidCidr('::/0')).toBe(true);
    expect(isValidCidr('::1/128')).toBe(true);
  });

  // Invalid inputs
  it('rejects missing prefix', () => {
    expect(isValidCidr('192.168.1.0')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidCidr('')).toBe(false);
  });

  it('rejects prefix > 32 for IPv4', () => {
    expect(isValidCidr('192.168.1.0/33')).toBe(false);
  });

  it('rejects prefix > 128 for IPv6', () => {
    expect(isValidCidr('2001:db8::/129')).toBe(false);
  });

  it('rejects invalid IPv4 address', () => {
    expect(isValidCidr('999.999.999.999/24')).toBe(false);
  });

  it('rejects invalid IPv6 address', () => {
    expect(isValidCidr('gggg::1/64')).toBe(false);
  });

  it('rejects non-numeric prefix', () => {
    expect(isValidCidr('192.168.1.0/abc')).toBe(false);
  });

  it('rejects negative prefix', () => {
    expect(isValidCidr('192.168.1.0/-1')).toBe(false);
  });

  it('rejects prefix with leading zeros that exceed 3 digits', () => {
    expect(isValidCidr('192.168.1.0/0024')).toBe(false);
  });

  it('rejects just a slash', () => {
    expect(isValidCidr('/24')).toBe(false);
  });

  it('rejects random text', () => {
    expect(isValidCidr('not-a-cidr')).toBe(false);
  });
});
