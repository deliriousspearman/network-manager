import { XMLParser } from 'fast-xml-parser';
import type {
  ParsedRouterConfig,
  RouterInterfaceRow,
  RouterAclRow,
} from './types.js';
import { cidrToMask } from './cidr.js';

// Parses pfSense config.xml backups
// (Diagnostics → Backup & Restore → Download configuration).
//
// Strategy: parse the XML once via fast-xml-parser, then walk the well-known
// paths under <pfsense>. Each section walker is wrapped in its own try/catch
// so a damaged section doesn't lose neighbouring rows. The XML parse itself
// is the only place where a throw escapes to the route layer.
export function parsePfsenseConfig(raw: string): ParsedRouterConfig {
  return parsePfsenseFamilyXml(raw, 'pfsense', 'pfSense');
}

// Shared core for pfSense and its derivatives (OPNsense). Both fork from
// m0n0wall and use the same config.xml schema; only the root element name
// differs (`<pfsense>` vs `<opnsense>`). Exported so opnsense.ts can wrap it.
export function parsePfsenseFamilyXml(
  raw: string,
  rootTag: 'pfsense' | 'opnsense',
  vendorLabel: string
): ParsedRouterConfig {
  const result: ParsedRouterConfig = {
    metadata: {
      hostname: null,
      os_version: null,
      model: null,
      domain: null,
      timezone: null,
      ntp_servers: [],
    },
    interfaces: [],
    vlans: [],
    static_routes: [],
    acls: [],
    nat_rules: [],
    dhcp_pools: [],
    users: [],
  };

  if (!raw || !raw.trim()) {
    throw new Error(`Invalid ${vendorLabel} XML: empty input`);
  }

  let parsed: any;
  try {
    const parser = new XMLParser({
      ignoreAttributes: true,
      // Keep everything as strings; coerce explicitly. This also stops the
      // parser from mangling values like bcrypt hashes that look numeric-ish.
      parseTagValue: false,
      trimValues: true,
      // Force array shape on tags that are naturally repeated. Without this,
      // fast-xml-parser collapses single-element lists to a scalar/object and
      // breaks our walking code.
      isArray: (name) => REPEATED_TAGS.has(name),
    });
    parsed = parser.parse(raw);
  } catch (err) {
    throw new Error(
      `Invalid ${vendorLabel} XML: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const root = parsed?.[rootTag];
  if (root === undefined) {
    throw new Error(
      `Invalid ${vendorLabel} XML: missing <${rootTag}> root element`
    );
  }
  // <pfsense/> / <opnsense/> with no children parses as an empty string.
  // Return the empty template rather than throwing.
  if (typeof root !== 'object' || root === null) {
    return result;
  }

  // pfSense's <version> is the config schema version, not the OS version, but
  // it's the closest thing in config.xml — better than nothing.
  if (typeof root.version === 'string' && root.version) {
    result.metadata.os_version = root.version;
  }

  try {
    parseSystem(root.system, result);
  } catch {
    // section error – preserve other sections
  }

  // Build a side-table of gateway-name → IP for static route name resolution.
  const gatewaysByName = new Map<string, string>();
  try {
    for (const item of asArray(root.gateways?.gateway_item)) {
      const name = pickStr(item, 'name');
      const ip = pickStr(item, 'gateway');
      if (name && ip) gatewaysByName.set(name, ip);
    }
  } catch {
    // ignore – static routes will fall back to literal gateway names
  }

  const ifacesByKey = new Map<string, RouterInterfaceRow>();
  try {
    parseInterfaces(root.interfaces, result, ifacesByKey);
  } catch {
    // ignore
  }

  try {
    parseVlans(root.vlans, result);
  } catch {
    // ignore
  }

  try {
    parseStaticRoutes(root.staticroutes, result, gatewaysByName);
  } catch {
    // ignore
  }

  try {
    parseFilterRules(root.filter, result);
  } catch {
    // ignore
  }

  try {
    parseNatRules(root.nat, result);
  } catch {
    // ignore
  }

  try {
    parseDhcp(root.dhcpd, result, ifacesByKey);
  } catch {
    // ignore
  }

  return result;
}

// Tags that should always be arrays even when only one element is present.
// fast-xml-parser would otherwise collapse a single-child list into a scalar.
const REPEATED_TAGS = new Set([
  'user',
  'vlan',
  'route',
  'rule',
  'staticmap',
  'dnsserver',
  'winsserver',
  'gateway_item',
]);

function parseSystem(system: any, out: ParsedRouterConfig): void {
  if (!system || typeof system !== 'object') return;
  out.metadata.hostname = pickStr(system, 'hostname');
  out.metadata.domain = pickStr(system, 'domain');
  out.metadata.timezone = pickStr(system, 'timezone');
  const ntp = pickStr(system, 'timeservers');
  if (ntp) {
    out.metadata.ntp_servers = ntp.split(/\s+/).filter(Boolean);
  }
  for (const u of asArray(system.user)) {
    try {
      const username = pickStr(u, 'name');
      if (!username) continue;
      const scope = pickStr(u, 'scope');
      let privilege: number | null = null;
      // pfSense scopes: `system` for built-in admin, `user` for everyone else.
      if (scope === 'system' || scope === 'admin') privilege = 15;
      else if (scope === 'user') privilege = 5;
      // Never copy the bcrypt hash itself into auth_method — record only that
      // a hash is present.
      const hasHash = u['bcrypt-hash'] !== undefined || u.password !== undefined;
      out.users.push({
        username,
        privilege,
        auth_method: hasHash ? 'hash' : null,
      });
    } catch {
      // skip malformed user
    }
  }
}

function parseInterfaces(
  interfaces: any,
  out: ParsedRouterConfig,
  ifacesByKey: Map<string, RouterInterfaceRow>
): void {
  if (!interfaces || typeof interfaces !== 'object') return;
  for (const key of Object.keys(interfaces)) {
    try {
      const iface = interfaces[key];
      if (!iface || typeof iface !== 'object') continue;
      const descr = pickStr(iface, 'descr') ?? pickStr(iface, 'if');
      const ipaddr = pickStr(iface, 'ipaddr');
      const subnetBits = pickStr(iface, 'subnet');
      const subnet = subnetBits ? cidrToMask(Number(subnetBits)) : null;
      // pfSense marks interfaces enabled with an empty <enable/> tag.
      const enabled = iface.enable !== undefined;
      const row: RouterInterfaceRow = {
        interface_name: key,
        description: descr,
        // Skip literals like 'dhcp' / 'pppoe' which aren't real IPs.
        ip_address: ipaddr && /^\d+\.\d+\.\d+\.\d+$/.test(ipaddr) ? ipaddr : null,
        subnet_mask: subnet,
        vlan: null,
        admin_status: enabled ? 'up' : 'down',
        mac_address: null,
      };
      out.interfaces.push(row);
      ifacesByKey.set(key, row);
    } catch {
      // skip malformed interface
    }
  }
}

function parseVlans(vlans: any, out: ParsedRouterConfig): void {
  if (!vlans || typeof vlans !== 'object') return;
  for (const v of asArray(vlans.vlan)) {
    try {
      const tagStr = pickStr(v, 'tag');
      const tag = tagStr ? Number(tagStr) : NaN;
      if (!Number.isFinite(tag)) continue;
      out.vlans.push({ vlan_id: tag, name: pickStr(v, 'descr') });
    } catch {
      // skip malformed vlan
    }
  }
}

function parseStaticRoutes(
  staticroutes: any,
  out: ParsedRouterConfig,
  gatewaysByName: Map<string, string>
): void {
  if (!staticroutes || typeof staticroutes !== 'object') return;
  for (const r of asArray(staticroutes.route)) {
    try {
      const network = pickStr(r, 'network');
      if (!network) continue;
      const [destination, prefix] = network.split('/');
      const mask = prefix ? cidrToMask(Number(prefix)) : null;
      // pfSense static routes reference a gateway by *name*; resolve it
      // against the <gateways> table, falling back to the literal name.
      const gwRef = pickStr(r, 'gateway');
      const next_hop = gwRef ? gatewaysByName.get(gwRef) ?? gwRef : null;
      out.static_routes.push({
        destination,
        mask,
        next_hop,
        metric: null,
        admin_distance: null,
      });
    } catch {
      // skip malformed route
    }
  }
}

function parseFilterRules(filter: any, out: ParsedRouterConfig): void {
  if (!filter || typeof filter !== 'object') return;
  let seq = 1;
  for (const r of asArray(filter.rule)) {
    try {
      const action = pickStr(r, 'type') ?? 'pass';
      const acl_name = pickStr(r, 'interface') ?? 'unknown';
      const row: RouterAclRow = {
        acl_name,
        sequence: seq++,
        action,
        protocol: pickStr(r, 'protocol'),
        src: extractEndpointAddr(r.source),
        src_port: extractEndpointPort(r.source),
        dst: extractEndpointAddr(r.destination),
        dst_port: extractEndpointPort(r.destination),
      };
      out.acls.push(row);
    } catch {
      // skip malformed rule
    }
  }
}

// pfSense represents source/destination as a node containing one of:
//   <any/>, <address>1.2.3.4</address>, or <network>192.168.0.0/24</network>
function extractEndpointAddr(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  if (node.any !== undefined) return 'any';
  return pickStr(node, 'address') ?? pickStr(node, 'network');
}

function extractEndpointPort(node: any): string | null {
  if (!node || typeof node !== 'object') return null;
  return pickStr(node, 'port');
}

function parseNatRules(nat: any, out: ParsedRouterConfig): void {
  if (!nat || typeof nat !== 'object') return;
  // Port forwards (destination NAT) live directly under <nat><rule>.
  for (const r of asArray(nat.rule)) {
    try {
      out.nat_rules.push({
        nat_type: 'destination',
        protocol: pickStr(r, 'protocol'),
        outside_src: extractEndpointAddr(r.destination),
        outside_port: extractEndpointPort(r.destination),
        inside_src: pickStr(r, 'target'),
        inside_port: pickStr(r, 'local-port'),
      });
    } catch {
      // skip malformed rule
    }
  }
  // Outbound (source NAT) lives under <nat><outbound><rule>.
  if (nat.outbound && typeof nat.outbound === 'object') {
    for (const r of asArray(nat.outbound.rule)) {
      try {
        out.nat_rules.push({
          nat_type: 'source',
          protocol: pickStr(r, 'protocol'),
          inside_src: extractEndpointAddr(r.source),
          inside_port: null,
          outside_src: pickStr(r, 'target') ?? pickStr(r, 'interface'),
          outside_port: null,
        });
      } catch {
        // skip malformed outbound rule
      }
    }
  }
}

function parseDhcp(
  dhcpd: any,
  out: ParsedRouterConfig,
  ifacesByKey: Map<string, RouterInterfaceRow>
): void {
  if (!dhcpd || typeof dhcpd !== 'object') return;
  // Each child of <dhcpd> is keyed by interface name (lan, opt1, …).
  for (const key of Object.keys(dhcpd)) {
    try {
      const pool = dhcpd[key];
      if (!pool || typeof pool !== 'object') continue;
      const iface = ifacesByKey.get(key);
      const dnsservers: string[] = [];
      for (const d of asArray(pool.dnsserver)) {
        if (typeof d === 'string' && d) dnsservers.push(d);
      }
      out.dhcp_pools.push({
        pool_name: key,
        // pfSense doesn't repeat the network in <dhcpd>; pull it from the
        // matching interface row.
        network: iface?.ip_address ?? null,
        netmask: iface?.subnet_mask ?? null,
        default_router: pickStr(pool, 'gateway') ?? iface?.ip_address ?? null,
        dns_servers: dnsservers,
        lease_time: pickStr(pool, 'defaultleasetime'),
        domain_name: pickStr(pool, 'domain'),
      });
    } catch {
      // skip malformed pool
    }
  }
}

// ----- helpers -----

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function pickStr(obj: any, key: string): string | null {
  if (!obj || typeof obj !== 'object') return null;
  const val = obj[key];
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed || null;
  }
  if (typeof val === 'number') return String(val);
  return null;
}
