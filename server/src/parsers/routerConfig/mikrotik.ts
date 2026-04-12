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

// Parses a MikroTik RouterOS `/export` script.
//
// Strategy: fold backslash-continued lines, then walk line-by-line. Lines beginning
// with `/` either set or amend the current command path; lines without `/` are
// sub-commands of the current path. Each dispatched line is wrapped in a try/catch
// so a single malformed line never aborts the whole parse.
export function parseMikrotikConfig(raw: string): ParsedRouterConfig {
  const folded = foldContinuationLines(raw);
  const lines = folded.split(/\r?\n/);

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

  // Find-or-create interface rows by name so /interface, /ip address, etc. all
  // converge on the same row.
  const ifaceByName = new Map<string, RouterInterfaceRow>();
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

  let currentPath: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      // Comment lines like `# software id = ABC-DEF` are mostly noise, but the
      // header line `# jan/02/1970 ... by RouterOS 6.49.10` carries the OS version.
      const m = line.match(/by\s+RouterOS\s+(\S+)/i);
      if (m && !metadata.os_version) metadata.os_version = m[1];
      continue;
    }

    try {
      let path: string;
      let command: string;
      let rest: string;

      if (line.startsWith('/')) {
        const parsed = splitPathAndCommand(line);
        if (!parsed.command) {
          // Pure path setter, e.g. `/ip address`
          currentPath = parsed.path;
          continue;
        }
        path = parsed.path;
        command = parsed.command;
        rest = parsed.rest;
        currentPath = path;
      } else {
        if (!currentPath) continue;
        const m = line.match(/^(add|set|remove|print)\b\s*(.*)$/);
        if (!m) continue;
        path = currentPath;
        command = m[1];
        rest = m[2];
      }

      // Strip the `[ find ... ]` selector but preserve any kv pairs inside it,
      // since `set [ find default-name=ether1 ] comment=WAN` identifies the
      // target by `default-name=` only.
      const selectorMatch = rest.match(/\[\s*find\s+([^\]]*)\]/);
      const cleanedRest = rest.replace(/\[\s*find[^\]]*\]/g, '').trim();
      const kv = parseKvPairs(cleanedRest);
      if (selectorMatch) {
        const selectorKv = parseKvPairs(selectorMatch[1]);
        for (const [k, v] of Object.entries(selectorKv)) {
          if (!(k in kv)) kv[k] = v;
        }
      }

      dispatch(path, command, kv);
    } catch {
      // swallow individual line failures
    }
  }

  function dispatch(path: string, command: string, kv: Record<string, string>): void {
    // ----- Metadata -----
    if (path === '/system identity' && command === 'set' && kv.name) {
      metadata.hostname = kv.name;
      return;
    }
    if (path === '/system clock' && command === 'set' && kv['time-zone-name']) {
      metadata.timezone = kv['time-zone-name'];
      return;
    }
    if (path === '/system ntp client' && command === 'set') {
      const dnsNames = kv['server-dns-names'];
      if (dnsNames) {
        for (const s of dnsNames.split(',').map(x => x.trim()).filter(Boolean)) {
          metadata.ntp_servers.push(s);
        }
      }
      const primary = kv['primary-ntp'];
      if (primary && primary !== '0.0.0.0') metadata.ntp_servers.push(primary);
      const secondary = kv['secondary-ntp'];
      if (secondary && secondary !== '0.0.0.0') metadata.ntp_servers.push(secondary);
      return;
    }

    // ----- Interfaces (ethernet, bridge, vlan, wireless, ...) -----
    if (/^\/interface\b/.test(path) && (command === 'set' || command === 'add')) {
      const name = kv.name || kv['default-name'];
      if (name) {
        const row = getOrCreateIface(name);
        if (kv.comment) row.description = kv.comment;
        if (kv['mac-address']) row.mac_address = kv['mac-address'];
        if (kv.disabled === 'yes') row.admin_status = 'disabled';
        else if (kv.disabled === 'no') row.admin_status = 'up';

        // VLAN sub-interface — also produces a vlans row
        if (path === '/interface vlan' && kv['vlan-id']) {
          const vlanId = Number(kv['vlan-id']);
          if (Number.isFinite(vlanId)) {
            row.vlan = vlanId;
            vlans.push({ vlan_id: vlanId, name });
          }
        }
      }
      return;
    }

    // ----- IP addresses — merge into matching interface row -----
    if (path === '/ip address' && command === 'add' && kv.address) {
      const [ip, prefix] = kv.address.split('/');
      const mask = prefix ? cidrToMask(Number(prefix)) : null;
      const ifaceName = kv.interface || '';
      if (ifaceName) {
        const row = getOrCreateIface(ifaceName);
        if (!row.ip_address) {
          row.ip_address = ip;
          row.subnet_mask = mask;
        }
      }
      return;
    }

    // ----- Static routes -----
    if (path === '/ip route' && command === 'add' && kv['dst-address']) {
      const [destination, prefix] = kv['dst-address'].split('/');
      const mask = prefix ? cidrToMask(Number(prefix)) : null;
      static_routes.push({
        destination,
        mask,
        next_hop: kv.gateway || null,
        metric: null,
        admin_distance: kv.distance ? Number(kv.distance) : null,
      });
      return;
    }

    // ----- Firewall filter rules — emitted as ACL rows -----
    if (path === '/ip firewall filter' && command === 'add' && kv.chain) {
      acls.push({
        acl_name: kv.chain,
        sequence: null,
        action: kv.action || 'accept',
        protocol: kv.protocol || null,
        src: kv['src-address'] || null,
        src_port: kv['src-port'] || null,
        dst: kv['dst-address'] || null,
        dst_port: kv['dst-port'] || null,
      });
      return;
    }

    // ----- Firewall NAT rules -----
    // For dstnat (port forwards), the public side is `dst-*` and the LAN target is `to-*`.
    // For srcnat / masquerade, the LAN side is `src-*` and the public translation is `to-*`.
    if (path === '/ip firewall nat' && command === 'add' && kv.chain) {
      if (kv.chain === 'dstnat') {
        nat_rules.push({
          nat_type: 'dstnat',
          protocol: kv.protocol || null,
          inside_src: kv['to-addresses'] || null,
          inside_port: kv['to-ports'] || null,
          outside_src: kv['dst-address'] || null,
          outside_port: kv['dst-port'] || null,
        });
      } else {
        nat_rules.push({
          nat_type: kv.chain,
          protocol: kv.protocol || null,
          inside_src: kv['src-address'] || null,
          inside_port: kv['src-port'] || null,
          outside_src: kv['to-addresses'] || null,
          outside_port: kv['to-ports'] || null,
        });
      }
      return;
    }

    // ----- DHCP server network — emit a dhcp_pools row -----
    if (path === '/ip dhcp-server network' && command === 'add' && kv.address) {
      const [network, prefix] = kv.address.split('/');
      const netmask = prefix ? cidrToMask(Number(prefix)) : null;
      const dnsServers = kv['dns-server']
        ? kv['dns-server'].split(',').map(s => s.trim()).filter(Boolean)
        : [];
      dhcp_pools.push({
        pool_name: kv.comment || network || 'dhcp',
        network: network || null,
        netmask,
        default_router: kv.gateway || null,
        dns_servers: dnsServers,
        lease_time: null,
        domain_name: kv.domain || null,
      });
      return;
    }

    // ----- Users -----
    if (path === '/user' && command === 'add' && kv.name) {
      const group = kv.group || '';
      let privilege: number | null = null;
      if (group === 'full') privilege = 15;
      else if (group === 'write') privilege = 10;
      else if (group === 'read') privilege = 5;
      users.push({
        username: kv.name,
        privilege,
        auth_method: kv.password ? 'password' : null,
      });
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

// Fold lines that end with a backslash continuation into a single logical line.
function foldContinuationLines(raw: string): string {
  return raw.replace(/\\\r?\n\s*/g, ' ');
}

// Split a top-level RouterOS line into (path, command, rest). Path is everything
// from the leading `/` up to (but not including) the first command verb token.
function splitPathAndCommand(line: string): { path: string; command: string; rest: string } {
  const tokens = tokenizeLine(line);
  for (let i = 1; i < tokens.length; i++) {
    if (
      tokens[i] === 'add' ||
      tokens[i] === 'set' ||
      tokens[i] === 'remove' ||
      tokens[i] === 'print'
    ) {
      return {
        path: tokens.slice(0, i).join(' '),
        command: tokens[i],
        rest: tokens.slice(i + 1).join(' '),
      };
    }
  }
  return { path: tokens.join(' '), command: '', rest: '' };
}

// Whitespace tokenizer that respects double-quoted values and `[ ... ]` selectors.
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
    } else if (line[i] === '[') {
      let depth = 0;
      while (i < line.length) {
        tok += line[i];
        if (line[i] === '[') depth++;
        else if (line[i] === ']') {
          depth--;
          i++;
          if (depth === 0) break;
          continue;
        }
        i++;
      }
    } else {
      while (i < line.length && !/\s/.test(line[i])) {
        tok += line[i++];
      }
    }
    tokens.push(tok);
  }
  return tokens;
}

// Parse `key=value key2="value with spaces" key3=val3` into a record. Quotes are
// stripped from the returned value.
function parseKvPairs(s: string): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let key = '';
    while (i < s.length && s[i] !== '=' && !/\s/.test(s[i])) {
      key += s[i++];
    }
    if (i >= s.length || s[i] !== '=') {
      // Bare token without value — skip past whitespace and continue.
      while (i < s.length && !/\s/.test(s[i])) i++;
      continue;
    }
    i++; // consume '='
    let value = '';
    if (s[i] === '"') {
      i++;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === '\\' && i + 1 < s.length) {
          value += s[i + 1];
          i += 2;
        } else {
          value += s[i++];
        }
      }
      if (i < s.length) i++; // closing quote
    } else {
      while (i < s.length && !/\s/.test(s[i])) {
        value += s[i++];
      }
    }
    if (key) out[key] = value;
  }
  return out;
}

// Convert a CIDR prefix length (0-32) to a dotted-decimal netmask.
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
