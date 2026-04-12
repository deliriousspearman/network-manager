/** Binary PCAP and PCAP-NG parser — extracts unique hosts with IPs, MACs, and ports. */

export interface PcapHost {
  ip: string;
  macs: string[];
  ports: { port: number; protocol: 'tcp' | 'udp' }[];
  packetCount: number;
}

interface HostAccum {
  macs: Set<string>;
  ports: Set<string>; // "port/proto" dedup key
  packetCount: number;
}

// ── helpers ──────────────────────────────────────────────────────────────

function formatMac(buf: Buffer, offset: number): string {
  const parts: string[] = [];
  for (let i = 0; i < 6; i++) parts.push(buf[offset + i].toString(16).padStart(2, '0'));
  return parts.join(':');
}

function formatIp(buf: Buffer, offset: number): string {
  return `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
}

function isBroadcastMac(mac: string): boolean {
  return mac === 'ff:ff:ff:ff:ff:ff' || mac === '00:00:00:00:00:00';
}

function isFilteredIp(ip: string): boolean {
  if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;
  const first = parseInt(ip.split('.')[0], 10);
  if (first >= 224 && first <= 239) return true; // multicast
  if (first === 169 && ip.startsWith('169.254.')) return true; // link-local
  return false;
}

// ── packet extraction (shared between formats) ──────────────────────────

function processPacket(
  pktData: Buffer,
  hosts: Map<string, HostAccum>,
): boolean {
  // Need at least Ethernet header (14) + min IPv4 header (20) = 34 bytes
  if (pktData.length < 34) return false;

  const etherType = pktData.readUInt16BE(12);
  if (etherType !== 0x0800) return false; // Not IPv4

  const srcMac = formatMac(pktData, 6);
  const dstMac = formatMac(pktData, 0);

  // IPv4 header starts at byte 14
  const ipOffset = 14;
  const versionIhl = pktData[ipOffset];
  const ihl = (versionIhl & 0x0f) * 4;
  if (ihl < 20 || ipOffset + ihl > pktData.length) return false;

  const protocol = pktData[ipOffset + 9];
  const srcIp = formatIp(pktData, ipOffset + 12);
  const dstIp = formatIp(pktData, ipOffset + 16);

  // TCP (6) or UDP (17) — extract ports
  let srcPort: number | null = null;
  let dstPort: number | null = null;
  let proto: 'tcp' | 'udp' | null = null;

  if ((protocol === 6 || protocol === 17) && ipOffset + ihl + 4 <= pktData.length) {
    srcPort = pktData.readUInt16BE(ipOffset + ihl);
    dstPort = pktData.readUInt16BE(ipOffset + ihl + 2);
    proto = protocol === 6 ? 'tcp' : 'udp';
  }

  // Record source host
  if (!isFilteredIp(srcIp)) {
    const h = hosts.get(srcIp) ?? { macs: new Set(), ports: new Set(), packetCount: 0 };
    if (!isBroadcastMac(srcMac)) h.macs.add(srcMac);
    h.packetCount++;
    hosts.set(srcIp, h);
  }

  // Record destination host — ports TO this IP are likely its listening ports
  if (!isFilteredIp(dstIp)) {
    const h = hosts.get(dstIp) ?? { macs: new Set(), ports: new Set(), packetCount: 0 };
    if (!isBroadcastMac(dstMac)) h.macs.add(dstMac);
    if (dstPort !== null && proto !== null && dstPort < 49152) {
      // Only non-ephemeral ports (< 49152) as likely services
      h.ports.add(`${dstPort}/${proto}`);
    }
    h.packetCount++;
    hosts.set(dstIp, h);
  }

  return true;
}

// ── Classic PCAP ─────────────────────────────────────────────────────────

function parseClassicPcap(buf: Buffer): { hosts: Map<string, HostAccum>; totalPackets: number } {
  const magic = buf.readUInt32LE(0);
  const le = magic === 0xa1b2c3d4;
  // magic === 0xd4c3b2a1 means big-endian

  const read32 = le ? (o: number) => buf.readUInt32LE(o) : (o: number) => buf.readUInt32BE(o);

  const linkType = read32(20);
  if (linkType !== 1) throw new Error('Invalid PCAP file: unsupported link type (only Ethernet supported)');

  const hosts = new Map<string, HostAccum>();
  let offset = 24; // after global header
  let totalPackets = 0;

  while (offset + 16 <= buf.length) {
    const inclLen = read32(offset + 8);
    const pktStart = offset + 16;

    if (pktStart + inclLen > buf.length) break; // truncated

    const pktData = buf.subarray(pktStart, pktStart + inclLen);
    processPacket(pktData, hosts);
    totalPackets++;

    offset = pktStart + inclLen;
  }

  return { hosts, totalPackets };
}

// ── PCAP-NG ──────────────────────────────────────────────────────────────

function parsePcapNg(buf: Buffer): { hosts: Map<string, HostAccum>; totalPackets: number } {
  // SHB starts at offset 0: type(4) + length(4) + byte-order magic(4) + ...
  if (buf.length < 28) throw new Error('Invalid PCAP-NG file: too short');

  // Detect endianness from byte-order magic at offset 8
  const bom = buf.readUInt32LE(8);
  const le = bom === 0x1a2b3c4d;
  // bom === 0x4d3c2b1a means big-endian

  const read16 = le ? (o: number) => buf.readUInt16LE(o) : (o: number) => buf.readUInt16BE(o);
  const read32 = le ? (o: number) => buf.readUInt32LE(o) : (o: number) => buf.readUInt32BE(o);

  const interfaceLinkTypes: number[] = [];
  const hosts = new Map<string, HostAccum>();
  let offset = 0;
  let totalPackets = 0;

  while (offset + 8 <= buf.length) {
    const blockType = read32(offset);
    const blockLen = read32(offset + 4);

    if (blockLen < 12 || offset + blockLen > buf.length) break; // invalid or truncated

    if (blockType === 0x00000001) {
      // Interface Description Block: link type at offset+8 (2 bytes)
      if (offset + 10 <= buf.length) {
        interfaceLinkTypes.push(read16(offset + 8));
      }
    } else if (blockType === 0x00000006) {
      // Enhanced Packet Block
      // body: interfaceId(4) + timestampHi(4) + timestampLo(4) + capturedLen(4) + originalLen(4) + data
      if (offset + 28 <= buf.length) {
        const ifaceId = read32(offset + 8);
        const capturedLen = read32(offset + 20);
        const pktStart = offset + 28;

        // Only process Ethernet interfaces
        if (interfaceLinkTypes[ifaceId] === 1 && pktStart + capturedLen <= buf.length) {
          const pktData = buf.subarray(pktStart, pktStart + capturedLen);
          processPacket(pktData, hosts);
        }
        totalPackets++;
      }
    }
    // else: SHB (0x0a0d0d0a), or other blocks — skip

    // Advance to next block (block lengths are padded to 4-byte boundaries)
    offset += blockLen;
  }

  return { hosts, totalPackets };
}

// ── Public API ───────────────────────────────────────────────────────────

export function parsePcap(buf: Buffer): { hosts: PcapHost[]; totalPackets: number } {
  if (buf.length < 4) throw new Error('Invalid capture file: too short');

  const magic32 = buf.readUInt32LE(0);
  let result: { hosts: Map<string, HostAccum>; totalPackets: number };

  if (magic32 === 0xa1b2c3d4 || magic32 === 0xd4c3b2a1) {
    result = parseClassicPcap(buf);
  } else if (buf.readUInt32LE(0) === 0x0a0d0d0a) {
    result = parsePcapNg(buf);
  } else {
    throw new Error('Invalid capture file: unrecognized format (expected PCAP or PCAP-NG)');
  }

  const hosts: PcapHost[] = [];
  for (const [ip, acc] of result.hosts) {
    hosts.push({
      ip,
      macs: [...acc.macs],
      ports: [...acc.ports].map(key => {
        const [port, proto] = key.split('/');
        return { port: Number(port), protocol: proto as 'tcp' | 'udp' };
      }).sort((a, b) => a.port - b.port),
      packetCount: acc.packetCount,
    });
  }

  // Sort by packet count descending, cap at 500
  hosts.sort((a, b) => b.packetCount - a.packetCount);

  return { hosts: hosts.slice(0, 500), totalPackets: result.totalPackets };
}
