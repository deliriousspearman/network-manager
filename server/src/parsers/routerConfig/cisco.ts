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

// Parses a Cisco IOS running-config / startup-config.
//
// Strategy: walk line-by-line, tracking the current "block" context. Column-0 lines
// open a new top-level command; indented lines belong to the current block. Blocks
// end at the next column-0 line, a `!` comment, or EOF.
//
// Each entity-extraction phase is wrapped in its own try/catch so a single malformed
// line never kills the whole parse.
export function parseCiscoConfig(raw: string): ParsedRouterConfig {
  const lines = raw.split(/\r?\n/);

  const metadata: RouterConfigMetadata = {
    hostname: null,
    os_version: null,
    model: null,
    domain: null,
    timezone: null,
    ntp_servers: [],
  };
  const interfaces: RouterInterfaceRow[] = [];
  const vlans: RouterVlanRow[] = [];
  const static_routes: RouterStaticRouteRow[] = [];
  const acls: RouterAclRow[] = [];
  const nat_rules: RouterNatRuleRow[] = [];
  const dhcp_pools: RouterDhcpPoolRow[] = [];
  const users: RouterUserRow[] = [];

  // Current block state
  type BlockKind =
    | null
    | { kind: 'interface'; row: RouterInterfaceRow }
    | { kind: 'vlan'; row: RouterVlanRow }
    | { kind: 'acl'; acl_name: string }
    | { kind: 'dhcp'; row: RouterDhcpPoolRow };
  let current: BlockKind = null;

  const closeBlock = () => {
    if (!current) return;
    if (current.kind === 'interface') interfaces.push(current.row);
    else if (current.kind === 'vlan') vlans.push(current.row);
    else if (current.kind === 'dhcp') dhcp_pools.push(current.row);
    current = null;
  };

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;
    // Comment / block terminator
    if (rawLine.trimStart().startsWith('!')) {
      closeBlock();
      continue;
    }

    const isIndented = rawLine.startsWith(' ') || rawLine.startsWith('\t');
    const line = rawLine.trim();

    // ----- Indented lines (belong to current block) -----
    if (isIndented && current) {
      try {
        if (current.kind === 'interface') {
          applyInterfaceChild(line, current.row);
        } else if (current.kind === 'vlan') {
          const m = line.match(/^name\s+(.+)$/);
          if (m) current.row.name = m[1].trim();
        } else if (current.kind === 'acl') {
          const ace = parseAce(line);
          if (ace) acls.push({ ...ace, acl_name: current.acl_name });
        } else if (current.kind === 'dhcp') {
          applyDhcpChild(line, current.row);
        }
      } catch {
        // swallow: one bad line in a block should not abort the whole parse
      }
      continue;
    }

    // ----- Column-0 lines (new top-level command) -----
    closeBlock();

    try {
      // Metadata
      let m: RegExpMatchArray | null;
      if ((m = line.match(/^hostname\s+(\S+)/))) {
        metadata.hostname = m[1];
        continue;
      }
      if ((m = line.match(/^version\s+(\S+)/))) {
        metadata.os_version = m[1];
        continue;
      }
      if ((m = line.match(/^ip\s+domain[-\s]name\s+(\S+)/))) {
        metadata.domain = m[1];
        continue;
      }
      if ((m = line.match(/^clock\s+timezone\s+(.+)$/))) {
        metadata.timezone = m[1].trim();
        continue;
      }
      if ((m = line.match(/^ntp\s+server\s+(\S+)/))) {
        metadata.ntp_servers.push(m[1]);
        continue;
      }

      // Interface block
      if ((m = line.match(/^interface\s+(\S+)/))) {
        current = {
          kind: 'interface',
          row: {
            interface_name: m[1],
            description: null,
            ip_address: null,
            subnet_mask: null,
            vlan: null,
            admin_status: 'up',
            mac_address: null,
          },
        };
        continue;
      }

      // VLAN block (skip `vlan internal` and similar special forms)
      if ((m = line.match(/^vlan\s+(\d+)\s*$/))) {
        current = { kind: 'vlan', row: { vlan_id: Number(m[1]), name: null } };
        continue;
      }

      // Static route
      if ((m = line.match(/^ip\s+route\s+(\S+)\s+(\S+)\s+(\S+)(?:\s+(\d+))?/))) {
        const dest = m[1];
        const mask = m[2];
        const nextHop = m[3];
        const trailingNum = m[4] ? Number(m[4]) : null;
        // Trailing number after next-hop is admin distance in Cisco IOS
        static_routes.push({
          destination: dest,
          mask,
          next_hop: nextHop,
          metric: null,
          admin_distance: trailingNum,
        });
        continue;
      }

      // Numbered ACL
      if ((m = line.match(/^access-list\s+(\d+)\s+(permit|deny)\s+(.+)$/))) {
        const ace = parseAceTail(m[2], m[3]);
        acls.push({
          acl_name: m[1],
          sequence: null,
          ...ace,
        });
        continue;
      }

      // Named extended ACL block
      if ((m = line.match(/^ip\s+access-list\s+(?:extended|standard)\s+(\S+)/))) {
        current = { kind: 'acl', acl_name: m[1] };
        continue;
      }

      // NAT static
      if ((m = line.match(/^ip\s+nat\s+inside\s+source\s+static\s+(.+)$/))) {
        const nat = parseNatStatic(m[1]);
        if (nat) nat_rules.push(nat);
        continue;
      }

      // DHCP pool block
      if ((m = line.match(/^ip\s+dhcp\s+pool\s+(\S+)/))) {
        current = {
          kind: 'dhcp',
          row: {
            pool_name: m[1],
            network: null,
            netmask: null,
            default_router: null,
            dns_servers: [],
            lease_time: null,
            domain_name: null,
          },
        };
        continue;
      }

      // Username
      if ((m = line.match(/^username\s+(\S+)(.*)$/))) {
        const username = m[1];
        const rest = m[2] || '';
        const privMatch = rest.match(/privilege\s+(\d+)/);
        let authMethod: string | null = null;
        if (/\bsecret\b/.test(rest)) authMethod = 'secret';
        else if (/\bpassword\b/.test(rest)) authMethod = 'password';
        users.push({
          username,
          privilege: privMatch ? Number(privMatch[1]) : null,
          auth_method: authMethod,
        });
        continue;
      }
    } catch {
      // swallow
    }
  }

  closeBlock();

  return {
    metadata,
    interfaces,
    vlans,
    static_routes,
    acls,
    nat_rules,
    dhcp_pools,
    users,
  };
}

// ----- helpers -----

function applyInterfaceChild(line: string, row: RouterInterfaceRow): void {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^description\s+(.+)$/))) {
    row.description = m[1].trim();
    return;
  }
  if ((m = line.match(/^ip\s+address\s+(\S+)\s+(\S+)$/))) {
    row.ip_address = m[1];
    row.subnet_mask = m[2];
    return;
  }
  if ((m = line.match(/^switchport\s+access\s+vlan\s+(\d+)$/))) {
    row.vlan = Number(m[1]);
    return;
  }
  if (/^shutdown$/.test(line)) {
    row.admin_status = 'shutdown';
    return;
  }
  if (/^no\s+shutdown$/.test(line)) {
    row.admin_status = 'up';
    return;
  }
  if ((m = line.match(/^mac-address\s+(\S+)$/))) {
    row.mac_address = m[1];
    return;
  }
}

function applyDhcpChild(line: string, row: RouterDhcpPoolRow): void {
  let m: RegExpMatchArray | null;
  if ((m = line.match(/^network\s+(\S+)\s+(\S+)$/))) {
    row.network = m[1];
    row.netmask = m[2];
    return;
  }
  if ((m = line.match(/^default-router\s+(\S+)/))) {
    row.default_router = m[1];
    return;
  }
  if ((m = line.match(/^dns-server\s+(.+)$/))) {
    row.dns_servers = m[1].trim().split(/\s+/);
    return;
  }
  if ((m = line.match(/^lease\s+(.+)$/))) {
    row.lease_time = m[1].trim();
    return;
  }
  if ((m = line.match(/^domain-name\s+(\S+)$/))) {
    row.domain_name = m[1];
    return;
  }
}

// Parse a single ACE (access control entry) inside a named ACL block.
// Forms: `[SEQ] permit|deny PROTO ...`
function parseAce(line: string): Omit<RouterAclRow, 'acl_name'> | null {
  const m = line.match(/^(?:(\d+)\s+)?(permit|deny)\s+(.+)$/);
  if (!m) return null;
  const sequence = m[1] ? Number(m[1]) : null;
  const rest = parseAceTail(m[2], m[3]);
  return { sequence, ...rest };
}

// Parse the `PROTO SRC [SRC_PORT] DST [DST_PORT]` tail of an ACE. Minimal tokenizer
// that understands `any`, `host X`, `X MASK`, and port specifiers (`eq`, `range`,
// `gt`, `lt`, `neq`).
function parseAceTail(action: string, tail: string): Omit<RouterAclRow, 'acl_name' | 'sequence'> {
  const tokens = tail.trim().split(/\s+/);
  let i = 0;
  const protocol = tokens[i++] ?? null;

  const takeEndpoint = (): string => {
    if (i >= tokens.length) return '';
    const t = tokens[i++];
    if (t === 'any') return 'any';
    if (t === 'host') return tokens[i++] ?? '';
    // Assume `addr mask` pair
    const mask = tokens[i++] ?? '';
    return mask ? `${t} ${mask}` : t;
  };

  const takePort = (): string | null => {
    if (i >= tokens.length) return null;
    const t = tokens[i];
    if (t === 'eq' || t === 'neq' || t === 'gt' || t === 'lt') {
      i++;
      const p = tokens[i++] ?? '';
      return `${t} ${p}`;
    }
    if (t === 'range') {
      i++;
      const a = tokens[i++] ?? '';
      const b = tokens[i++] ?? '';
      return `range ${a} ${b}`;
    }
    return null;
  };

  const src = takeEndpoint() || null;
  const src_port = takePort();
  const dst = takeEndpoint() || null;
  const dst_port = takePort();

  return { action, protocol, src, src_port, dst, dst_port };
}

// Parse `ip nat inside source static [tcp|udp] INSIDE [PORT] OUTSIDE [PORT]`
function parseNatStatic(tail: string): RouterNatRuleRow | null {
  const tokens = tail.trim().split(/\s+/);
  let i = 0;
  let protocol: string | null = null;
  if (tokens[i] === 'tcp' || tokens[i] === 'udp') {
    protocol = tokens[i++];
  }
  const inside_src = tokens[i++] ?? null;
  let inside_port: string | null = null;
  let outside_src: string | null = null;
  let outside_port: string | null = null;

  if (protocol) {
    // tcp/udp form: INSIDE PORT OUTSIDE PORT
    inside_port = tokens[i++] ?? null;
    outside_src = tokens[i++] ?? null;
    outside_port = tokens[i++] ?? null;
  } else {
    // plain form: INSIDE OUTSIDE
    outside_src = tokens[i++] ?? null;
  }

  if (!inside_src || !outside_src) return null;
  return {
    nat_type: 'static',
    protocol,
    inside_src,
    inside_port,
    outside_src,
    outside_port,
  };
}
