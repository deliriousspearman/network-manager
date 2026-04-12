import { describe, it, expect } from 'vitest';
import { parseJuniperConfig } from './juniper.js';

describe('parseJuniperConfig', () => {
  it('parses a realistic show configuration | display set output', () => {
    const input = `set version 21.1R1.11
set system host-name vmx-01
set system domain-name example.com
set system time-zone Europe/London
set system ntp server 0.pool.ntp.org
set system ntp server 1.pool.ntp.org
set system login user user class super-user
set system login user user authentication encrypted-password "$6$abc"
set system login user readonly class read-only
set interfaces ge-0/0/0 description "WAN uplink"
set interfaces ge-0/0/0 unit 0 family inet address 203.0.113.10/24
set interfaces ge-0/0/1 description "LAN trunk"
set interfaces ge-0/0/1 vlan-tagging
set interfaces ge-0/0/1 unit 0 family inet address 192.168.1.1/24
set interfaces ge-0/0/1 unit 100 vlan-id 100
set interfaces ge-0/0/1 unit 100 description "IoT VLAN"
set interfaces ge-0/0/1 unit 100 family inet address 192.168.100.1/24
set interfaces ge-0/0/2 disable
set vlans v200 vlan-id 200
set routing-options static route 0.0.0.0/0 next-hop 203.0.113.1
set routing-options static route 0.0.0.0/0 preference 5
set routing-options static route 10.10.0.0/16 next-hop 192.168.1.254
set firewall family inet filter WAN_IN term 1 from source-address 10.0.0.0/8
set firewall family inet filter WAN_IN term 1 from protocol tcp
set firewall family inet filter WAN_IN term 1 from destination-port 443
set firewall family inet filter WAN_IN term 1 then accept
set firewall family inet filter WAN_IN term 2 then discard
set security nat source rule-set src-rs rule r1 match source-address 192.168.0.0/16
set security nat source rule-set src-rs rule r1 then source-nat interface
set security nat destination pool web-srv address 10.0.0.10/32
set security nat destination pool web-srv address port 80
set security nat destination rule-set dst-rs rule web match destination-address 203.0.113.10/32
set security nat destination rule-set dst-rs rule web match destination-port 8080
set security nat destination rule-set dst-rs rule web match protocol tcp
set security nat destination rule-set dst-rs rule web then destination-nat pool web-srv
set system services dhcp pool 192.168.1.0/24 router 192.168.1.1
set system services dhcp pool 192.168.1.0/24 name-server 8.8.8.8
set system services dhcp pool 192.168.1.0/24 name-server 8.8.4.4
set system services dhcp pool 192.168.1.0/24 domain-name example.com`;

    const result = parseJuniperConfig(input);

    expect(result.metadata.os_version).toBe('21.1R1.11');
    expect(result.metadata.hostname).toBe('vmx-01');
    expect(result.metadata.domain).toBe('example.com');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.ntp_servers).toEqual(['0.pool.ntp.org', '1.pool.ntp.org']);

    // Interfaces: ge-0/0/0, ge-0/0/1, ge-0/0/1.100, ge-0/0/2 (4 unique names)
    expect(result.interfaces).toHaveLength(4);

    const wan = result.interfaces.find(i => i.interface_name === 'ge-0/0/0');
    expect(wan).toMatchObject({
      description: 'WAN uplink',
      ip_address: '203.0.113.10',
      subnet_mask: '255.255.255.0',
      admin_status: 'up',
    });

    const lan = result.interfaces.find(i => i.interface_name === 'ge-0/0/1');
    expect(lan).toMatchObject({
      description: 'LAN trunk',
      ip_address: '192.168.1.1',
    });

    const vif = result.interfaces.find(i => i.interface_name === 'ge-0/0/1.100');
    expect(vif).toMatchObject({
      description: 'IoT VLAN',
      ip_address: '192.168.100.1',
      vlan: 100,
    });

    const down = result.interfaces.find(i => i.interface_name === 'ge-0/0/2');
    expect(down?.admin_status).toBe('disabled');

    // Two VLANs: vlan 100 (from interface vlan-id) and vlan 200 (from vlans block)
    expect(result.vlans).toHaveLength(2);
    expect(result.vlans.find(v => v.vlan_id === 100)?.name).toBe('ge-0/0/1.100');
    expect(result.vlans.find(v => v.vlan_id === 200)?.name).toBe('v200');

    // Static routes: default + 10.10.0.0/16
    expect(result.static_routes).toHaveLength(2);
    const defaultRoute = result.static_routes.find(r => r.destination === '0.0.0.0');
    expect(defaultRoute).toMatchObject({
      mask: '0.0.0.0',
      next_hop: '203.0.113.1',
      admin_distance: 5,
    });

    // Two firewall terms in WAN_IN
    expect(result.acls).toHaveLength(2);
    const term1 = result.acls.find(a => a.sequence === 1);
    expect(term1).toMatchObject({
      acl_name: 'WAN_IN',
      action: 'accept',
      protocol: 'tcp',
      src: '10.0.0.0/8',
      dst_port: '443',
    });
    const term2 = result.acls.find(a => a.sequence === 2);
    expect(term2?.action).toBe('drop');

    // NAT: source rule + destination rule with pool resolution
    expect(result.nat_rules).toHaveLength(2);
    const srcNat = result.nat_rules.find(n => n.nat_type === 'source');
    expect(srcNat?.inside_src).toBe('192.168.0.0/16');
    const dstNat = result.nat_rules.find(n => n.nat_type === 'destination');
    expect(dstNat).toMatchObject({
      protocol: 'tcp',
      outside_src: '203.0.113.10',
      outside_port: '8080',
      // Pool reference resolved to inside_src / inside_port
      inside_src: '10.0.0.10',
      inside_port: '80',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toEqual({
      pool_name: '192.168.1.0/24',
      network: '192.168.1.0',
      netmask: '255.255.255.0',
      default_router: '192.168.1.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
      lease_time: null,
      domain_name: 'example.com',
    });

    expect(result.users).toHaveLength(2);
    const user = result.users.find(u => u.username === 'user');
    expect(user).toEqual({ username: 'user', privilege: 15, auth_method: 'hash' });
    const ro = result.users.find(u => u.username === 'readonly');
    expect(ro?.privilege).toBe(5);
  });

  it('returns empty result for empty input', () => {
    const result = parseJuniperConfig('');
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.metadata.hostname).toBeNull();
  });

  it('skips malformed lines without aborting parse', () => {
    const input = `set system host-name vmx-01
this is total garbage
set interfaces ge-0/0/0 unit 0 family inet address 10.0.0.1/24`;

    const result = parseJuniperConfig(input);
    expect(result.metadata.hostname).toBe('vmx-01');
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
  });

  it('skips comment lines', () => {
    const input = `# Generated by JunOS
set system host-name vmx-01`;
    const result = parseJuniperConfig(input);
    expect(result.metadata.hostname).toBe('vmx-01');
  });
});
