export interface NetstatRow {
  protocol: string;
  local_addr: string;
  foreign_addr: string;
  state: string;
  pid_program: string;
}

export function parseNetstat(raw: string): NetstatRow[] {
  const lines = raw.trim().split('\n');
  const rows: NetstatRow[] = [];

  // Detect format: ss uses "Netid", netstat uses "Proto"
  const isSs = lines.some(l => l.includes('Netid'));

  for (const line of lines) {
    const trimmed = line.trim();
    // Skip headers and empty lines
    if (!trimmed || trimmed.startsWith('Proto') || trimmed.startsWith('Netid') ||
        trimmed.startsWith('Active') || trimmed.startsWith('State')) continue;

    const parts = trimmed.split(/\s+/);

    if (isSs) {
      // ss -tulpn: Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
      if (parts.length < 5) continue;
      const protocol = parts[0];
      const state = parts[1];
      const localAddr = parts[4];
      const foreignAddr = parts.length > 5 ? parts[5] : '*:*';
      const pidProgram = parts.length > 6 ? parts.slice(6).join(' ') : '';

      if (['tcp', 'udp', 'tcp6', 'udp6'].includes(protocol.toLowerCase())) {
        rows.push({ protocol, local_addr: localAddr, foreign_addr: foreignAddr, state, pid_program: pidProgram });
      }
    } else {
      // netstat -tulpn: Proto Recv-Q Send-Q Local Address Foreign Address State PID/Program
      if (parts.length < 6) continue;
      const protocol = parts[0];
      if (!['tcp', 'udp', 'tcp6', 'udp6'].includes(protocol.toLowerCase())) continue;

      const localAddr = parts[3];
      const foreignAddr = parts[4];
      const state = parts[5] || '';
      const pidProgram = parts.length > 6 ? parts[6] : '';

      rows.push({ protocol, local_addr: localAddr, foreign_addr: foreignAddr, state, pid_program: pidProgram });
    }
  }

  return rows;
}
