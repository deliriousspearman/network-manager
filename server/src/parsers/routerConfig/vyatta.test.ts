import { describe, it, expect } from 'vitest';
import { parseVyattaConfig } from './vyatta.js';

describe('parseVyattaConfig', () => {
  it('parses a realistic VyOS / EdgeOS show-configuration-commands output', () => {
    const input = `set system host-name router1
set system time-zone Europe/London
set system domain-name example.com
set system ntp server pool.ntp.org
set system ntp server time.google.com
set system login user user level admin
set system login user user authentication encrypted-password '$6$abc'
set system login user monitor level operator
set interfaces ethernet eth0 description 'WAN uplink'
set interfaces ethernet eth0 address 10.0.0.1/24
set interfaces ethernet eth0 mac aa:bb:cc:dd:ee:ff
set interfaces ethernet eth1 disable
set interfaces ethernet eth1 vif 100 address 192.168.100.1/24
set interfaces ethernet eth1 vif 100 description 'VLAN 100'
set protocols static route 0.0.0.0/0 next-hop 10.0.0.254 distance 1
set protocols static route 10.10.0.0/16 next-hop 10.0.0.253
set firewall name WAN_IN rule 10 action accept
set firewall name WAN_IN rule 10 protocol tcp
set firewall name WAN_IN rule 10 source address 10.0.0.0/8
set firewall name WAN_IN rule 10 destination port 80
set firewall name WAN_IN rule 20 action drop
set service nat rule 10 type masquerade
set service nat rule 10 outbound-interface eth0
set service nat rule 20 type destination
set service nat rule 20 protocol tcp
set service nat rule 20 destination port 8080
set service nat rule 20 inside-address address 10.0.0.10
set service nat rule 20 inside-address port 80
set service dhcp-server shared-network-name LAN subnet 10.0.0.0/24 default-router 10.0.0.1
set service dhcp-server shared-network-name LAN subnet 10.0.0.0/24 dns-server 8.8.8.8
set service dhcp-server shared-network-name LAN subnet 10.0.0.0/24 dns-server 8.8.4.4
set service dhcp-server shared-network-name LAN subnet 10.0.0.0/24 lease 86400`;

    const result = parseVyattaConfig(input);

    expect(result.metadata.hostname).toBe('router1');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.domain).toBe('example.com');
    expect(result.metadata.ntp_servers).toEqual(['pool.ntp.org', 'time.google.com']);

    // Interfaces: eth0, eth1, eth1.100
    expect(result.interfaces).toHaveLength(3);
    const eth0 = result.interfaces.find(i => i.interface_name === 'eth0');
    expect(eth0?.description).toBe('WAN uplink');
    expect(eth0?.ip_address).toBe('10.0.0.1');
    expect(eth0?.subnet_mask).toBe('255.255.255.0');
    expect(eth0?.mac_address).toBe('aa:bb:cc:dd:ee:ff');
    expect(eth0?.admin_status).toBe('up');

    const eth1 = result.interfaces.find(i => i.interface_name === 'eth1');
    expect(eth1?.admin_status).toBe('disabled');

    const vif = result.interfaces.find(i => i.interface_name === 'eth1.100');
    expect(vif?.vlan).toBe(100);
    expect(vif?.ip_address).toBe('192.168.100.1');
    expect(vif?.description).toBe('VLAN 100');

    expect(result.vlans).toEqual([{ vlan_id: 100, name: 'eth1.100' }]);

    expect(result.static_routes).toHaveLength(2);
    expect(result.static_routes[0]).toEqual({
      destination: '0.0.0.0',
      mask: '0.0.0.0',
      next_hop: '10.0.0.254',
      metric: null,
      admin_distance: 1,
    });

    // Two firewall rules in WAN_IN, merged from multiple set lines
    expect(result.acls).toHaveLength(2);
    const rule10 = result.acls.find(a => a.sequence === 10);
    expect(rule10).toMatchObject({
      acl_name: 'WAN_IN',
      action: 'accept',
      protocol: 'tcp',
      src: '10.0.0.0/8',
      dst_port: '80',
    });
    const rule20 = result.acls.find(a => a.sequence === 20);
    expect(rule20?.action).toBe('drop');

    // NAT: rule 10 masquerade, rule 20 destination NAT
    expect(result.nat_rules).toHaveLength(2);
    const nat10 = result.nat_rules.find(n => n.nat_type === 'masquerade');
    expect(nat10).toBeDefined();
    const nat20 = result.nat_rules.find(n => n.nat_type === 'destination');
    expect(nat20).toMatchObject({
      protocol: 'tcp',
      outside_port: '80',
      outside_src: '10.0.0.10',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toEqual({
      pool_name: 'LAN',
      network: '10.0.0.0',
      netmask: '255.255.255.0',
      default_router: '10.0.0.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
      lease_time: '86400',
      domain_name: null,
    });

    expect(result.users).toHaveLength(2);
    const user = result.users.find(u => u.username === 'user');
    expect(user).toEqual({ username: 'user', privilege: 15, auth_method: 'hash' });
    const monitor = result.users.find(u => u.username === 'monitor');
    expect(monitor?.privilege).toBe(5);
  });

  it('handles modern VyOS firewall ipv4 prefix', () => {
    const input = `set firewall ipv4 name WAN_IN rule 10 action accept
set firewall ipv4 name WAN_IN rule 10 protocol tcp`;

    const result = parseVyattaConfig(input);
    expect(result.acls).toHaveLength(1);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'WAN_IN',
      sequence: 10,
      action: 'accept',
      protocol: 'tcp',
    });
  });

  it('handles modern VyOS nat source/destination form', () => {
    const input = `set nat source rule 10 outbound-interface eth0
set nat source rule 10 translation address masquerade
set nat destination rule 20 inbound-interface eth0
set nat destination rule 20 destination port 8080
set nat destination rule 20 translation address 10.0.0.10
set nat destination rule 20 translation port 80`;

    const result = parseVyattaConfig(input);
    expect(result.nat_rules).toHaveLength(2);
    const dest = result.nat_rules.find(n => n.nat_type === 'destination');
    expect(dest).toMatchObject({
      outside_src: '10.0.0.10',
      outside_port: '80',
    });
  });

  it('returns empty result for empty input', () => {
    const result = parseVyattaConfig('');
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.metadata.hostname).toBeNull();
  });

  it('handles a UniFi gateway config (mca-cli show configuration)', () => {
    // UniFi gateways (UDM/UXG/USG) are EdgeOS-derived, so the same parser handles
    // them. UniFi-specific keys like `mca-` options should be silently ignored.
    const input = `set system host-name UDM-Pro
set system time-zone Europe/London
set system gateway-mac aa:bb:cc:dd:ee:ff
set system login user ubnt level admin
set system login user ubnt authentication encrypted-password '$6$xyz'
set interfaces ethernet eth8 description 'WAN'
set interfaces ethernet eth8 address 203.0.113.10/24
set interfaces ethernet eth9 description 'LAN'
set interfaces ethernet eth9 address 192.168.1.1/24
set interfaces ethernet eth9 vif 20 address 192.168.20.1/24
set interfaces ethernet eth9 vif 20 description 'IoT VLAN'
set protocols static route 0.0.0.0/0 next-hop 203.0.113.1
set firewall name WAN_IN rule 1 action accept
set firewall name WAN_IN rule 1 protocol tcp
set firewall name WAN_IN rule 1 destination port 443
set service nat rule 6001 type masquerade
set service nat rule 6001 outbound-interface eth8
set service dhcp-server shared-network-name LAN subnet 192.168.1.0/24 default-router 192.168.1.1
set service dhcp-server shared-network-name LAN subnet 192.168.1.0/24 dns-server 192.168.1.1
set service mca-monitor enable
set service ubnt-discover disable`;

    const result = parseVyattaConfig(input);

    expect(result.metadata.hostname).toBe('UDM-Pro');
    expect(result.metadata.timezone).toBe('Europe/London');

    // eth8, eth9, eth9.20
    expect(result.interfaces).toHaveLength(3);
    const wan = result.interfaces.find(i => i.interface_name === 'eth8');
    expect(wan?.ip_address).toBe('203.0.113.10');
    expect(wan?.description).toBe('WAN');

    const vif = result.interfaces.find(i => i.interface_name === 'eth9.20');
    expect(vif?.vlan).toBe(20);
    expect(vif?.ip_address).toBe('192.168.20.1');

    expect(result.vlans).toEqual([{ vlan_id: 20, name: 'eth9.20' }]);
    expect(result.static_routes).toHaveLength(1);
    expect(result.acls).toHaveLength(1);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'WAN_IN',
      sequence: 1,
      action: 'accept',
      dst_port: '443',
    });
    expect(result.nat_rules).toHaveLength(1);
    expect(result.nat_rules[0].nat_type).toBe('masquerade');
    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0].default_router).toBe('192.168.1.1');
    expect(result.users).toEqual([
      { username: 'ubnt', privilege: 15, auth_method: 'hash' },
    ]);
  });

  it('skips malformed lines without aborting parse', () => {
    const input = `set system host-name router1
this line is total garbage
set interfaces ethernet eth0 address 10.0.0.1/24`;

    const result = parseVyattaConfig(input);
    expect(result.metadata.hostname).toBe('router1');
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
  });
});
