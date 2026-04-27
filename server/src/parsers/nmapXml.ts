import { XMLParser } from 'fast-xml-parser';

export interface NmapAnalyzedPort {
  port: number;
  protocol: 'tcp' | 'udp';
  state: string;
  service?: string;
  version?: string;
}

export interface NmapAnalyzedHost {
  ip: string;
  macs: string[];
  hostnames: string[];
  osGuess: string | null;
  ports: NmapAnalyzedPort[];
}

export interface NmapParseResult {
  hosts: NmapAnalyzedHost[];
  scanInfo: { startedAt?: string; args?: string };
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

export function parseNmapXml(raw: string): NmapParseResult {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
    allowBooleanAttributes: true,
  });

  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(raw) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Invalid XML: ${(e as Error).message}`);
  }

  const nmaprun = doc.nmaprun as Record<string, unknown> | undefined;
  if (!nmaprun) throw new Error('Not an nmap XML file (missing <nmaprun> root)');

  const scanInfo: NmapParseResult['scanInfo'] = {};
  if (typeof nmaprun.startstr === 'string') scanInfo.startedAt = nmaprun.startstr;
  if (typeof nmaprun.args === 'string') scanInfo.args = nmaprun.args;

  const hostNodes = toArray<Record<string, unknown>>(nmaprun.host as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const hosts: NmapAnalyzedHost[] = [];

  for (const host of hostNodes) {
    const status = host.status as { state?: string } | undefined;
    if (status?.state !== 'up') continue;

    const addresses = toArray<Record<string, unknown>>(host.address as Record<string, unknown> | Record<string, unknown>[] | undefined);
    let ip: string | null = null;
    const macs: string[] = [];
    for (const addr of addresses) {
      const addrtype = addr.addrtype as string | undefined;
      const value = addr.addr as string | undefined;
      if (!value) continue;
      if (addrtype === 'ipv4' && !ip) ip = value;
      else if (addrtype === 'mac') macs.push(value);
    }
    if (!ip) continue;

    const hostnamesContainer = host.hostnames as { hostname?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
    const hostnameNodes = toArray(hostnamesContainer?.hostname);
    const hostnames = hostnameNodes
      .map(h => h.name as string | undefined)
      .filter((n): n is string => !!n);

    const osContainer = host.os as { osmatch?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
    const osmatch = toArray(osContainer?.osmatch)[0];
    const osGuess = (osmatch?.name as string | undefined) ?? null;

    const portsContainer = host.ports as { port?: Record<string, unknown> | Record<string, unknown>[] } | undefined;
    const portNodes = toArray(portsContainer?.port);
    const ports: NmapAnalyzedPort[] = [];
    for (const p of portNodes) {
      const state = (p.state as { state?: string } | undefined)?.state;
      if (state !== 'open') continue;
      const portNumRaw = p.portid;
      const portNum = typeof portNumRaw === 'number' ? portNumRaw : parseInt(String(portNumRaw), 10);
      if (!Number.isFinite(portNum)) continue;
      const protocol = p.protocol as string | undefined;
      if (protocol !== 'tcp' && protocol !== 'udp') continue;
      const service = p.service as { name?: string; product?: string; version?: string } | undefined;
      const versionBits = [service?.product, service?.version].filter(Boolean);
      ports.push({
        port: portNum,
        protocol,
        state,
        service: service?.name,
        version: versionBits.length > 0 ? versionBits.join(' ') : undefined,
      });
    }

    hosts.push({ ip, macs, hostnames, osGuess, ports });
  }

  return { hosts, scanInfo };
}
