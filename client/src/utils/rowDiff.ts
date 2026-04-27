export interface RowDiff<T> {
  added: T[];
  removed: T[];
  changed: { before: T; after: T; fields: string[] }[];
  unchanged: T[];
}

export function diffRows<T extends Record<string, unknown>>(
  before: T[],
  after: T[],
  keyFn: (row: T) => string,
  ignoreFields: readonly string[] = ['id', 'output_id'],
): RowDiff<T> {
  const ignore = new Set(ignoreFields);
  const beforeMap = new Map<string, T>();
  for (const r of before) beforeMap.set(keyFn(r), r);
  const afterMap = new Map<string, T>();
  for (const r of after) afterMap.set(keyFn(r), r);

  const added: T[] = [];
  const removed: T[] = [];
  const changed: { before: T; after: T; fields: string[] }[] = [];
  const unchanged: T[] = [];

  for (const [k, a] of afterMap) {
    const b = beforeMap.get(k);
    if (!b) { added.push(a); continue; }
    const diffFields: string[] = [];
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (ignore.has(key)) continue;
      if (String(a[key] ?? '') !== String(b[key] ?? '')) diffFields.push(key);
    }
    if (diffFields.length > 0) changed.push({ before: b, after: a, fields: diffFields });
    else unchanged.push(a);
  }
  for (const [k, b] of beforeMap) {
    if (!afterMap.has(k)) removed.push(b);
  }
  return { added, removed, changed, unchanged };
}

export type ParsedTableKey =
  | 'parsed_processes'
  | 'parsed_connections'
  | 'parsed_logins'
  | 'parsed_interfaces'
  | 'parsed_mounts'
  | 'parsed_routes'
  | 'parsed_services'
  | 'parsed_arp'
  | 'parsed_user_history'
  | 'parsed_router_interfaces'
  | 'parsed_router_vlans'
  | 'parsed_router_static_routes'
  | 'parsed_router_acls'
  | 'parsed_router_nat_rules'
  | 'parsed_router_dhcp_pools'
  | 'parsed_router_users';

export const ROW_KEY_FNS: Record<ParsedTableKey, (r: Record<string, unknown>) => string> = {
  parsed_processes: r => `${r.pid}|${r.command}`,
  parsed_connections: r => `${r.protocol}|${r.local_addr}|${r.foreign_addr}`,
  parsed_logins: r => `${r.user}|${r.terminal}|${r.source_ip}|${r.login_time}`,
  parsed_interfaces: r => String(r.interface_name),
  parsed_mounts: r => `${r.device}|${r.mount_point}`,
  parsed_routes: r => String(r.destination),
  parsed_services: r => String(r.unit_name),
  parsed_arp: r => String(r.ip ?? ''),
  parsed_user_history: r => `${r.timestamp ?? ''}|${r.command}`,
  parsed_router_interfaces: r => String(r.interface_name),
  parsed_router_vlans: r => String(r.vlan_id),
  parsed_router_static_routes: r => String(r.destination),
  parsed_router_acls: r => `${r.acl_name}|${r.sequence ?? ''}`,
  parsed_router_nat_rules: r => `${r.nat_type}|${r.inside_src ?? ''}|${r.inside_port ?? ''}`,
  parsed_router_dhcp_pools: r => String(r.pool_name),
  parsed_router_users: r => String(r.username),
};
