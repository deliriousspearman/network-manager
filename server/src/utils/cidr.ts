import { isIP } from 'net';

/** Validate a CIDR notation string (IPv4 or IPv6). */
export function isValidCidr(cidr: string): boolean {
  const slashIdx = cidr.lastIndexOf('/');
  if (slashIdx === -1) return false;
  const ip = cidr.slice(0, slashIdx);
  const prefixStr = cidr.slice(slashIdx + 1);
  if (!/^\d{1,3}$/.test(prefixStr)) return false;
  const prefix = Number(prefixStr);
  const ipVersion = isIP(ip); // 0 = invalid, 4 = IPv4, 6 = IPv6
  if (ipVersion === 4) return prefix >= 0 && prefix <= 32;
  if (ipVersion === 6) return prefix >= 0 && prefix <= 128;
  return false;
}
