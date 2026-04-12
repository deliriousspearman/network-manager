// Convert a CIDR prefix length (e.g. 24) into a dotted-quad netmask string
// (e.g. 255.255.255.0). Returns null for out-of-range or non-finite input.
// Shared by router config parsers (vyatta, pfsense, ...).
export function cidrToMask(prefix: number): string | null {
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.');
}
