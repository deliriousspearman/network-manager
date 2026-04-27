import { describe, it, expect } from 'vitest';
import { classifyDrawioShape, extractLabelMetadata } from './fromDrawioXml';

// Snapshot-style coverage across the four bundled libraries: confirms a
// drawio shape key from each pack maps to the expected device type AND
// our (libraryId, iconKey). Add a row whenever the curated list grows.
describe('classifyDrawioShape — curated reverse-map hits', () => {
  const cases: Array<[string, string, string, string]> = [
    // [shapeKey, expectedType, expectedLibraryId, expectedIconKey]
    ['mxgraph.cisco.routers.router', 'router', 'cisco', 'router'],
    ['mxgraph.cisco.security.firewall', 'firewall', 'cisco', 'firewall'],
    ['mxgraph.cisco.computers_and_peripherals.pc', 'workstation', 'cisco', 'pc'],
    ['mxgraph.cisco19.router', 'router', 'cisco19', 'router'],
    ['mxgraph.cisco19.asa_5500', 'firewall', 'cisco19', 'asa_5500'],
    ['mxgraph.cisco19.l3_switch', 'switch', 'cisco19', 'l3_switch'],
    ['mxgraph.cisco19.wireless_access_point', 'access_point', 'cisco19', 'wireless_access_point'],
    ['mxgraph.networks.firewall', 'firewall', 'network2018', 'firewall'],
    ['mxgraph.networks.router', 'router', 'network2018', 'router'],
    ['mxgraph.networks.security_camera', 'camera', 'network2018', 'camera'],
    ['mxgraph.networks2.firewall', 'firewall', 'network2025', 'firewall'],
    ['mxgraph.networks2.router', 'router', 'network2025', 'router'],
    ['mxgraph.networks2.cctv', 'camera', 'network2025', 'cctv'],
  ];
  it.each(cases)('%s → %s (%s/%s)', (key, type, libId, iconKey) => {
    const info = classifyDrawioShape(key, '');
    expect(info.type).toBe(type);
    expect(info.libraryId).toBe(libId);
    expect(info.libraryIconKey).toBe(iconKey);
  });

  it('matches case-insensitively (drawio cells often arrive lowercased anyway)', () => {
    const info = classifyDrawioShape('MxGraph.Cisco.Routers.Router', '');
    expect(info.type).toBe('router');
    expect(info.libraryId).toBe('cisco');
  });
});

describe('classifyDrawioShape — loose prefix fallback', () => {
  it('detects type from a non-curated stencil under a known library prefix', () => {
    // No drawio shape called `firewall_xyz` exists in our curated list, but
    // the type is still inferable from the library prefix + name fragment.
    const info = classifyDrawioShape('mxgraph.cisco19.firewall_xyz', '');
    expect(info.type).toBe('firewall');
    expect(info.libraryId).toBeNull();
    expect(info.libraryIconKey).toBeNull();
  });

  it('does not over-match unrelated libraries', () => {
    const info = classifyDrawioShape('mxgraph.aws.lambda', '');
    expect(info.type).toBeNull();
    expect(info.libraryId).toBeNull();
  });
});

describe('classifyDrawioShape — label fallback', () => {
  it('infers type from label when shape key is missing', () => {
    expect(classifyDrawioShape(null, 'Edge Router').type).toBe('router');
    expect(classifyDrawioShape(null, 'Production Firewall (asa)').type).toBe('firewall');
    expect(classifyDrawioShape(null, 'Dell PowerEdge Server').type).toBe('server');
    expect(classifyDrawioShape(null, 'Wireless AP').type).toBe('access_point');
  });

  it('returns null when nothing matches', () => {
    expect(classifyDrawioShape(null, 'Some Box').type).toBeNull();
    expect(classifyDrawioShape('shape=ellipse', 'Some Box').type).toBeNull();
  });
});

describe('extractLabelMetadata', () => {
  it('pulls IP, MAC and hostname from a multi-line drawio label', () => {
    const meta = extractLabelMetadata('Web Server\nIP: 10.0.0.1\nMAC: aa:bb:cc:dd:ee:ff\nhost: web01');
    expect(meta.primaryIp).toBe('10.0.0.1');
    expect(meta.macAddress).toBe('aa:bb:cc:dd:ee:ff');
    expect(meta.hostname).toBe('web01');
  });

  it('normalises dash-separated MACs to colons', () => {
    const meta = extractLabelMetadata('AA-BB-CC-11-22-33');
    expect(meta.macAddress).toBe('aa:bb:cc:11:22:33');
  });

  it('accepts hostname/fqdn aliases', () => {
    expect(extractLabelMetadata('fqdn: srv1.lan').hostname).toBe('srv1.lan');
    expect(extractLabelMetadata('host=srv2').hostname).toBe('srv2');
  });

  it('returns nulls when nothing matches', () => {
    const meta = extractLabelMetadata('Just a plain label');
    expect(meta.primaryIp).toBeNull();
    expect(meta.macAddress).toBeNull();
    expect(meta.hostname).toBeNull();
  });

  it('rejects invalid-octet IPs', () => {
    expect(extractLabelMetadata('999.0.0.1').primaryIp).toBeNull();
  });
});
