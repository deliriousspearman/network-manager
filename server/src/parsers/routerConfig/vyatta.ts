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

// Parses Vyatta-derived router configurations: VyOS and Ubiquiti EdgeOS.
//
// Both expose `show configuration commands` as a flat list of `set ...` lines.
// Strategy: tokenise each line into a path of segments (respecting single quotes),
// then dispatch on the first 1-3 path segments. State is accumulated in keyed
// maps so multiple `set` lines for the same entity (e.g. an interface or a
// firewall rule) merge into a single output row.
//
// Each line is wrapped in a try/catch so a single malformed line never aborts
// the whole parse.
export function parseVyattaConfig(raw: string): ParsedRouterConfig {
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
  const interfaces: RouterInterfaceRow[] = [];
  const vlans = new Map<number, RouterVlanRow>();
  const static_routes: RouterStaticRouteRow[] = [];
  // Firewall rules keyed by `${set}/${ruleNum}` so we can merge multi-line rules.
  const aclsByKey = new Map<string, RouterAclRow>();
  // NAT rules keyed by rule number.
  const natByKey = new Map<string, RouterNatRuleRow>();
  // DHCP pools keyed by `${networkName}/${subnet}`.
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

  const getOrCreateAcl = (setName: string, ruleNum: number): RouterAclRow => {
    const key = `${setName}/${ruleNum}`;
    let row = aclsByKey.get(key);
    if (!row) {
      row = {
        acl_name: setName,
        sequence: ruleNum,
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

  const getOrCreateNat = (key: string): RouterNatRuleRow => {
    let row = natByKey.get(key);
    if (!row) {
      row = {
        nat_type: 'source',
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

  const getOrCreateDhcp = (name: string, subnet: string): RouterDhcpPoolRow => {
    const key = `${name}/${subnet}`;
    let row = dhcpByKey.get(key);
    if (!row) {
      const [network, prefix] = subnet.split('/');
      row = {
        pool_name: name,
        network: network || null,
        netmask: prefix ? cidrToMask(Number(prefix)) : null,
        default_router: null,
        dns_servers: [],
        lease_time: null,
        domain_name: null,
      };
      dhcpByKey.set(key, row);
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
      // Accept both `set ...` and bare path lines (some EdgeOS exports omit `set`).
      const start = tokens[0] === 'set' ? 1 : 0;
      const path = tokens.slice(start);
      if (path.length === 0) continue;

      dispatch(path);
    } catch {
      // ignore individual line failures
    }
  }

  function dispatch(p: string[]): void {
    // ----- system -----
    if (p[0] === 'system') {
      if (p[1] === 'host-name' && p[2]) {
        metadata.hostname = stripQuotes(p[2]);
        return;
      }
      if (p[1] === 'time-zone' && p[2]) {
        metadata.timezone = stripQuotes(p[2]);
        return;
      }
      if (p[1] === 'domain-name' && p[2]) {
        metadata.domain = stripQuotes(p[2]);
        return;
      }
      if (p[1] === 'ntp' && p[2] === 'server' && p[3]) {
        const server = stripQuotes(p[3]);
        if (!metadata.ntp_servers.includes(server)) {
          metadata.ntp_servers.push(server);
        }
        return;
      }
      if (p[1] === 'login' && p[2] === 'user' && p[3]) {
        const username = stripQuotes(p[3]);
        let user = usersByName.get(username);
        if (!user) {
          user = { username, privilege: null, auth_method: null };
          usersByName.set(username, user);
        }
        if (p[4] === 'level' && p[5]) {
          const level = stripQuotes(p[5]);
          if (level === 'admin') user.privilege = 15;
          else if (level === 'operator') user.privilege = 5;
        }
        if (p[4] === 'authentication') {
          if (p[5] === 'encrypted-password') user.auth_method = 'hash';
          else if (p[5] === 'plaintext-password') user.auth_method = 'password';
        }
        return;
      }
      return;
    }

    // ----- interfaces ethernet|bonding|vif ... -----
    if (p[0] === 'interfaces' && p[1] && p[2]) {
      const ifaceName = stripQuotes(p[2]);
      // VLAN sub-interface: `interfaces ethernet ethX vif N ...`
      if (p[3] === 'vif' && p[4]) {
        const vlanId = Number(stripQuotes(p[4]));
        const vifName = `${ifaceName}.${stripQuotes(p[4])}`;
        const row = getOrCreateIface(vifName);
        if (Number.isFinite(vlanId)) {
          row.vlan = vlanId;
          if (!vlans.has(vlanId)) {
            vlans.set(vlanId, { vlan_id: vlanId, name: vifName });
          }
        }
        applyInterfaceField(row, p.slice(5));
        return;
      }
      const row = getOrCreateIface(ifaceName);
      applyInterfaceField(row, p.slice(3));
      return;
    }

    // ----- protocols static route DST next-hop GW [distance N] -----
    if (p[0] === 'protocols' && p[1] === 'static' && p[2] === 'route' && p[3]) {
      const dst = stripQuotes(p[3]);
      const [destination, prefix] = dst.split('/');
      const mask = prefix ? cidrToMask(Number(prefix)) : null;
      // Find an existing route with the same destination + next-hop, or create one.
      let route = static_routes.find(r => r.destination === destination && r.mask === mask);
      if (p[4] === 'next-hop' && p[5]) {
        const nextHop = stripQuotes(p[5]);
        route = static_routes.find(
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
        if (p[6] === 'distance' && p[7]) {
          const d = Number(stripQuotes(p[7]));
          if (Number.isFinite(d)) route.admin_distance = d;
        }
      } else if (!route) {
        // `set protocols static route DST` with no next-hop yet — placeholder
        static_routes.push({
          destination,
          mask,
          next_hop: null,
          metric: null,
          admin_distance: null,
        });
      }
      return;
    }

    // ----- firewall name <set> rule <n> ... (also handles `firewall ipv4 name`) -----
    if (p[0] === 'firewall') {
      // Skip the optional `ipv4` / `ipv6` segment used by modern VyOS.
      let i = 1;
      if (p[i] === 'ipv4' || p[i] === 'ipv6') i++;
      if (p[i] === 'name' && p[i + 1] && p[i + 2] === 'rule' && p[i + 3]) {
        const setName = stripQuotes(p[i + 1]);
        const ruleNum = Number(stripQuotes(p[i + 3]));
        if (!Number.isFinite(ruleNum)) return;
        const row = getOrCreateAcl(setName, ruleNum);
        applyFirewallField(row, p.slice(i + 4));
      }
      return;
    }

    // ----- service nat rule <n> ... (EdgeOS / VyOS classic) -----
    if (p[0] === 'service' && p[1] === 'nat' && p[2] === 'rule' && p[3]) {
      const ruleNum = stripQuotes(p[3]);
      const row = getOrCreateNat(`service/${ruleNum}`);
      applyNatField(row, p.slice(4));
      return;
    }

    // ----- nat source|destination rule <n> ... (modern VyOS) -----
    if (p[0] === 'nat' && (p[1] === 'source' || p[1] === 'destination') && p[2] === 'rule' && p[3]) {
      const ruleNum = stripQuotes(p[3]);
      const row = getOrCreateNat(`${p[1]}/${ruleNum}`);
      row.nat_type = p[1];
      applyNatField(row, p.slice(4));
      return;
    }

    // ----- service dhcp-server shared-network-name <name> subnet <cidr> ... -----
    if (
      p[0] === 'service' &&
      p[1] === 'dhcp-server' &&
      p[2] === 'shared-network-name' &&
      p[3] &&
      p[4] === 'subnet' &&
      p[5]
    ) {
      const name = stripQuotes(p[3]);
      const subnet = stripQuotes(p[5]);
      const row = getOrCreateDhcp(name, subnet);
      applyDhcpField(row, p.slice(6));
      return;
    }
  }

  function applyInterfaceField(row: RouterInterfaceRow, p: string[]): void {
    if (p[0] === 'description' && p[1]) {
      row.description = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'address' && p[1]) {
      const cidr = stripQuotes(p[1]);
      const [ip, prefix] = cidr.split('/');
      if (!row.ip_address) {
        row.ip_address = ip;
        row.subnet_mask = prefix ? cidrToMask(Number(prefix)) : null;
      }
      return;
    }
    if ((p[0] === 'mac' || p[0] === 'hw-id') && p[1]) {
      row.mac_address = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'disable') {
      row.admin_status = 'disabled';
      return;
    }
  }

  function applyFirewallField(row: RouterAclRow, p: string[]): void {
    if (p[0] === 'action' && p[1]) {
      row.action = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'protocol' && p[1]) {
      row.protocol = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'source' && p[1] === 'address' && p[2]) {
      row.src = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'source' && p[1] === 'port' && p[2]) {
      row.src_port = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'destination' && p[1] === 'address' && p[2]) {
      row.dst = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'destination' && p[1] === 'port' && p[2]) {
      row.dst_port = stripQuotes(p[2]);
      return;
    }
  }

  function applyNatField(row: RouterNatRuleRow, p: string[]): void {
    if (p[0] === 'type' && p[1]) {
      row.nat_type = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'protocol' && p[1]) {
      row.protocol = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'source' && p[1] === 'address' && p[2]) {
      row.inside_src = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'source' && p[1] === 'port' && p[2]) {
      row.inside_port = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'destination' && p[1] === 'address' && p[2]) {
      row.outside_src = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'destination' && p[1] === 'port' && p[2]) {
      row.outside_port = stripQuotes(p[2]);
      return;
    }
    // EdgeOS / VyOS classic: `inside-address address X`, `inside-address port Y`
    if (p[0] === 'inside-address' && p[1] === 'address' && p[2]) {
      row.outside_src = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'inside-address' && p[1] === 'port' && p[2]) {
      row.outside_port = stripQuotes(p[2]);
      return;
    }
    // Modern VyOS: `translation address`, `translation port`
    if (p[0] === 'translation' && p[1] === 'address' && p[2]) {
      row.outside_src = stripQuotes(p[2]);
      return;
    }
    if (p[0] === 'translation' && p[1] === 'port' && p[2]) {
      row.outside_port = stripQuotes(p[2]);
      return;
    }
  }

  function applyDhcpField(row: RouterDhcpPoolRow, p: string[]): void {
    if (p[0] === 'default-router' && p[1]) {
      row.default_router = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'dns-server' && p[1]) {
      const server = stripQuotes(p[1]);
      if (!row.dns_servers.includes(server)) row.dns_servers.push(server);
      return;
    }
    if (p[0] === 'lease' && p[1]) {
      row.lease_time = stripQuotes(p[1]);
      return;
    }
    if (p[0] === 'domain-name' && p[1]) {
      row.domain_name = stripQuotes(p[1]);
      return;
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

// Tokenise a `set ...` line, treating single-quoted segments as one token.
// Vyatta-style configs use single quotes around values that contain spaces.
function tokenizeSetLine(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let tok = '';
    if (line[i] === "'") {
      tok += line[i++];
      while (i < line.length && line[i] !== "'") {
        tok += line[i++];
      }
      if (i < line.length) tok += line[i++];
    } else if (line[i] === '"') {
      tok += line[i++];
      while (i < line.length && line[i] !== '"') {
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
    if ((s[0] === "'" && s[s.length - 1] === "'") || (s[0] === '"' && s[s.length - 1] === '"')) {
      return s.slice(1, -1);
    }
  }
  return s;
}

