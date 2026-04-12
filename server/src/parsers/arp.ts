/** Parser for `arp -avn` output — extracts IP/MAC pairs. */

export interface ArpHost {
  ip: string;
  mac: string;
  interface?: string;
}

// arp -avn formats:
//   ? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0
//   ? (10.0.0.1) at <incomplete> on wlan0
// Also handles arp -a (BSD/macOS):
//   ? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]
// And plain arp (Linux table format):
//   Address          HWtype  HWaddress           Flags Mask  Iface
//   192.168.1.1      ether   aa:bb:cc:dd:ee:ff   C           eth0

const MAC_RE = /([0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2}/;
const IP_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;

function normalizeMac(raw: string): string {
  return raw
    .toLowerCase()
    .split(/[:-]/)
    .map(p => p.padStart(2, '0'))
    .join(':');
}

function isValidIp(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p, 10);
    return n >= 0 && n <= 255;
  });
}

function isFilteredIp(ip: string): boolean {
  if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;
  const first = parseInt(ip.split('.')[0], 10);
  if (first >= 224 && first <= 239) return true; // multicast
  if (first === 169 && ip.startsWith('169.254.')) return true; // link-local
  return false;
}

export function parseArp(text: string): ArpHost[] {
  const hosts: ArpHost[] = [];
  const seen = new Set<string>(); // dedup by IP

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Address') || trimmed.startsWith('---')) continue;

    // Skip incomplete entries
    if (trimmed.includes('<incomplete>')) continue;

    const ipMatch = trimmed.match(IP_RE);
    const macMatch = trimmed.match(MAC_RE);

    if (!ipMatch || !macMatch) continue;

    const ip = ipMatch[1];
    const mac = normalizeMac(macMatch[0]);

    if (!isValidIp(ip) || isFilteredIp(ip)) continue;
    if (mac === 'ff:ff:ff:ff:ff:ff' || mac === '00:00:00:00:00:00') continue;
    if (seen.has(ip)) continue;
    seen.add(ip);

    // Try to extract interface name (after "on " in verbose format, or last column in table)
    const onMatch = trimmed.match(/\bon\s+(\S+)/);
    const iface = onMatch ? onMatch[1] : undefined;

    hosts.push({ ip, mac, interface: iface });
  }

  return hosts;
}
