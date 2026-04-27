import { describe, it, expect } from 'vitest';
import { parseNmapXml } from './nmapXml.js';

const minimalNmapXml = `<?xml version="1.0" encoding="UTF-8"?>
<nmaprun scanner="nmap" args="nmap -oX - 192.168.1.0/24" startstr="Mon Apr 21 10:00:00 2026" version="7.94">
  <host>
    <status state="up" reason="arp-response"/>
    <address addr="192.168.1.10" addrtype="ipv4"/>
    <address addr="AA:BB:CC:DD:EE:FF" addrtype="mac"/>
    <hostnames>
      <hostname name="server1.lan" type="PTR"/>
    </hostnames>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open" reason="syn-ack"/>
        <service name="ssh" product="OpenSSH" version="8.9p1"/>
      </port>
      <port protocol="tcp" portid="80">
        <state state="open" reason="syn-ack"/>
        <service name="http" product="nginx" version="1.18.0"/>
      </port>
      <port protocol="tcp" portid="443">
        <state state="closed" reason="reset"/>
      </port>
    </ports>
    <os>
      <osmatch name="Linux 5.15" accuracy="95"/>
    </os>
  </host>
  <host>
    <status state="down" reason="no-response"/>
    <address addr="192.168.1.11" addrtype="ipv4"/>
  </host>
  <host>
    <status state="up" reason="arp-response"/>
    <address addr="192.168.1.12" addrtype="ipv4"/>
    <ports>
      <port protocol="udp" portid="53">
        <state state="open" reason="udp-response"/>
        <service name="domain"/>
      </port>
    </ports>
  </host>
</nmaprun>`;

describe('parseNmapXml', () => {
  it('extracts live hosts with IP, MAC, hostnames, ports, and OS', () => {
    const result = parseNmapXml(minimalNmapXml);

    expect(result.hosts).toHaveLength(2);
    expect(result.scanInfo.args).toBe('nmap -oX - 192.168.1.0/24');

    const h1 = result.hosts[0];
    expect(h1.ip).toBe('192.168.1.10');
    expect(h1.macs).toEqual(['AA:BB:CC:DD:EE:FF']);
    expect(h1.hostnames).toEqual(['server1.lan']);
    expect(h1.osGuess).toBe('Linux 5.15');
    expect(h1.ports).toHaveLength(2);
    expect(h1.ports[0]).toEqual({
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: 'ssh',
      version: 'OpenSSH 8.9p1',
    });
    expect(h1.ports[1].service).toBe('http');
    expect(h1.ports[1].version).toBe('nginx 1.18.0');
  });

  it('skips hosts in down state', () => {
    const result = parseNmapXml(minimalNmapXml);
    expect(result.hosts.find(h => h.ip === '192.168.1.11')).toBeUndefined();
  });

  it('skips closed ports', () => {
    const result = parseNmapXml(minimalNmapXml);
    const h1 = result.hosts.find(h => h.ip === '192.168.1.10')!;
    expect(h1.ports.find(p => p.port === 443)).toBeUndefined();
  });

  it('handles host with no MAC or hostnames', () => {
    const result = parseNmapXml(minimalNmapXml);
    const h3 = result.hosts.find(h => h.ip === '192.168.1.12')!;
    expect(h3.macs).toEqual([]);
    expect(h3.hostnames).toEqual([]);
    expect(h3.osGuess).toBeNull();
    expect(h3.ports).toHaveLength(1);
    expect(h3.ports[0].protocol).toBe('udp');
    expect(h3.ports[0].port).toBe(53);
  });

  it('rejects non-nmap XML', () => {
    expect(() => parseNmapXml('<?xml version="1.0"?><other/>')).toThrow(/nmap XML/);
  });

  it('rejects invalid XML', () => {
    expect(() => parseNmapXml('<<<not xml')).toThrow();
  });

  it('returns empty hosts for nmaprun with no hosts', () => {
    const empty = '<?xml version="1.0"?><nmaprun args="nmap -sn 10.0.0.0/8"/>';
    const result = parseNmapXml(empty);
    expect(result.hosts).toEqual([]);
    expect(result.scanInfo.args).toBe('nmap -sn 10.0.0.0/8');
  });

  it('omits version when product and version are both absent', () => {
    const xml = `<?xml version="1.0"?>
<nmaprun>
  <host>
    <status state="up"/>
    <address addr="10.0.0.1" addrtype="ipv4"/>
    <ports>
      <port protocol="tcp" portid="22">
        <state state="open"/>
        <service name="ssh"/>
      </port>
    </ports>
  </host>
</nmaprun>`;
    const result = parseNmapXml(xml);
    expect(result.hosts[0].ports[0].service).toBe('ssh');
    expect(result.hosts[0].ports[0].version).toBeUndefined();
  });
});
