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

// Parses a FortiGate (FortiOS) configuration backup.
//
// Strategy: track a stack of nested `config ... end` blocks. Within each block,
// `edit <id>` opens an item and `next` closes it; inside an item, `set <key>
// <value...>` lines are accumulated into a key→values map. When an item closes,
// it is finalised into the appropriate output row based on the block path.
//
// Some blocks (e.g. `system global`) contain bare `set` lines without an `edit`,
// in which case the set is treated as block-level metadata.
//
// Each line is wrapped in a try/catch so a single malformed line never aborts
// the whole parse.
export function parseFortigateConfig(raw: string): ParsedRouterConfig {
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

  type Frame = {
    configPath: string;
    editId: string | null;
    item: Record<string, string[]> | null;
  };
  const stack: Frame[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      // Header line: `#config-version=FGT60E-7.0.5-FW-build...`
      const m = line.match(/^#config-version=([A-Z0-9]+)-([0-9.]+)/i);
      if (m) {
        if (!metadata.model) metadata.model = m[1];
        if (!metadata.os_version) metadata.os_version = m[2];
      }
      continue;
    }

    try {
      if (line.startsWith('config ')) {
        const path = line.slice('config '.length).trim();
        stack.push({ configPath: path, editId: null, item: null });
        continue;
      }

      if (line === 'end') {
        // Close any unclosed item before popping the block.
        if (stack.length) {
          const top = stack[stack.length - 1];
          if (top.item) finalizeItem(top);
          stack.pop();
        }
        continue;
      }

      if (stack.length === 0) continue;
      const top = stack[stack.length - 1];

      if (line.startsWith('edit ')) {
        // Close any prior item that wasn't terminated by `next`.
        if (top.item) finalizeItem(top);
        const idTok = line.slice('edit '.length).trim();
        top.editId = stripQuotes(idTok);
        top.item = {};
        continue;
      }

      if (line === 'next') {
        if (top.item) finalizeItem(top);
        top.editId = null;
        top.item = null;
        continue;
      }

      if (line.startsWith('set ')) {
        const tokens = tokenizeLine(line.slice('set '.length).trim());
        if (tokens.length === 0) continue;
        const key = tokens[0];
        const values = tokens.slice(1).map(stripQuotes);
        if (top.item) {
          top.item[key] = values;
        } else {
          handleBlockLevelSet(top.configPath, key, values);
        }
      }
    } catch {
      // swallow individual line failures
    }
  }

  function handleBlockLevelSet(configPath: string, key: string, values: string[]): void {
    if (configPath === 'system global') {
      if (key === 'hostname' && values[0]) metadata.hostname = values[0];
      else if (key === 'timezone' && values[0]) metadata.timezone = values[0];
    }
  }

  function finalizeItem(frame: Frame): void {
    const path = frame.configPath;
    const item = frame.item;
    const editId = frame.editId;
    if (!item || !editId) return;

    if (path === 'system interface') {
      const ip = item.ip;
      const row: RouterInterfaceRow = {
        interface_name: editId,
        description: item.description?.[0] ?? null,
        ip_address: ip?.[0] ?? null,
        subnet_mask: ip?.[1] ?? null,
        vlan: item.vlanid ? Number(item.vlanid[0]) : null,
        admin_status: item.status?.[0] === 'down' ? 'down' : 'up',
        mac_address: item.macaddr?.[0] ?? null,
      };
      interfaces.push(row);
      if (item.vlanid) {
        const vid = Number(item.vlanid[0]);
        if (Number.isFinite(vid)) {
          vlans.push({ vlan_id: vid, name: editId });
        }
      }
      return;
    }

    if (path === 'router static') {
      const dst = item.dst;
      static_routes.push({
        destination: dst?.[0] ?? '0.0.0.0',
        mask: dst?.[1] ?? null,
        next_hop: item.gateway?.[0] ?? null,
        metric: null,
        admin_distance: item.distance ? Number(item.distance[0]) : null,
      });
      return;
    }

    if (path === 'firewall policy') {
      acls.push({
        acl_name: item.name?.[0] ?? 'policy',
        sequence: Number(editId) || null,
        action: item.action?.[0] ?? 'accept',
        protocol: item.service?.[0] ?? null,
        src: item.srcaddr?.[0] ?? null,
        src_port: null,
        dst: item.dstaddr?.[0] ?? null,
        dst_port: null,
      });
      return;
    }

    if (path === 'firewall vip') {
      // Virtual IPs are destination NAT (port forwards / 1-to-1 NAT).
      nat_rules.push({
        nat_type: 'destination',
        protocol: item.protocol?.[0] ?? null,
        inside_src: item.mappedip?.[0] ?? null,
        inside_port: item.mappedport?.[0] ?? null,
        outside_src: item.extip?.[0] ?? null,
        outside_port: item.extport?.[0] ?? null,
      });
      return;
    }

    if (path === 'system dhcp server') {
      const dnsServers: string[] = [];
      if (item['dns-server1']?.[0]) dnsServers.push(item['dns-server1'][0]);
      if (item['dns-server2']?.[0]) dnsServers.push(item['dns-server2'][0]);
      if (item['dns-server3']?.[0]) dnsServers.push(item['dns-server3'][0]);
      dhcp_pools.push({
        pool_name: item.interface?.[0] ?? `dhcp-${editId}`,
        network: null,
        netmask: item.netmask?.[0] ?? null,
        default_router: item['default-gateway']?.[0] ?? null,
        dns_servers: dnsServers,
        lease_time: item['lease-time']?.[0] ?? null,
        domain_name: item.domain?.[0] ?? null,
      });
      return;
    }

    if (path === 'system admin') {
      const profile = item.accprofile?.[0] ?? '';
      let priv: number | null = null;
      if (profile === 'super_admin') priv = 15;
      else if (profile === 'prof_admin') priv = 10;
      // FortiGate stores hashed passwords as `ENC <blob>`, so the first value is `ENC`.
      let authMethod: string | null = null;
      if (item.password) {
        authMethod = item.password[0] === 'ENC' ? 'hash' : 'password';
      }
      users.push({
        username: editId,
        privilege: priv,
        auth_method: authMethod,
      });
      return;
    }

    // `config ntpserver` is nested inside `config system ntp` and lists each
    // NTP server as a numbered edit with `set server "host"`.
    if (path === 'ntpserver') {
      if (item.server?.[0]) metadata.ntp_servers.push(item.server[0]);
      return;
    }
  }

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

// Whitespace tokenizer that respects double-quoted values. Quotes are returned
// as part of the token; callers should pass tokens through stripQuotes().
function tokenizeLine(line: string): string[] {
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
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') {
    return s.slice(1, -1);
  }
  return s;
}
