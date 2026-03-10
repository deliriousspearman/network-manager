export interface MountRow {
  device: string;
  mount_point: string;
  fs_type: string;
  options: string;
}

export function parseMount(raw: string): MountRow[] {
  const lines = raw.trim().split('\n');
  const rows: MountRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: device on mount_point type fs_type (options)
    const match = trimmed.match(/^(\S+)\s+on\s+(\S+)\s+type\s+(\S+)\s+\((.+)\)$/);
    if (match) {
      rows.push({
        device: match[1],
        mount_point: match[2],
        fs_type: match[3],
        options: match[4],
      });
    }
  }

  return rows;
}
