/** Validate an IPv4 address (e.g. 192.168.1.1) */
export function isValidIpv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return /^\d{1,3}$/.test(p) && n >= 0 && n <= 255;
  });
}

/** Validate an IPv6 address */
export function isValidIpv6(ip: string): boolean {
  // Must contain at least one colon
  if (!ip.includes(':')) return false;
  // Cannot have more than one ::
  const doubleColonCount = (ip.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  // Split into groups; :: expands to fill missing groups
  const groups = ip.split(':');
  // With :: present, groups can be 3-8; without, must be exactly 8
  if (doubleColonCount === 0 && groups.length !== 8) return false;
  if (doubleColonCount === 1 && groups.length > 8) return false;
  // Each group must be 0-4 hex digits (empty allowed for :: expansion)
  return groups.every(g => /^[0-9a-fA-F]{0,4}$/.test(g));
}

/** Validate an IP address (v4 or v6) */
export function isValidIp(ip: string): boolean {
  return isValidIpv4(ip) || isValidIpv6(ip);
}

/** Validate CIDR notation (e.g. 192.168.1.0/24 or 10.0.0.0/8) */
export function isValidCidr(cidr: string): boolean {
  const parts = cidr.split('/');
  if (parts.length !== 2) return false;
  const [ip, prefix] = parts;
  const prefixNum = Number(prefix);
  if (isValidIpv4(ip)) {
    return /^\d{1,2}$/.test(prefix) && prefixNum >= 0 && prefixNum <= 32;
  }
  if (isValidIpv6(ip)) {
    return /^\d{1,3}$/.test(prefix) && prefixNum >= 0 && prefixNum <= 128;
  }
  return false;
}
