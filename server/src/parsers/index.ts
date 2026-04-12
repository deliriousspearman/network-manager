import { parsePs, type PsRow } from './ps.js';
import { parseNetstat, type NetstatRow } from './netstat.js';
import { parseLast, type LastRow } from './last.js';
import { parseIpAddr, type IpAddrRow } from './ipAddr.js';
import { parseMount, type MountRow } from './mount.js';
import { parseIpRoute, type IpRouteRow } from './ipRoute.js';
import { parseSystemctlStatus, type SystemctlServiceRow } from './systemctlStatus.js';
import { parseArp, type ArpHost } from './arp.js';

// Discriminated union keyed on command_type. Keeps the parser registry,
// insert switch, and ParsedRow alias all tied to one table of record so
// adding a new parser is a single-line change in three places.
export interface CommandTypeToRow {
  ps: PsRow;
  netstat: NetstatRow;
  last: LastRow;
  ip_a: IpAddrRow;
  mount: MountRow;
  ip_r: IpRouteRow;
  systemctl_status: SystemctlServiceRow;
  arp: ArpHost;
}

export type CommandType = keyof CommandTypeToRow;
export type ParsedRow = CommandTypeToRow[CommandType];

export const parsers: { [K in CommandType]: (raw: string) => CommandTypeToRow[K][] } = {
  ps: parsePs,
  netstat: parseNetstat,
  last: parseLast,
  ip_a: parseIpAddr,
  mount: parseMount,
  ip_r: parseIpRoute,
  systemctl_status: parseSystemctlStatus,
  arp: parseArp,
};

export function isCommandType(s: string): s is CommandType {
  return s in parsers;
}
