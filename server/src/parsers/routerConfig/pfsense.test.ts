import { describe, it, expect } from 'vitest';
import { parsePfsenseConfig } from './pfsense.js';

describe('parsePfsenseConfig', () => {
  it('parses a realistic pfSense config.xml', () => {
    const input = `<?xml version="1.0"?>
<pfsense>
  <version>22.05</version>
  <system>
    <hostname>pfsense</hostname>
    <domain>example.lan</domain>
    <timezone>Europe/London</timezone>
    <timeservers>0.pool.ntp.org 1.pool.ntp.org</timeservers>
    <user>
      <name>admin</name>
      <scope>system</scope>
      <bcrypt-hash>$2y$10$abcdefghijklmnopqrstuv</bcrypt-hash>
    </user>
    <user>
      <name>user</name>
      <scope>user</scope>
      <bcrypt-hash>$2y$10$wvutsrqponmlkjihgfedcba</bcrypt-hash>
    </user>
  </system>
  <interfaces>
    <wan>
      <if>igb0</if>
      <descr>WAN uplink</descr>
      <enable></enable>
      <ipaddr>203.0.113.10</ipaddr>
      <subnet>24</subnet>
    </wan>
    <lan>
      <if>igb1</if>
      <descr>LAN</descr>
      <enable></enable>
      <ipaddr>192.168.1.1</ipaddr>
      <subnet>24</subnet>
    </lan>
  </interfaces>
  <vlans>
    <vlan>
      <if>igb1</if>
      <tag>100</tag>
      <descr>IoT VLAN</descr>
      <vlanif>igb1.100</vlanif>
    </vlan>
  </vlans>
  <gateways>
    <gateway_item>
      <name>WAN_GW</name>
      <gateway>203.0.113.1</gateway>
      <interface>wan</interface>
    </gateway_item>
  </gateways>
  <staticroutes>
    <route>
      <network>10.0.0.0/8</network>
      <gateway>WAN_GW</gateway>
    </route>
  </staticroutes>
  <filter>
    <rule>
      <type>pass</type>
      <interface>wan</interface>
      <protocol>tcp</protocol>
      <source>
        <any></any>
      </source>
      <destination>
        <network>(self)</network>
        <port>443</port>
      </destination>
    </rule>
    <rule>
      <type>block</type>
      <interface>wan</interface>
      <protocol>tcp</protocol>
      <source>
        <address>10.0.0.0/8</address>
      </source>
      <destination>
        <any></any>
      </destination>
    </rule>
  </filter>
  <nat>
    <rule>
      <protocol>tcp</protocol>
      <interface>wan</interface>
      <destination>
        <address>wanip</address>
        <port>8080</port>
      </destination>
      <target>10.0.0.50</target>
      <local-port>80</local-port>
    </rule>
    <outbound>
      <rule>
        <interface>wan</interface>
        <source>
          <network>192.168.1.0/24</network>
        </source>
        <target>203.0.113.10</target>
      </rule>
    </outbound>
  </nat>
  <dhcpd>
    <lan>
      <range>
        <from>192.168.1.100</from>
        <to>192.168.1.200</to>
      </range>
      <gateway>192.168.1.1</gateway>
      <dnsserver>8.8.8.8</dnsserver>
      <dnsserver>8.8.4.4</dnsserver>
      <defaultleasetime>86400</defaultleasetime>
      <domain>example.lan</domain>
    </lan>
  </dhcpd>
</pfsense>`;

    const result = parsePfsenseConfig(input);

    expect(result.metadata.hostname).toBe('pfsense');
    expect(result.metadata.domain).toBe('example.lan');
    expect(result.metadata.timezone).toBe('Europe/London');
    expect(result.metadata.os_version).toBe('22.05');
    expect(result.metadata.ntp_servers).toEqual(['0.pool.ntp.org', '1.pool.ntp.org']);

    expect(result.interfaces).toHaveLength(2);
    const wan = result.interfaces.find(i => i.interface_name === 'wan');
    expect(wan).toMatchObject({
      description: 'WAN uplink',
      ip_address: '203.0.113.10',
      subnet_mask: '255.255.255.0',
      admin_status: 'up',
    });
    const lan = result.interfaces.find(i => i.interface_name === 'lan');
    expect(lan).toMatchObject({
      description: 'LAN',
      ip_address: '192.168.1.1',
      subnet_mask: '255.255.255.0',
    });

    expect(result.vlans).toHaveLength(1);
    expect(result.vlans[0]).toEqual({ vlan_id: 100, name: 'IoT VLAN' });

    expect(result.static_routes).toHaveLength(1);
    expect(result.static_routes[0]).toMatchObject({
      destination: '10.0.0.0',
      mask: '255.0.0.0',
      // WAN_GW resolved against the <gateways> table
      next_hop: '203.0.113.1',
    });

    expect(result.acls).toHaveLength(2);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'wan',
      sequence: 1,
      action: 'pass',
      protocol: 'tcp',
      src: 'any',
      dst: '(self)',
      dst_port: '443',
    });
    expect(result.acls[1]).toMatchObject({
      acl_name: 'wan',
      sequence: 2,
      action: 'block',
      src: '10.0.0.0/8',
      dst: 'any',
    });

    expect(result.nat_rules).toHaveLength(2);
    const dnat = result.nat_rules.find(n => n.nat_type === 'destination');
    expect(dnat).toMatchObject({
      protocol: 'tcp',
      outside_src: 'wanip',
      outside_port: '8080',
      inside_src: '10.0.0.50',
      inside_port: '80',
    });
    const snat = result.nat_rules.find(n => n.nat_type === 'source');
    expect(snat).toMatchObject({
      inside_src: '192.168.1.0/24',
      outside_src: '203.0.113.10',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toEqual({
      pool_name: 'lan',
      network: '192.168.1.1',
      netmask: '255.255.255.0',
      default_router: '192.168.1.1',
      dns_servers: ['8.8.8.8', '8.8.4.4'],
      lease_time: '86400',
      domain_name: 'example.lan',
    });

    expect(result.users).toHaveLength(2);
    const admin = result.users.find(u => u.username === 'admin');
    expect(admin).toEqual({ username: 'admin', privilege: 15, auth_method: 'hash' });
    const user = result.users.find(u => u.username === 'user');
    expect(user).toEqual({ username: 'user', privilege: 5, auth_method: 'hash' });

    // Sanity: bcrypt hashes must never leak into any output field
    expect(JSON.stringify(result)).not.toContain('$2y$');
  });

  it('throws a clean error on empty input', () => {
    expect(() => parsePfsenseConfig('')).toThrow(/Invalid pfSense XML/);
  });

  it('returns empty result for empty <pfsense/> root', () => {
    const result = parsePfsenseConfig('<?xml version="1.0"?><pfsense/>');
    expect(result.metadata.hostname).toBeNull();
    expect(result.interfaces).toEqual([]);
    expect(result.vlans).toEqual([]);
    expect(result.static_routes).toEqual([]);
    expect(result.acls).toEqual([]);
    expect(result.nat_rules).toEqual([]);
    expect(result.dhcp_pools).toEqual([]);
    expect(result.users).toEqual([]);
  });

  it('handles single-element lists (isArray callback wired correctly)', () => {
    const input = `<?xml version="1.0"?>
<pfsense>
  <system>
    <user>
      <name>solo</name>
      <scope>user</scope>
      <bcrypt-hash>$2y$10$x</bcrypt-hash>
    </user>
  </system>
  <vlans>
    <vlan>
      <tag>42</tag>
      <descr>only vlan</descr>
    </vlan>
  </vlans>
  <filter>
    <rule>
      <type>pass</type>
      <interface>lan</interface>
    </rule>
  </filter>
</pfsense>`;
    const result = parsePfsenseConfig(input);
    expect(result.users).toHaveLength(1);
    expect(result.users[0].username).toBe('solo');
    expect(result.vlans).toHaveLength(1);
    expect(result.vlans[0]).toEqual({ vlan_id: 42, name: 'only vlan' });
    expect(result.acls).toHaveLength(1);
    expect(result.acls[0].acl_name).toBe('lan');
  });

  it('preserves unresolved gateway names in static routes', () => {
    const input = `<?xml version="1.0"?>
<pfsense>
  <staticroutes>
    <route>
      <network>10.99.0.0/24</network>
      <gateway>NONEXISTENT_GW</gateway>
    </route>
  </staticroutes>
</pfsense>`;
    const result = parsePfsenseConfig(input);
    expect(result.static_routes).toHaveLength(1);
    expect(result.static_routes[0]).toMatchObject({
      destination: '10.99.0.0',
      mask: '255.255.255.0',
      next_hop: 'NONEXISTENT_GW',
    });
  });
});
