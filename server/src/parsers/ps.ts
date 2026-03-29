export interface PsRow {
  pid: number;
  user: string;
  cpu_percent: number;
  mem_percent: number;
  command: string;
}

export function parsePs(raw: string): PsRow[] {
  const lines = raw.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0];
  // Find column positions from the header
  const _pidIdx = header.indexOf('PID');
  const _cpuIdx = header.indexOf('%CPU');
  const _memIdx = header.indexOf('%MEM');
  const commandIdx = header.indexOf('COMMAND') !== -1 ? header.indexOf('COMMAND') : header.indexOf('CMD');

  if (commandIdx === -1) return [];

  const rows: PsRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parts = line.split(/\s+/);
    if (parts.length < 4) continue;

    // ps aux columns: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
    const user = parts[0];
    const pid = parseInt(parts[1], 10);
    const cpuPercent = parseFloat(parts[2]);
    const memPercent = parseFloat(parts[3]);
    // COMMAND is everything from index 10 onwards (or from commandIdx position)
    const commandPart = line.substring(commandIdx).trim() || parts.slice(10).join(' ');

    if (isNaN(pid)) continue;

    rows.push({
      pid,
      user,
      cpu_percent: isNaN(cpuPercent) ? 0 : cpuPercent,
      mem_percent: isNaN(memPercent) ? 0 : memPercent,
      command: commandPart || parts[parts.length - 1],
    });
  }

  return rows;
}
