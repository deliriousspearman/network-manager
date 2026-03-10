export interface IpRouteRow {
  destination: string;
  gateway: string;
  device: string;
  protocol: string;
  scope: string;
  metric: string;
}

export function parseIpRoute(raw: string): IpRouteRow[] {
  const lines = raw.trim().split('\n');
  const rows: IpRouteRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split(/\s+/);
    const destination = parts[0] || '';

    const getVal = (key: string): string => {
      const idx = parts.indexOf(key);
      return idx !== -1 && idx + 1 < parts.length ? parts[idx + 1] : '';
    };

    rows.push({
      destination,
      gateway: getVal('via'),
      device: getVal('dev'),
      protocol: getVal('proto'),
      scope: getVal('scope'),
      metric: getVal('metric'),
    });
  }

  return rows;
}
