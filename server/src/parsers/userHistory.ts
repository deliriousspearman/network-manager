export interface UserHistoryRow {
  line_no: number;
  timestamp: string | null;
  command: string;
}

const ZSH_EXT = /^:\s*(\d+):\d+;(.*)$/;
const BASH_TS = /^#(\d{9,11})$/;

export function parseUserHistory(raw: string): UserHistoryRow[] {
  const rows: UserHistoryRow[] = [];
  const lines = raw.split(/\r?\n/);
  let pendingTs: string | null = null;
  let lineNo = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    lineNo++;

    const zsh = line.match(ZSH_EXT);
    if (zsh) {
      const ts = new Date(parseInt(zsh[1], 10) * 1000).toISOString();
      rows.push({ line_no: lineNo, timestamp: ts, command: zsh[2] });
      pendingTs = null;
      continue;
    }

    const bashTs = line.match(BASH_TS);
    if (bashTs) {
      pendingTs = new Date(parseInt(bashTs[1], 10) * 1000).toISOString();
      continue;
    }

    rows.push({ line_no: lineNo, timestamp: pendingTs, command: line });
    pendingTs = null;
  }
  return rows;
}
