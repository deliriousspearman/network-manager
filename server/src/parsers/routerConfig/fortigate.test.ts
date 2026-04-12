import { describe, it, expect } from 'vitest';
import { parseFortigateConfig } from './fortigate.js';

describe('parseFortigateConfig', () => {
  it('parses a realistic FortiGate config backup', () => {
    const input = `#config-version=FGT60E-7.0.5-FW-build0303-211210:opmode=0:vdom=0
#conf_file_ver=12345
config system global
    set hostname "fw-edge-01"
    set timezone "Europe/London"
    set admin-port 443
end
config system ntp
    set ntpsync enable
    set type custom
    config ntpserver
        edit 1
            set server "pool.ntp.org"
        next
        edit 2
            set server "time.google.com"
        next
    end
end
config system interface
    edit "wan1"
        set vdom "root"
        set ip 203.0.113.10 255.255.255.0
        set type physical
        set description "WAN uplink"
        set role wan
    next
    edit "internal"
        set vdom "root"
        set ip 192.168.1.1 255.255.255.0
        set type hard-switch
        set description "LAN"
    next
    edit "internal.100"
        set vdom "root"
        set vlanid 100
        set interface "internal"
        set ip 192.168.100.1 255.255.255.0
        set description "IoT VLAN"
    next
    edit "lan-down"
        set vdom "root"
        set status down
    next
end
config router static
    edit 1
        set dst 0.0.0.0 0.0.0.0
        set gateway 203.0.113.1
        set device "wan1"
        set distance 10
    next
    edit 2
        set dst 10.10.0.0 255.255.0.0
        set gateway 192.168.1.254
    next
end
config firewall policy
    edit 1
        set name "WAN-to-LAN-HTTPS"
        set srcintf "wan1"
        set dstintf "internal"
        set srcaddr "all"
        set dstaddr "web-server"
        set action accept
        set service "HTTPS"
    next
    edit 2
        set name "Block-IoT-out"
        set srcintf "internal.100"
        set dstintf "wan1"
        set srcaddr "all"
        set dstaddr "all"
        set action deny
        set service "ALL"
    next
end
config firewall vip
    edit "web-server"
        set extip 203.0.113.10
        set mappedip "10.0.0.10"
        set extintf "wan1"
        set portforward enable
        set protocol tcp
        set extport 8080
        set mappedport 80
    next
end
config system dhcp server
    edit 1
        set interface "internal"
        set default-gateway 192.168.1.1
        set netmask 255.255.255.0
        set dns-server1 192.168.1.1
        set dns-server2 8.8.8.8
    next
end
config system admin
    edit "admin"
        set accprofile "super_admin"
        set password ENC AK1abcDEFghi==
    next
    edit "readonly"
        set accprofile "prof_admin"
        set password ENC AK1xyz==
    next
end`;

    const result = parseFortigateConfig(input);

    expect(result.metadata.hostname).toBe('fw-edge-01');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.model).toBe('FGT60E');
    expect(result.metadata.os_version).toBe('7.0.5');
    expect(result.metadata.ntp_servers).toEqual(['pool.ntp.org', 'time.google.com']);

    // 4 interfaces
    expect(result.interfaces).toHaveLength(4);
    const wan = result.interfaces.find(i => i.interface_name === 'wan1');
    expect(wan).toMatchObject({
      ip_address: '203.0.113.10',
      subnet_mask: '255.255.255.0',
      description: 'WAN uplink',
      admin_status: 'up',
    });
    const vif = result.interfaces.find(i => i.interface_name === 'internal.100');
    expect(vif?.vlan).toBe(100);
    expect(vif?.ip_address).toBe('192.168.100.1');
    const down = result.interfaces.find(i => i.interface_name === 'lan-down');
    expect(down?.admin_status).toBe('down');

    expect(result.vlans).toEqual([{ vlan_id: 100, name: 'internal.100' }]);

    expect(result.static_routes).toHaveLength(2);
    expect(result.static_routes[0]).toEqual({
      destination: '0.0.0.0',
      mask: '0.0.0.0',
      next_hop: '203.0.113.1',
      metric: null,
      admin_distance: 10,
    });

    expect(result.acls).toHaveLength(2);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'WAN-to-LAN-HTTPS',
      sequence: 1,
      action: 'accept',
      protocol: 'HTTPS',
      src: 'all',
      dst: 'web-server',
    });
    expect(result.acls[1]).toMatchObject({
      acl_name: 'Block-IoT-out',
      sequence: 2,
      action: 'deny',
    });

    expect(result.nat_rules).toHaveLength(1);
    expect(result.nat_rules[0]).toEqual({
      nat_type: 'destination',
      protocol: 'tcp',
      inside_src: '10.0.0.10',
      inside_port: '80',
      outside_src: '203.0.113.10',
      outside_port: '8080',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toMatchObject({
      pool_name: 'internal',
      netmask: '255.255.255.0',
      default_router: '192.168.1.1',
      dns_servers: ['192.168.1.1', '8.8.8.8'],
    });

    expect(result.users).toHaveLength(2);
    const admin = result.users.find(u => u.username === 'admin');
    expect(admin).toEqual({ username: 'admin', privilege: 15, auth_method: 'hash' });
    const ro = result.users.find(u => u.username === 'readonly');
    expect(ro?.privilege).toBe(10);
  });

  it('returns empty result for empty input', () => {
    const result = parseFortigateConfig('');
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.metadata.hostname).toBeNull();
  });

  it('skips malformed lines without aborting parse', () => {
    const input = `config system global
    set hostname "fw1"
end
this is total garbage
config system interface
    edit "wan1"
        set ip 10.0.0.1 255.255.255.0
    next
end`;

    const result = parseFortigateConfig(input);
    expect(result.metadata.hostname).toBe('fw1');
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].ip_address).toBe('10.0.0.1');
  });

  it('handles missing `next` before `end`', () => {
    // Some configs may forget the trailing `next` — finalizeItem should still
    // close the open item when `end` is hit.
    const input = `config system interface
    edit "wan1"
        set ip 10.0.0.1 255.255.255.0
end`;

    const result = parseFortigateConfig(input);
    expect(result.interfaces).toHaveLength(1);
    expect(result.interfaces[0].interface_name).toBe('wan1');
  });
});
