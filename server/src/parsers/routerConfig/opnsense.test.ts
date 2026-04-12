import { describe, it, expect } from 'vitest';
import { parseOpnsenseConfig } from './opnsense.js';

// OPNsense reuses the pfSense walker via parsePfsenseFamilyXml. These tests
// only need to verify the wiring (root tag, vendor label) and that a realistic
// OPNsense config produces the expected entities. The full per-section
// coverage is in pfsense.test.ts.
describe('parseOpnsenseConfig', () => {
  it('parses a realistic opnsense config.xml', () => {
    const input = `<?xml version="1.0"?>
<opnsense>
  <version>23.7</version>
  <system>
    <hostname>opnsense</hostname>
    <domain>example.lan</domain>
    <timezone>UTC</timezone>
    <timeservers>0.opnsense.pool.ntp.org</timeservers>
    <user>
      <name>root</name>
      <scope>system</scope>
      <bcrypt-hash>$2y$10$opnsenserootbcrypt</bcrypt-hash>
    </user>
  </system>
  <interfaces>
    <wan>
      <if>vtnet0</if>
      <descr>WAN</descr>
      <enable></enable>
      <ipaddr>198.51.100.10</ipaddr>
      <subnet>24</subnet>
    </wan>
    <lan>
      <if>vtnet1</if>
      <descr>LAN</descr>
      <enable></enable>
      <ipaddr>10.10.0.1</ipaddr>
      <subnet>24</subnet>
    </lan>
  </interfaces>
  <vlans>
    <vlan>
      <if>vtnet1</if>
      <tag>50</tag>
      <descr>Guests</descr>
    </vlan>
  </vlans>
  <gateways>
    <gateway_item>
      <name>WAN_GW</name>
      <gateway>198.51.100.1</gateway>
      <interface>wan</interface>
    </gateway_item>
  </gateways>
  <staticroutes>
    <route>
      <network>172.16.0.0/12</network>
      <gateway>WAN_GW</gateway>
    </route>
  </staticroutes>
  <filter>
    <rule>
      <type>pass</type>
      <interface>lan</interface>
      <protocol>tcp</protocol>
      <source>
        <network>lan</network>
      </source>
      <destination>
        <any></any>
      </destination>
    </rule>
  </filter>
  <nat>
    <outbound>
      <rule>
        <interface>wan</interface>
        <source>
          <network>10.10.0.0/24</network>
        </source>
        <target>198.51.100.10</target>
      </rule>
    </outbound>
  </nat>
  <dhcpd>
    <lan>
      <range>
        <from>10.10.0.100</from>
        <to>10.10.0.200</to>
      </range>
      <gateway>10.10.0.1</gateway>
      <dnsserver>1.1.1.1</dnsserver>
      <defaultleasetime>43200</defaultleasetime>
      <domain>example.lan</domain>
    </lan>
  </dhcpd>
</opnsense>`;

    const result = parseOpnsenseConfig(input);

    expect(result.metadata.hostname).toBe('opnsense');
    expect(result.metadata.domain).toBe('example.lan');
    expect(result.metadata.os_version).toBe('23.7');
    expect(result.metadata.ntp_servers).toEqual(['0.opnsense.pool.ntp.org']);

    expect(result.interfaces).toHaveLength(2);
    expect(result.interfaces.find(i => i.interface_name === 'wan')).toMatchObject({
      ip_address: '198.51.100.10',
      subnet_mask: '255.255.255.0',
      admin_status: 'up',
    });

    expect(result.vlans).toEqual([{ vlan_id: 50, name: 'Guests' }]);

    expect(result.static_routes).toHaveLength(1);
    expect(result.static_routes[0]).toMatchObject({
      destination: '172.16.0.0',
      mask: '255.240.0.0',
      next_hop: '198.51.100.1',
    });

    expect(result.acls).toHaveLength(1);
    expect(result.acls[0]).toMatchObject({
      acl_name: 'lan',
      action: 'pass',
      protocol: 'tcp',
      src: 'lan',
      dst: 'any',
    });

    expect(result.nat_rules).toHaveLength(1);
    expect(result.nat_rules[0]).toMatchObject({
      nat_type: 'source',
      inside_src: '10.10.0.0/24',
      outside_src: '198.51.100.10',
    });

    expect(result.dhcp_pools).toHaveLength(1);
    expect(result.dhcp_pools[0]).toMatchObject({
      pool_name: 'lan',
      dns_servers: ['1.1.1.1'],
      lease_time: '43200',
      domain_name: 'example.lan',
    });

    expect(result.users).toHaveLength(1);
    expect(result.users[0]).toEqual({
      username: 'root',
      privilege: 15,
      auth_method: 'hash',
    });
    expect(JSON.stringify(result)).not.toContain('$2y$');
  });

  it('throws a clean error referencing OPNsense (not pfSense) on empty input', () => {
    expect(() => parseOpnsenseConfig('')).toThrow(/Invalid OPNsense XML/);
  });

  it('throws when given a pfSense root instead of opnsense', () => {
    expect(() =>
      parseOpnsenseConfig('<?xml version="1.0"?><pfsense><system><hostname>x</hostname></system></pfsense>')
    ).toThrow(/missing <opnsense> root element/);
  });

  it('returns empty result for empty <opnsense/> root', () => {
    const result = parseOpnsenseConfig('<?xml version="1.0"?><opnsense/>');
    expect(result.metadata.hostname).toBeNull();
    expect(result.interfaces).toEqual([]);
    expect(result.acls).toEqual([]);
  });
});
