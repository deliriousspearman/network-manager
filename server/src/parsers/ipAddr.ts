export interface IpAddrRow {
  interface_name: string;
  state: string;
  ip_addresses: string; // JSON array
  mac_address: string;
}

export function parseIpAddr(raw: string): IpAddrRow[] {
  // Split on lines starting with a number (each interface block)
  const blocks = raw.split(/(?=^\d+:\s)/m).filter(b => b.trim());
  const rows: IpAddrRow[] = [];

  for (const block of blocks) {
    const lines = block.split('\n');
    const firstLine = lines[0];

    const nameMatch = firstLine.match(/^\d+:\s+(\S+?):/);
    const stateMatch = firstLine.match(/state\s+(\S+)/);

    const macLine = lines.find(l => l.includes('link/ether'));
    const macMatch = macLine?.match(/link\/ether\s+(\S+)/);

    const ips: string[] = [];
    for (const line of lines) {
      const ipMatch = line.match(/^\s+inet6?\s+(\S+)/);
      if (ipMatch) {
        ips.push(ipMatch[1]);
      }
    }

    rows.push({
      interface_name: nameMatch?.[1] ?? 'unknown',
      state: stateMatch?.[1] ?? (firstLine.includes('LOOPBACK') ? 'LOOPBACK' : 'UNKNOWN'),
      ip_addresses: JSON.stringify(ips),
      mac_address: macMatch?.[1] ?? '',
    });
  }

  return rows;
}
