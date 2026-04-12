import type {
  ParsedRouterConfig,
  RouterInterfaceRow,
  RouterVlanRow,
  RouterStaticRouteRow,
  RouterAclRow,
  RouterNatRuleRow,
  RouterDhcpPoolRow,
  RouterUserRow,
  RouterConfigMetadata,
} from './types.js';
import { cidrToMask } from './cidr.js';

// Parses Palo Alto Networks PAN-OS configurations in `set` format
// (`set cli config-output-format set` then `show config running`).
//
// Strategy: tokenise each `set ...` line into a path of segments (respecting
// double-quoted values, since PAN-OS rule names commonly contain spaces),
// optionally strip a leading `vsys vsysN` prefix, then dispatch on the path.
// State is accumulated in keyed Maps so multi-line entities (e.g. a security
// rule whose `action`, `source`, `destination` are separate set commands)
// merge into a single output row. Each line is wrapped in a try/catch so a
// single malformed line never aborts the whole parse.
//
// After the line walk, a post-pass resolves named address-object references
// in security/NAT rules to their CIDRs, and fills DHCP pool network/netmask
// from the matching interface row.
export function parsePaloAltoConfig(raw: string): ParsedRouterConfig {
  const lines = raw.split(/\r?\n/);

  const metadata: RouterConfigMetadata = {
    hostname: null,
    os_version: null,
    model: null,
    domain: null,
    timezone: null,
    ntp_servers: [],
  };
  const ifaceByName = new Map<string, RouterInterfaceRow>();
  const vlans = new Map<number, RouterVlanRow>();
  const routesByKey = new Map<string, RouterStaticRouteRow>();
  const aclsByKey = new Map<string, RouterAclRow>();
  let aclSeq = 0;
  const natByKey = new Map<string, RouterNatRuleRow>();
  const dhcpByKey = new Map<string, RouterDhcpPoolRow>();
  const usersByName = new Map<string, RouterUserRow>();
  // Side-table for post-pass resolution of named address objects.
  const addressObjects = new Map<string, string>();

  const getOrCreateIface = (name: string): RouterInterfaceRow => {
    let row = ifaceByName.get(name);
    if (!row) {
      row = {
        interface_name: name,
        description: null,
        ip_address: null,
        subnet_mask: null,
        vlan: null,
        admin_status: 'up',
        mac_address: null,
      };
      ifaceByName.set(name, row);
    }
    return row;
  };

  const getOrCreateAcl = (name: string): RouterAclRow => {
    let row = aclsByKey.get(name);
    if (!row) {
      row = {
        acl_name: name,
        sequence: ++aclSeq,
        action: 'allow',
        protocol: null,
        src: null,
        src_port: null,
        dst: null,
        dst_port: null,
      };
      aclsByKey.set(name, row);
    }
    return row;
  };

  const getOrCreateNat = (name: string): RouterNatRuleRow => {
    let row = natByKey.get(name);
    if (!row) {
      row = {
        nat_type: 'source',
        protocol: null,
        inside_src: null,
        inside_port: null,
        outside_src: null,
        outside_port: null,
      };
      natByKey.set(name, row);
    }
    return row;
  };

  const getOrCreateDhcp = (ifName: string): RouterDhcpPoolRow => {
    let row = dhcpByKey.get(ifName);
    if (!row) {
      row = {
        pool_name: ifName,
        network: null,
        netmask: null,
        default_router: null,
        dns_servers: [],
        lease_time: null,
        domain_name: null,
      };
      dhcpByKey.set(ifName, row);
    }
    return row;
  };

  const getOrCreateRoute = (vrName: string, routeName: string): RouterStaticRouteRow => {
    const key = `${vrName}/${routeName}`;
    let row = routesByKey.get(key);
    if (!row) {
      row = {
        destination: '',
        mask: null,
        next_hop: null,
        metric: null,
        admin_distance: null,
      };
      routesByKey.set(key, row);
    }
    return row;
  };

  const getOrCreateUser = (username: string): RouterUserRow => {
    let row = usersByName.get(username);
    if (!row) {
      row = { username, privilege: null, auth_method: null };
      usersByName.set(username, row);
    }
    return row;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) continue;

    try {
      const tokens = tokenizeSetLine(line);
      if (tokens.length < 2) continue;
      // Accept both `set ...` and bare path lines.
      const start = tokens[0] === 'set' ? 1 : 0;
      let path = tokens.slice(start);
      if (path.length === 0) continue;

      // Strip a `vsys vsysN` prefix transparently so single- and multi-vsys
      // configs share the same dispatch.
      if (path[0] === 'vsys' && path[1] && /^vsys\d+$/.test(path[1])) {
        path = path.slice(2);
      }
      if (path.length === 0) continue;

      dispatch(path);
    } catch {
      // ignore individual line failures
    }
  }

  function dispatch(p: string[]): void {
    // ----- deviceconfig system ... -----
    if (p[0] === 'deviceconfig' && p[1] === 'system') {
      if (p[2] === 'hostname' && p[3]) {
        metadata.hostname = stripQuotes(p[3]);
        return;
      }
      if (p[2] === 'domain' && p[3]) {
        metadata.domain = stripQuotes(p[3]);
        return;
      }
      if (p[2] === 'timezone' && p[3]) {
        metadata.timezone = stripQuotes(p[3]);
        return;
      }
      if (
        p[2] === 'ntp-servers' &&
        (p[3] === 'primary-ntp' || p[3] === 'secondary-ntp') &&
        p[4] === 'ntp-server-address' &&
        p[5]
      ) {
        const server = stripQuotes(p[5]);
        if (!metadata.ntp_servers.includes(server)) {
          metadata.ntp_servers.push(server);
        }
        return;
      }
      return;
    }

    // ----- network interface ethernet IF ... -----
    if (p[0] === 'network' && p[1] === 'interface' && p[2] === 'ethernet' && p[3]) {
      const ifName = stripQuotes(p[3]);
      // Sub-interface: layer3 units IF.SUB ...
      if (p[4] === 'layer3' && p[5] === 'units' && p[6]) {
        const subName = stripQuotes(p[6]);
        const sub = getOrCreateIface(subName);
        applyInterfaceField(sub, p.slice(7), /*isSub*/ true);
        return;
      }
      const row = getOrCreateIface(ifName);
      // `network interface ethernet IF layer3 ip CIDR`
      if (p[4] === 'layer3' && p[5] === 'ip' && p[6]) {
        applyIpAddress(row, stripQuotes(p[6]));
        return;
      }
      if (p[4] === 'comment' && p[5]) {
        row.description = stripQuotes(p[5]);
        return;
      }
      if (p[4] === 'link-state' && p[5]) {
        const state = stripQuotes(p[5]).toLowerCase();
        if (state === 'down') row.admin_status = 'down';
        else if (state === 'up' || state === 'auto') row.admin_status = 'up';
        return;
      }
      return;
    }

    // ----- network virtual-router VR routing-table ip static-route NAME ... -----
    if (
      p[0] === 'network' &&
      p[1] === 'virtual-router' &&
      p[2] &&
      p[3] === 'routing-table' &&
      p[4] === 'ip' &&
      p[5] === 'static-route' &&
      p[6]
    ) {
      const vr = stripQuotes(p[2]);
      const routeName = stripQuotes(p[6]);
      const row = getOrCreateRoute(vr, routeName);
      const sub = p.slice(7);
      if (sub[0] === 'destination' && sub[1]) {
        const cidr = stripQuotes(sub[1]);
        const [destination, prefix] = cidr.split('/');
        row.destination = destination;
        row.mask = prefix ? cidrToMask(Number(prefix)) : null;
        return;
      }
      if (sub[0] === 'nexthop' && sub[1] === 'ip-address' && sub[2]) {
        row.next_hop = stripQuotes(sub[2]);
        return;
      }
      if (sub[0] === 'metric' && sub[1]) {
        const m = Number(stripQuotes(sub[1]));
        if (Number.isFinite(m)) row.metric = m;
        return;
      }
      if (sub[0] === 'admin-dist' && sub[1]) {
        const d = Number(stripQuotes(sub[1]));
        if (Number.isFinite(d)) row.admin_distance = d;
        return;
      }
      return;
    }

    // ----- network dhcp interface IF server ... -----
    if (
      p[0] === 'network' &&
      p[1] === 'dhcp' &&
      p[2] === 'interface' &&
      p[3] &&
      p[4] === 'server'
    ) {
      const ifName = stripQuotes(p[3]);
      const row = getOrCreateDhcp(ifName);
      const sub = p.slice(5);
      if (sub[0] === 'ip-pool' && sub[1]) {
        // Mark pool as present; the actual range string isn't a column on
        // RouterDhcpPoolRow, so we just ensure the row exists.
        return;
      }
      if (sub[0] === 'option') {
        if (sub[1] === 'default-gateway' && sub[2]) {
          row.default_router = stripQuotes(sub[2]);
          return;
        }
        if (sub[1] === 'subnet-mask' && sub[2]) {
          row.netmask = stripQuotes(sub[2]);
          return;
        }
        if (sub[1] === 'dns' && (sub[2] === 'primary' || sub[2] === 'secondary') && sub[3]) {
          const server = stripQuotes(sub[3]);
          if (!row.dns_servers.includes(server)) row.dns_servers.push(server);
          return;
        }
        if (sub[1] === 'lease' && sub[2] === 'timeout' && sub[3]) {
          row.lease_time = stripQuotes(sub[3]);
          return;
        }
        if (sub[1] === 'dns-suffix' && sub[2]) {
          row.domain_name = stripQuotes(sub[2]);
          return;
        }
      }
      return;
    }

    // ----- address NAME ip-netmask CIDR -----
    if (p[0] === 'address' && p[1] && p[2] === 'ip-netmask' && p[3]) {
      addressObjects.set(stripQuotes(p[1]), stripQuotes(p[3]));
      return;
    }

    // ----- rulebase security rules NAME ... -----
    if (p[0] === 'rulebase' && p[1] === 'security' && p[2] === 'rules' && p[3]) {
      const name = stripQuotes(p[3]);
      const row = getOrCreateAcl(name);
      const sub = p.slice(4);
      if (sub[0] === 'action' && sub[1]) {
        row.action = stripQuotes(sub[1]);
        return;
      }
      if (sub[0] === 'source' && sub[1]) {
        // PAN-OS may emit `source [ A B C ]` or `source X` — take the first value.
        row.src = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'destination' && sub[1]) {
        row.dst = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'from' && sub[1] && !row.src) {
        row.src = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'to' && sub[1] && !row.dst) {
        row.dst = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'service' && sub[1]) {
        row.dst_port = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'application' && sub[1]) {
        row.protocol = firstListValue(sub.slice(1));
        return;
      }
      return;
    }

    // ----- rulebase nat rules NAME ... -----
    if (p[0] === 'rulebase' && p[1] === 'nat' && p[2] === 'rules' && p[3]) {
      const name = stripQuotes(p[3]);
      const row = getOrCreateNat(name);
      const sub = p.slice(4);
      if (sub[0] === 'source' && sub[1]) {
        row.inside_src = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'destination' && sub[1]) {
        row.outside_src = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'service' && sub[1]) {
        row.protocol = firstListValue(sub.slice(1));
        return;
      }
      if (sub[0] === 'source-translation') {
        row.nat_type = 'source';
        // dynamic-ip-and-port interface-address interface IF
        // dynamic-ip-and-port interface-address ip X
        if (
          sub[1] === 'dynamic-ip-and-port' &&
          sub[2] === 'interface-address'
        ) {
          if (sub[3] === 'interface' && sub[4]) {
            row.outside_src = stripQuotes(sub[4]);
            return;
          }
          if (sub[3] === 'ip' && sub[4]) {
            row.outside_src = stripQuotes(sub[4]);
            return;
          }
        }
        // static-ip translated-address X
        if (sub[1] === 'static-ip' && sub[2] === 'translated-address' && sub[3]) {
          row.outside_src = stripQuotes(sub[3]);
          return;
        }
        return;
      }
      if (sub[0] === 'destination-translation') {
        row.nat_type = 'destination';
        if (sub[1] === 'translated-address' && sub[2]) {
          // For destination NAT, the LAN target is the translated-address; the
          // public side (originally captured into outside_src as the rule's
          // `destination`) stays in outside_src.
          row.inside_src = stripQuotes(sub[2]);
          return;
        }
        if (sub[1] === 'translated-port' && sub[2]) {
          row.inside_port = stripQuotes(sub[2]);
          return;
        }
        return;
      }
      return;
    }

    // ----- mgt-config users NAME ... -----
    if (p[0] === 'mgt-config' && p[1] === 'users' && p[2]) {
      const username = stripQuotes(p[2]);
      const row = getOrCreateUser(username);
      const sub = p.slice(3);
      if (sub[0] === 'phash') {
        row.auth_method = 'hash';
        return;
      }
      if (sub[0] === 'permissions' && sub[1] === 'role-based') {
        if (sub[2] === 'superuser' && stripQuotes(sub[3] ?? '') === 'yes') {
          row.privilege = 15;
          return;
        }
        if (sub[2] === 'custom') {
          row.privilege = 5;
          return;
        }
      }
      return;
    }
  }

  function applyInterfaceField(row: RouterInterfaceRow, p: string[], isSub: boolean): void {
    if (p[0] === 'ip' && p[1]) {
      applyIpAddress(row, stripQuotes(p[1]));
      return;
    }
    if (p[0] === 'comment' && p[1]) {
      row.description = stripQuotes(p[1]);
      return;
    }
    if (isSub && p[0] === 'tag' && p[1]) {
      const tag = Number(stripQuotes(p[1]));
      if (Number.isFinite(tag)) {
        row.vlan = tag;
        if (!vlans.has(tag)) {
          vlans.set(tag, { vlan_id: tag, name: row.interface_name });
        }
      }
      return;
    }
  }

  function applyIpAddress(row: RouterInterfaceRow, value: string): void {
    const [ip, prefix] = value.split('/');
    if (!row.ip_address) {
      row.ip_address = ip;
      row.subnet_mask = prefix ? cidrToMask(Number(prefix)) : null;
    }
  }

  // Push physical interfaces first, then sub-interfaces, in insertion order.
  const interfaces = Array.from(ifaceByName.values());

  // ----- post-pass: address object resolution -----
  const resolveAddr = (v: string | null): string | null => {
    if (!v) return v;
    return addressObjects.get(v) ?? v;
  };
  for (const acl of aclsByKey.values()) {
    acl.src = resolveAddr(acl.src);
    acl.dst = resolveAddr(acl.dst);
  }
  for (const nat of natByKey.values()) {
    nat.inside_src = resolveAddr(nat.inside_src);
    nat.outside_src = resolveAddr(nat.outside_src);
  }

  // ----- post-pass: DHCP pool network/netmask from interface -----
  for (const dhcp of dhcpByKey.values()) {
    const iface = ifaceByName.get(dhcp.pool_name);
    if (iface) {
      if (!dhcp.network && iface.ip_address) dhcp.network = iface.ip_address;
      if (!dhcp.netmask && iface.subnet_mask) dhcp.netmask = iface.subnet_mask;
    }
  }

  return {
    metadata,
    interfaces,
    vlans: Array.from(vlans.values()),
    static_routes: Array.from(routesByKey.values()),
    acls: Array.from(aclsByKey.values()),
    nat_rules: Array.from(natByKey.values()),
    dhcp_pools: Array.from(dhcpByKey.values()),
    users: Array.from(usersByName.values()),
  };
}

// ----- helpers -----

// Tokenise a `set ...` line, treating double-quoted segments as one token.
// PAN-OS rule names ("Allow HTTPS Outbound") commonly contain spaces.
// Backslash escapes inside quotes are preserved literally.
function tokenizeSetLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let tok = '';
    if (line[i] === '"') {
      i++; // consume opening quote
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) {
          tok += line[i + 1];
          i += 2;
        } else {
          tok += line[i++];
        }
      }
      if (i < line.length) i++; // consume closing quote
      tokens.push(`"${tok}"`); // re-wrap so stripQuotes can normalise
    } else {
      while (i < line.length && !/\s/.test(line[i])) {
        tok += line[i++];
      }
      tokens.push(tok);
    }
  }
  return tokens;
}

function stripQuotes(s: string): string {
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1);
  }
  return s;
}

// Returns the first non-bracket value from a token slice that may be a
// PAN-OS list literal `[ A B C ]` or a single value.
function firstListValue(tokens: string[]): string | null {
  for (const t of tokens) {
    if (t === '[' || t === ']') continue;
    return stripQuotes(t);
  }
  return null;
}
