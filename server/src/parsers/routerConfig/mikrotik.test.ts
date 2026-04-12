import { describe, it, expect } from 'vitest';
import { parseMikrotikConfig } from './mikrotik.js';

describe('parseMikrotikConfig', () => {
  it('parses a realistic /export script', () => {
    const input = `# jan/02/1970 00:00:00 by RouterOS 6.49.10
# software id = ABCD-EFGH
#
/system identity
set name=router1
/system clock
set time-zone-name=Europe/London
/system ntp client
set enabled=yes server-dns-names=pool.ntp.org,time.google.com
/interface ethernet
set [ find default-name=ether1 ] comment="WAN uplink" name=ether1-WAN
set [ find default-name=ether2 ] disabled=yes name=ether2
/interface vlan
add interface=ether1-WAN name=vlan100 vlan-id=100
/ip address
add address=192.168.1.1/24 interface=ether1-WAN network=192.168.1.0
add address=10.0.0.1/24 interface=vlan100 network=10.0.0.0
/ip route
add distance=1 dst-address=0.0.0.0/0 gateway=192.168.1.254
add distance=2 dst-address=10.10.0.0/16 gateway=10.0.0.254
/ip firewall filter
add action=accept chain=input protocol=icmp
add action=drop chain=input src-address=192.168.99.0/24
/ip firewall nat
add action=masquerade chain=srcnat out-interface=ether1-WAN
add action=dst-nat chain=dstnat dst-port=8080 protocol=tcp to-addresses=10.0.0.10 to-ports=80
/ip dhcp-server network
add address=192.168.1.0/24 comment="LAN pool" dns-server=8.8.8.8,8.8.4.4 gateway=192.168.1.1
/user
add group=full name=admin password=secret
add group=read name=monitor`;

    const result = parseMikrotikConfig(input);

    expect(result.metadata.hostname).toBe('router1');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.os_version).toBe('6.49.10');
    expect(result.metadata.ntp_servers).toEqual(['pool.ntp.org', 'time.google.com']);

    // Interfaces: ether1-WAN, ether2, vlan100 (3 unique names)
    expect(result.interfaces).toHaveLength(3);
    const wan = result.interfaces.find(i => i.interface_name === 'ether1-WAN');
    expect(wan?.description).toBe('WAN uplink');
    expect(wan?.ip_address).toBe('192.168.1.1');
    expect(wan?.subnet_mask).toBe('255.255.255.0');
    expect(wan?.admin_status).toBe('up');

    const ether2 = result.interfaces.find(i => i.interface_name === 'ether2');
    expect(ether2?.admin_status).toBe('disabled');

    const vlan = result.interfaces.find(i => i.interface_name === 'vlan100');
    expect(vlan?.vlan).toBe(100);
    expect(vlan?.ip_address).toBe('10.0.0.1');

    expect(result.vlans).toEqual([{ vlan_id: 100, name: 'vlan100' }]);

    expect(result.static_routes).toHaveLength(2);
    expect(result.static_routes[0]).toEqual({
      destination: '0.0.0.0',
      mask: '0.0.0.0',
      next_hop: '192.168.1.254',
      metric: null,
      admin_distance: 1,
    });

    expect(result.acls).toHaveLength(2);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'input',
      action: 'accept',
      protocol: 'icmp',
    });
    expect(result.acls[1]).toMatchObject({
      acl_name: 'input',
      action: 'drop',
      src: '192.168.99.0/24',
    });

    expect(result.nat_rules).toHaveLength(2);
    expect(result.nat_rules[0]).toMatchObject({
      nat_type: 'srcnat',
      protocol: null,
    });
    // dstnat port forward: WAN port 8080 -> LAN 10.0.0.10:80
    expect(result.nat_rules[1]).toMatchObject({
      nat_type: 'dstnat',
      protocol: 'tcp',
      outside_port: '8080',
      inside_src: '10.0.0.10',
      inside_port: '80',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toEqual({
      pool_name: 'LAN pool',
      network: '192.168.1.0',
      netmask: '255.255.255.0',
      default_router: '192.168.1.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
      lease_time: null,
      domain_name: null,
    });

    expect(result.users).toEqual([
      { username: 'admin', privilege: 15, auth_method: 'password' },
      { username: 'monitor', privilege: 5, auth_method: null },
    ]);
  });

  it('handles inline path+command form', () => {
    const input = `/ip address add address=10.0.0.1/24 interface=ether1
/ip route add dst-address=0.0.0.0/0 gateway=10.0.0.254`;

    const result = parseMikrotikConfig(input);
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
    expect(result.static_routes).toHaveLength(1);
  });

  it('folds backslash continuation lines', () => {
    const input = `/ip firewall filter
add action=drop chain=input \\
    protocol=tcp \\
    src-address=10.0.0.0/8`;

    const result = parseMikrotikConfig(input);
    expect(result.acls).toHaveLength(1);
    expect(result.acls[0]).toMatchObject({
      action: 'drop',
      protocol: 'tcp',
      src: '10.0.0.0/8',
    });
  });

  it('returns empty result for empty input', () => {
    const result = parseMikrotikConfig('');
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.metadata.hostname).toBeNull();
  });

  it('skips malformed lines without aborting parse', () => {
    const input = `/system identity
set name=router1
this is total garbage that should be ignored
/ip address
add address=10.0.0.1/24 interface=ether1`;

    const result = parseMikrotikConfig(input);
    expect(result.metadata.hostname).toBe('router1');
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
  });
});
