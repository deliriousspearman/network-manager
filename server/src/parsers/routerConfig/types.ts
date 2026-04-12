// Row types for the router config parser output. These match the DB columns
// on the parsed_router_* tables (minus id / config_id which are set by the route layer).

export interface RouterConfigMetadata {
  hostname: string | null;
  os_version: string | null;
  model: string | null;
  domain: string | null;
  timezone: string | null;
  ntp_servers: string[];
}

export interface RouterInterfaceRow {
  interface_name: string;
  description: string | null;
  ip_address: string | null;
  subnet_mask: string | null;
  vlan: number | null;
  admin_status: string | null;
  mac_address: string | null;
}

export interface RouterVlanRow {
  vlan_id: number;
  name: string | null;
}

export interface RouterStaticRouteRow {
  destination: string;
  mask: string | null;
  next_hop: string | null;
  metric: number | null;
  admin_distance: number | null;
}

export interface RouterAclRow {
  acl_name: string;
  sequence: number | null;
  action: string;
  protocol: string | null;
  src: string | null;
  src_port: string | null;
  dst: string | null;
  dst_port: string | null;
}

export interface RouterNatRuleRow {
  nat_type: string;
  protocol: string | null;
  inside_src: string | null;
  inside_port: string | null;
  outside_src: string | null;
  outside_port: string | null;
}

export interface RouterDhcpPoolRow {
  pool_name: string;
  network: string | null;
  netmask: string | null;
  default_router: string | null;
  dns_servers: string[];
  lease_time: string | null;
  domain_name: string | null;
}

export interface RouterUserRow {
  username: string;
  privilege: number | null;
  auth_method: string | null;
}

export interface ParsedRouterConfig {
  metadata: RouterConfigMetadata;
  interfaces: RouterInterfaceRow[];
  vlans: RouterVlanRow[];
  static_routes: RouterStaticRouteRow[];
  acls: RouterAclRow[];
  nat_rules: RouterNatRuleRow[];
  dhcp_pools: RouterDhcpPoolRow[];
  users: RouterUserRow[];
}
