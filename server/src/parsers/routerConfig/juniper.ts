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

// Parses Juniper JunOS `show configuration | display set` output.
//
// Strategy: each line is a flat `set ...` command. Tokenise the line, then
// dispatch on the first 1-4 path segments. Multi-line entities (interfaces,
// firewall terms, NAT rules, DHCP pools) are accumulated in keyed maps so that
// every `set` line that touches the same entity merges into a single output row.
//
// This parser does NOT support the brace-block format (`show configuration`
// without `| display set`); pipe through `display set` first.
//
// Each line is wrapped in a try/catch so a single malformed line never aborts
// the whole parse.
export function parseJuniperConfig(raw: string): ParsedRouterConfig {
  const lines = raw.split(/\r?\n/);

  const metadata: RouterConfigMetadata = {
    hostname: null,
    os_version: null,
    model: null,
    domain: null,
    timezone: null,
    ntp_servers: [],
  };
  // Interfaces are keyed by display name. For unit 0 we use the bare physical
  // name (`ge-0/0/0`); for non-zero units we use `ge-0/0/0.100`.
  const ifaceByName = new Map<string, RouterInterfaceRow>();
  const interfaces: RouterInterfaceRow[] = [];
  const vlans = new Map<number, RouterVlanRow>();
  const static_routes: RouterStaticRouteRow[] = [];
  const aclsByKey = new Map<string, RouterAclRow>();
  // Destination NAT pools by name → { address, port } so we can resolve
  // pool references in `then destination-nat pool POOL` rules.
  const natDestPools = new Map<string, { address: string | null; port: string | null }>();
  // NAT rules keyed by `${type}/${ruleSet}/${ruleName}` for cross-line merging.
  const natByKey = new Map<string, RouterNatRuleRow & { _poolRef?: string }>();
  const dhcpByKey = new Map<string, RouterDhcpPoolRow>();
  const usersByName = new Map<string, RouterUserRow>();

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
      interfaces.push(row);
    }
    return row;
  };

  const ifaceDisplayName = (physical: string, unit: string | null): string => {
    if (unit === null || unit === '0') return physical;
    return `${physical}.${unit}`;
  };

  const getOrCreateAcl = (filterName: string, termName: string): RouterAclRow => {
    const key = `${filterName}/${termName}`;
    let row = aclsByKey.get(key);
    if (!row) {
      const seq = Number(termName);
      row = {
        acl_name: filterName,
        sequence: Number.isFinite(seq) ? seq : null,
        action: 'accept',
        protocol: null,
        src: null,
        src_port: null,
        dst: null,
        dst_port: null,
      };
      aclsByKey.set(key, row);
    }
    return row;
  };

  const getOrCreateNat = (
    type: 'source' | 'destination' | 'static',
    ruleSet: string,
    ruleName: string
  ): RouterNatRuleRow & { _poolRef?: string } => {
    const key = `${type}/${ruleSet}/${ruleName}`;
    let row = natByKey.get(key);
    if (!row) {
      row = {
        nat_type: type,
        protocol: null,
        inside_src: null,
        inside_port: null,
        outside_src: null,
        outside_port: null,
      };
      natByKey.set(key, row);
    }
    return row;
  };

  const getOrCreateDhcp = (network: string): RouterDhcpPoolRow => {
    let row = dhcpByKey.get(network);
    if (!row) {
      const [net, prefix] = network.split('/');
      row = {
        pool_name: network,
        network: net || null,
        netmask: prefix ? cidrToMask(Number(prefix)) : null,
        default_router: null,
        dns_servers: [],
        lease_time: null,
        domain_name: null,
      };
      dhcpByKey.set(network, row);
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
      const start = tokens[0] === 'set' ? 1 : 0;
      const path = tokens.slice(start).map(stripQuotes);
      if (path.length === 0) continue;
      dispatch(path);
    } catch {
      // ignore individual line failures
    }
  }

  function dispatch(p: string[]): void {
    // ----- top-level version -----
    if (p[0] === 'version' && p[1]) {
      if (!metadata.os_version) metadata.os_version = p[1];
      return;
    }

    // ----- system -----
    if (p[0] === 'system') {
      if (p[1] === 'host-name' && p[2]) {
        metadata.hostname = p[2];
        return;
      }
      if (p[1] === 'domain-name' && p[2]) {
        metadata.domain = p[2];
        return;
      }
      if (p[1] === 'time-zone' && p[2]) {
        metadata.timezone = p[2];
        return;
      }
      if (p[1] === 'ntp' && p[2] === 'server' && p[3]) {
        if (!metadata.ntp_servers.includes(p[3])) metadata.ntp_servers.push(p[3]);
        return;
      }
      if (p[1] === 'login' && p[2] === 'user' && p[3]) {
        const username = p[3];
        let user = usersByName.get(username);
        if (!user) {
          user = { username, privilege: null, auth_method: null };
          usersByName.set(username, user);
        }
        if (p[4] === 'class' && p[5]) {
          if (p[5] === 'super-user') user.privilege = 15;
          else if (p[5] === 'operator') user.privilege = 10;
          else if (p[5] === 'read-only') user.privilege = 5;
        }
        if (p[4] === 'authentication') {
          if (p[5] === 'encrypted-password') user.auth_method = 'hash';
          else if (p[5] === 'plain-text-password') user.auth_method = 'password';
        }
        return;
      }
      // DHCP pools live under `system services dhcp pool NETWORK ...`
      if (p[1] === 'services' && p[2] === 'dhcp' && p[3] === 'pool' && p[4]) {
        const network = p[4];
        const row = getOrCreateDhcp(network);
        if (p[5] === 'router' && p[6]) {
          row.default_router = p[6];
          return;
        }
        if (p[5] === 'name-server' && p[6]) {
          if (!row.dns_servers.includes(p[6])) row.dns_servers.push(p[6]);
          return;
        }
        if (p[5] === 'domain-name' && p[6]) {
          row.domain_name = p[6];
          return;
        }
        return;
      }
      return;
    }

    // ----- vlans -----
    if (p[0] === 'vlans' && p[1] && p[2] === 'vlan-id' && p[3]) {
      const vid = Number(p[3]);
      if (Number.isFinite(vid) && !vlans.has(vid)) {
        vlans.set(vid, { vlan_id: vid, name: p[1] });
      }
      return;
    }

    // ----- interfaces -----
    if (p[0] === 'interfaces' && p[1]) {
      const physical = p[1];
      // `set interfaces ge-0/0/0 disable`
      if (p[2] === 'disable') {
        const row = getOrCreateIface(ifaceDisplayName(physical, null));
        row.admin_status = 'disabled';
        return;
      }
      // `set interfaces ge-0/0/0 description "..."`
      if (p[2] === 'description' && p[3]) {
        const row = getOrCreateIface(ifaceDisplayName(physical, null));
        row.description = p[3];
        return;
      }
      // `set interfaces ge-0/0/0 mac AA:BB:..` (or `hardware-address`)
      if ((p[2] === 'mac' || p[2] === 'hardware-address') && p[3]) {
        const row = getOrCreateIface(ifaceDisplayName(physical, null));
        row.mac_address = p[3];
        return;
      }
      // `set interfaces ge-0/0/0 vlan-tagging` — flag, ignore
      if (p[2] === 'vlan-tagging') return;
      // Sub-unit: `set interfaces ge-0/0/0 unit N ...`
      if (p[2] === 'unit' && p[3]) {
        const unit = p[3];
        const name = ifaceDisplayName(physical, unit);
        const row = getOrCreateIface(name);
        // `unit N description "..."`
        if (p[4] === 'description' && p[5]) {
          row.description = p[5];
          return;
        }
        // `unit N vlan-id N` — assign VLAN to sub-interface and emit a vlan row
        if (p[4] === 'vlan-id' && p[5]) {
          const vid = Number(p[5]);
          if (Number.isFinite(vid)) {
            row.vlan = vid;
            if (!vlans.has(vid)) {
              vlans.set(vid, { vlan_id: vid, name });
            }
          }
          return;
        }
        // `unit N family inet address CIDR`
        if (p[4] === 'family' && p[5] === 'inet' && p[6] === 'address' && p[7]) {
          const [ip, prefix] = p[7].split('/');
          if (!row.ip_address) {
            row.ip_address = ip;
            row.subnet_mask = prefix ? cidrToMask(Number(prefix)) : null;
          }
          return;
        }
        // `unit N disable`
        if (p[4] === 'disable') {
          row.admin_status = 'disabled';
          return;
        }
      }
      return;
    }

    // ----- routing-options static route -----
    if (p[0] === 'routing-options' && p[1] === 'static' && p[2] === 'route' && p[3]) {
      const dst = p[3];
      const [destination, prefix] = dst.split('/');
      const mask = prefix ? cidrToMask(Number(prefix)) : null;
      // `next-hop GW`
      if (p[4] === 'next-hop' && p[5]) {
        const nextHop = p[5];
        const exists = static_routes.find(
          r => r.destination === destination && r.mask === mask && r.next_hop === nextHop
        );
        if (!exists) {
          static_routes.push({
            destination,
            mask,
            next_hop: nextHop,
            metric: null,
            admin_distance: null,
          });
        }
        return;
      }
      // `qualified-next-hop GW metric N` — same destination, optional metric.
      if (p[4] === 'qualified-next-hop' && p[5]) {
        const nextHop = p[5];
        let route = static_routes.find(
          r => r.destination === destination && r.mask === mask && r.next_hop === nextHop
        );
        if (!route) {
          route = {
            destination,
            mask,
            next_hop: nextHop,
            metric: null,
            admin_distance: null,
          };
          static_routes.push(route);
        }
        if (p[6] === 'metric' && p[7]) {
          const m = Number(p[7]);
          if (Number.isFinite(m)) route.metric = m;
        }
        return;
      }
      // `preference N` — Juniper's term for admin distance.
      if (p[4] === 'preference' && p[5]) {
        const route = static_routes.find(
          r => r.destination === destination && r.mask === mask
        );
        if (route) {
          const d = Number(p[5]);
          if (Number.isFinite(d)) route.admin_distance = d;
        }
        return;
      }
      return;
    }

    // ----- firewall family inet filter NAME term TERM ... -----
    if (
      p[0] === 'firewall' &&
      p[1] === 'family' &&
      p[2] === 'inet' &&
      p[3] === 'filter' &&
      p[4] &&
      p[5] === 'term' &&
      p[6]
    ) {
      const filterName = p[4];
      const termName = p[6];
      const row = getOrCreateAcl(filterName, termName);
      // `from source-address X` etc.
      if (p[7] === 'from') {
        if (p[8] === 'source-address' && p[9]) row.src = p[9];
        else if (p[8] === 'destination-address' && p[9]) row.dst = p[9];
        else if (p[8] === 'protocol' && p[9]) row.protocol = p[9];
        else if (p[8] === 'source-port' && p[9]) row.src_port = p[9];
        else if (p[8] === 'destination-port' && p[9]) row.dst_port = p[9];
        return;
      }
      if (p[7] === 'then' && p[8]) {
        // Map Juniper actions onto a normalised vocabulary.
        if (p[8] === 'accept') row.action = 'accept';
        else if (p[8] === 'discard') row.action = 'drop';
        else if (p[8] === 'reject') row.action = 'reject';
        else row.action = p[8];
        return;
      }
      return;
    }

    // ----- security nat (source / destination / static) -----
    if (p[0] === 'security' && p[1] === 'nat') {
      // Destination NAT pool definition: `nat destination pool POOL address X`
      // or `... address port X`. Used as a target by destination NAT rules.
      if (p[2] === 'destination' && p[3] === 'pool' && p[4]) {
        const poolName = p[4];
        let pool = natDestPools.get(poolName);
        if (!pool) {
          pool = { address: null, port: null };
          natDestPools.set(poolName, pool);
        }
        if (p[5] === 'address' && p[6]) {
          if (p[6] === 'port' && p[7]) {
            pool.port = p[7];
          } else {
            // Strip /32 etc. from `10.0.0.10/32`
            pool.address = p[6].split('/')[0];
          }
        }
        return;
      }
      // Destination NAT rule: `nat destination rule-set RS rule R match|then ...`
      if (
        p[2] === 'destination' &&
        p[3] === 'rule-set' &&
        p[4] &&
        p[5] === 'rule' &&
        p[6]
      ) {
        const row = getOrCreateNat('destination', p[4], p[6]);
        if (p[7] === 'match') {
          if (p[8] === 'destination-address' && p[9]) row.outside_src = p[9].split('/')[0];
          else if (p[8] === 'destination-port' && p[9]) row.outside_port = p[9];
          else if (p[8] === 'protocol' && p[9]) row.protocol = p[9];
        } else if (p[7] === 'then' && p[8] === 'destination-nat' && p[9] === 'pool' && p[10]) {
          row._poolRef = p[10];
        }
        return;
      }
      // Source NAT rule: `nat source rule-set RS rule R match|then ...`
      if (
        p[2] === 'source' &&
        p[3] === 'rule-set' &&
        p[4] &&
        p[5] === 'rule' &&
        p[6]
      ) {
        const row = getOrCreateNat('source', p[4], p[6]);
        if (p[7] === 'match') {
          if (p[8] === 'source-address' && p[9]) row.inside_src = p[9];
          else if (p[8] === 'destination-address' && p[9]) row.outside_src = p[9];
          else if (p[8] === 'protocol' && p[9]) row.protocol = p[9];
        } else if (p[7] === 'then' && p[8] === 'source-nat') {
          // `then source-nat interface` → masquerade-style
          if (p[9] === 'interface') row.nat_type = 'source';
        }
        return;
      }
      return;
    }
  }

  // Resolve destination NAT pool references → inside_src / inside_port.
  for (const row of natByKey.values()) {
    if (row._poolRef) {
      const pool = natDestPools.get(row._poolRef);
      if (pool) {
        if (pool.address && !row.inside_src) row.inside_src = pool.address;
        if (pool.port && !row.inside_port) row.inside_port = pool.port;
      }
      delete row._poolRef;
    }
  }

  return {
    metadata,
    interfaces,
    vlans: Array.from(vlans.values()),
    static_routes,
    acls: Array.from(aclsByKey.values()),
    nat_rules: Array.from(natByKey.values()),
    dhcp_pools: Array.from(dhcpByKey.values()),
    users: Array.from(usersByName.values()),
  };
}

// ----- helpers -----

// Tokenise a `set ...` line, treating quoted segments as one token. Juniper
// display-set output uses double-quoted strings (occasionally single quotes
// in user-edited configs).
function tokenizeSetLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let tok = '';
    if (line[i] === '"') {
      tok += line[i++];
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) {
          tok += line[i] + line[i + 1];
          i += 2;
        } else {
          tok += line[i++];
        }
      }
      if (i < line.length) tok += line[i++];
    } else if (line[i] === "'") {
      tok += line[i++];
      while (i < line.length && line[i] !== "'") {
        tok += line[i++];
      }
      if (i < line.length) tok += line[i++];
    } else {
      while (i < line.length && !/\s/.test(line[i])) {
        tok += line[i++];
      }
    }
    tokens.push(tok);
  }
  return tokens;
}

function stripQuotes(s: string): string {
  if (s.length >= 2) {
    if ((s[0] === '"' && s[s.length - 1] === '"') || (s[0] === "'" && s[s.length - 1] === "'")) {
      return s.slice(1, -1);
    }
  }
  return s;
}

function cidrToMask(prefix: number): string | null {
  if (!Number.isFinite(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return [
    (mask >>> 24) & 0xff,
    (mask >>> 16) & 0xff,
    (mask >>> 8) & 0xff,
    mask & 0xff,
  ].join('.');
}
