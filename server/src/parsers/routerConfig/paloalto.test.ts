import { describe, it, expect } from 'vitest';
import { parsePaloAltoConfig } from './paloalto.js';

describe('parsePaloAltoConfig', () => {
  it('parses a realistic PAN-OS set-format config', () => {
    const input = `set deviceconfig system hostname pa-fw-01
set deviceconfig system domain example.com
set deviceconfig system timezone Europe/London
set deviceconfig system ntp-servers primary-ntp ntp-server-address 0.pool.ntp.org
set deviceconfig system ntp-servers secondary-ntp ntp-server-address 1.pool.ntp.org
set network interface ethernet ethernet1/1 layer3 ip 203.0.113.10/24
set network interface ethernet ethernet1/1 comment "WAN uplink"
set network interface ethernet ethernet1/1 link-state up
set network interface ethernet ethernet1/2 layer3 ip 192.168.1.1/24
set network interface ethernet ethernet1/2 comment LAN
set network interface ethernet ethernet1/2 layer3 units ethernet1/2.10 ip 192.168.10.1/24
set network interface ethernet ethernet1/2 layer3 units ethernet1/2.10 tag 10
set network interface ethernet ethernet1/2 layer3 units ethernet1/2.10 comment "IoT VLAN"
set network virtual-router default routing-table ip static-route default-route destination 0.0.0.0/0
set network virtual-router default routing-table ip static-route default-route nexthop ip-address 203.0.113.1
set network virtual-router default routing-table ip static-route default-route metric 10
set network virtual-router default routing-table ip static-route default-route admin-dist 1
set address WEB_SERVER ip-netmask 10.0.0.10/32
set address LAN_NET ip-netmask 192.168.1.0/24
set rulebase security rules "Allow HTTPS" from trust
set rulebase security rules "Allow HTTPS" to untrust
set rulebase security rules "Allow HTTPS" source LAN_NET
set rulebase security rules "Allow HTTPS" destination any
set rulebase security rules "Allow HTTPS" service application-default
set rulebase security rules "Allow HTTPS" application web-browsing
set rulebase security rules "Allow HTTPS" action allow
set rulebase security rules "Block Tor" from any
set rulebase security rules "Block Tor" to any
set rulebase security rules "Block Tor" source any
set rulebase security rules "Block Tor" destination any
set rulebase security rules "Block Tor" action deny
set rulebase nat rules "Outbound" from trust
set rulebase nat rules "Outbound" to untrust
set rulebase nat rules "Outbound" source LAN_NET
set rulebase nat rules "Outbound" destination any
set rulebase nat rules "Outbound" service any
set rulebase nat rules "Outbound" source-translation dynamic-ip-and-port interface-address interface ethernet1/1
set rulebase nat rules "WebForward" from untrust
set rulebase nat rules "WebForward" to untrust
set rulebase nat rules "WebForward" source any
set rulebase nat rules "WebForward" destination 203.0.113.10
set rulebase nat rules "WebForward" service service-https
set rulebase nat rules "WebForward" destination-translation translated-address WEB_SERVER
set rulebase nat rules "WebForward" destination-translation translated-port 8080
set network dhcp interface ethernet1/2 server ip-pool 192.168.1.100-192.168.1.200
set network dhcp interface ethernet1/2 server option default-gateway 192.168.1.1
set network dhcp interface ethernet1/2 server option subnet-mask 255.255.255.0
set network dhcp interface ethernet1/2 server option dns primary 8.8.8.8
set network dhcp interface ethernet1/2 server option dns secondary 8.8.4.4
set network dhcp interface ethernet1/2 server option lease timeout 86400
set network dhcp interface ethernet1/2 server option dns-suffix example.com
set mgt-config users admin permissions role-based superuser yes
set mgt-config users admin phash $1$abcdefghij$klmnopqrstuvwxyz
set mgt-config users readonly permissions role-based custom profile read-only-admin
set mgt-config users readonly phash $1$zyxwvutsrq$ponmlkjihgfedcba`;

    const result = parsePaloAltoConfig(input);

    expect(result.metadata.hostname).toBe('pa-fw-01');
    expect(result.metadata.domain).toBe('example.com');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.ntp_servers).toEqual(['0.pool.ntp.org', '1.pool.ntp.org']);

    // 2 physical interfaces + 1 sub-interface
    expect(result.interfaces).toHaveLength(3);
    const wan = result.interfaces.find(i => i.interface_name === 'ethernet1/1');
    expect(wan).toMatchObject({
      description: 'WAN uplink',
      ip_address: '203.0.113.10',
      subnet_mask: '255.255.255.0',
      admin_status: 'up',
    });
    const lan = result.interfaces.find(i => i.interface_name === 'ethernet1/2');
    expect(lan).toMatchObject({
      description: 'LAN',
      ip_address: '192.168.1.1',
      subnet_mask: '255.255.255.0',
    });
    const vif = result.interfaces.find(i => i.interface_name === 'ethernet1/2.10');
    expect(vif).toMatchObject({
      description: 'IoT VLAN',
      ip_address: '192.168.10.1',
      vlan: 10,
    });

    expect(result.vlans).toHaveLength(1);
    expect(result.vlans[0]).toEqual({ vlan_id: 10, name: 'ethernet1/2.10' });

    expect(result.static_routes).toHaveLength(1);
    expect(result.static_routes[0]).toMatchObject({
      destination: '0.0.0.0',
      mask: '0.0.0.0',
      next_hop: '203.0.113.1',
      metric: 10,
      admin_distance: 1,
    });

    expect(result.acls).toHaveLength(2);
    const allow = result.acls.find(a => a.acl_name === 'Allow HTTPS');
    expect(allow).toMatchObject({
      sequence: 1,
      action: 'allow',
      protocol: 'web-browsing',
      // LAN_NET resolved post-pass via address objects
      src: '192.168.1.0/24',
      dst: 'any',
      dst_port: 'application-default',
    });
    const block = result.acls.find(a => a.acl_name === 'Block Tor');
    expect(block).toMatchObject({
      sequence: 2,
      action: 'deny',
      src: 'any',
      dst: 'any',
    });

    expect(result.nat_rules).toHaveLength(2);
    const snat = result.nat_rules.find(n => n.nat_type === 'source');
    expect(snat).toMatchObject({
      // LAN_NET resolved
      inside_src: '192.168.1.0/24',
      outside_src: 'ethernet1/1',
    });
    const dnat = result.nat_rules.find(n => n.nat_type === 'destination');
    expect(dnat).toMatchObject({
      protocol: 'service-https',
      outside_src: '203.0.113.10',
      // WEB_SERVER resolved
      inside_src: '10.0.0.10/32',
      inside_port: '8080',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toEqual({
      pool_name: 'ethernet1/2',
      // network filled from the matching interface row in post-pass
      network: '192.168.1.1',
      // explicit subnet-mask option overrides interface lookup
      netmask: '255.255.255.0',
      default_router: '192.168.1.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
      lease_time: '86400',
      domain_name: 'example.com',
    });

    expect(result.users).toHaveLength(2);
    const admin = result.users.find(u => u.username === 'admin');
    expect(admin).toEqual({ username: 'admin', privilege: 15, auth_method: 'hash' });
    const ro = result.users.find(u => u.username === 'readonly');
    expect(ro).toEqual({ username: 'readonly', privilege: 5, auth_method: 'hash' });

    // Sanity: phash values must never leak into output
    expect(JSON.stringify(result)).not.toContain('$1$');
  });

  it('strips a vsys vsys1 prefix transparently', () => {
    const input = `set vsys vsys1 address LAN_NET ip-netmask 10.0.0.0/24
set vsys vsys1 rulebase security rules "Allow All" action allow
set vsys vsys1 rulebase security rules "Allow All" source LAN_NET
set vsys vsys1 rulebase security rules "Allow All" destination any
set vsys vsys1 mgt-config users admin permissions role-based superuser yes
set vsys vsys1 mgt-config users admin phash $1$abc`;

    const result = parsePaloAltoConfig(input);

    expect(result.acls).toHaveLength(1);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'Allow All',
      action: 'allow',
      // Address object resolved post-pass even under vsys
      src: '10.0.0.0/24',
      dst: 'any',
    });
    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toEqual({
      username: 'admin',
      privilege: 15,
      auth_method: 'hash',
    });
  });

  it('returns empty result for empty input', () => {
    const result = parsePaloAltoConfig('');
    expect(result.metadata.hostname).toBeNull();
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.users).toEqual([]);
  });

  it('skips comment and malformed lines without aborting', () => {
    const input = `# this is a comment
this line is total garbage with no set prefix and no path
set deviceconfig system hostname pa-fw-01
set network interface ethernet ethernet1/1 layer3 ip 10.0.0.1/24`;
    const result = parsePaloAltoConfig(input);
    expect(result.metadata.hostname).toBe('pa-fw-01');
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
  });
});
