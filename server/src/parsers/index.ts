import { parsePs, type PsRow } from './ps.js';
import { parseNetstat, type NetstatRow } from './netstat.js';
import { parseLast, type LastRow } from './last.js';
import { parseIpAddr, type IpAddrRow } from './ipAddr.js';
import { parseMount, type MountRow } from './mount.js';
import { parseIpRoute, type IpRouteRow } from './ipRoute.js';
import { parseSystemctlStatus, type SystemctlServiceRow } from './systemctlStatus.js';

export type ParsedRow = PsRow | NetstatRow | LastRow | IpAddrRow | MountRow | IpRouteRow | SystemctlServiceRow;

export const parsers: Record<string, (raw: string) => ParsedRow[]> = {
  ps: parsePs,
  netstat: parseNetstat,
  last: parseLast,
  ip_a: parseIpAddr,
  mount: parseMount,
  ip_r: parseIpRoute,
  systemctl_status: parseSystemctlStatus,
};
