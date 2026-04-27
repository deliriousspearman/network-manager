import type {
  DeviceType,
  DrawioExtraction,
  DrawioSubnetCandidate,
  DrawioDeviceCandidate,
  DrawioImageCandidate,
  DrawioConnectionCandidate,
} from 'shared/types';
import { lookupDrawioShape } from '../../../iconLibraries/drawioMap';

const CIDR_RE = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2})/;
const IP_RE = /\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/;
const VLAN_RE = /VLAN\s*(\d+)/i;
const MAC_RE = /\b([0-9a-fA-F]{2}([:-])[0-9a-fA-F]{2}(\2[0-9a-fA-F]{2}){4})\b/;
const HOSTNAME_HINT_RE = /^\s*(?:host(?:name)?|fqdn)\s*[:=]\s*(\S+)/i;

function isValidIpOctets(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = Number(p);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function matchValidIp(label: string): string | null {
  const m = label.match(IP_RE);
  if (!m) return null;
  return isValidIpOctets(m[1]) ? m[1] : null;
}

function matchValidCidr(label: string): string | null {
  const m = label.match(CIDR_RE);
  if (!m) return null;
  const [ip, maskStr] = m[1].split('/');
  const mask = Number(maskStr);
  if (!isValidIpOctets(ip)) return null;
  if (!Number.isInteger(mask) || mask < 0 || mask > 32) return null;
  return m[1];
}

function num(v: string | null, fallback = 0): number {
  if (v == null) return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function styleMap(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of style.split(';')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      out[part] = '1';
    } else {
      out[part.slice(0, eq)] = part.slice(eq + 1);
    }
  }
  return out;
}

export interface DrawioShapeInfo {
  type: DeviceType | null;
  libraryId: string | null;
  libraryIconKey: string | null;
}

// Resolve a drawio shape key + label into (device type, optional library
// icon mapping). The reverse map (DRAWIO_SHAPE_MAP) gives us a confident
// hit for any curated stencil across networks/networks2/cisco/cisco19;
// loose prefix matching catches stencils we ship icons for elsewhere
// (e.g. "mxgraph.cisco19.firewall_xyz") and label heuristics are the
// final fallback for ad-hoc shapes with no recognizable key.
export function classifyDrawioShape(shapeKey: string | null, label: string): DrawioShapeInfo {
  const key = (shapeKey || '').toLowerCase();

  // 1. Curated reverse map (full library + icon match).
  const mapped = lookupDrawioShape(key);
  if (mapped) {
    return {
      type: (mapped.suggestedType as DeviceType) ?? typeFromShapeKey(key) ?? typeFromLabel(label),
      libraryId: mapped.libraryId,
      libraryIconKey: mapped.iconKey,
    };
  }

  // 2. Loose prefix-based type detection for stencils we don't curate icons
  //    for but still want to import as the right device type.
  const fromKey = typeFromShapeKey(key);
  if (fromKey) {
    return { type: fromKey, libraryId: null, libraryIconKey: null };
  }

  // 3. Final fallback: label heuristic.
  const fromLabel = typeFromLabel(label);
  return { type: fromLabel, libraryId: null, libraryIconKey: null };
}

function typeFromShapeKey(key: string): DeviceType | null {
  // Match by directory/category across all four libraries.
  if (/^mxgraph\.cisco\.routers/.test(key)) return 'router';
  if (/^mxgraph\.cisco\.switches/.test(key)) return 'switch';
  if (/^mxgraph\.cisco\.security/.test(key) && /firewall|pix|asa/.test(key)) return 'firewall';
  if (/^mxgraph\.cisco\.security/.test(key)) return 'firewall';
  if (/^mxgraph\.cisco\.servers/.test(key)) return 'server';
  if (/^mxgraph\.cisco\.storage/.test(key)) return 'nas';
  if (/^mxgraph\.cisco\.wireless/.test(key)) return 'access_point';
  if (/^mxgraph\.cisco\.modems_and_phones\.ip_phone/.test(key)) return 'phone';
  if (/^mxgraph\.cisco\.computers_and_peripherals\.video_camera/.test(key)) return 'camera';
  if (/^mxgraph\.cisco\.computers_and_peripherals\.terminal/.test(key)) return 'iot';
  if (/^mxgraph\.cisco\.computers_and_peripherals/.test(key)) return 'workstation';

  // Same idea for the cisco19 / networks / networks2 namespaces — names are
  // already typed cleanly inside the key, so a contains-match is enough.
  if (/^mxgraph\.(cisco19|networks2?)\./.test(key)) {
    if (/firewall|asa|pix/.test(key)) return 'firewall';
    if (/router/.test(key)) return 'router';
    if (/switch/.test(key)) return 'switch';
    if (/access_point|\bap\b|wifi|wireless/.test(key)) return 'access_point';
    if (/storage|nas|tape/.test(key)) return 'nas';
    if (/server|host|mainframe/.test(key)) return 'server';
    if (/laptop|desktop|workstation|\bpc\b/.test(key)) return 'workstation';
    if (/camera|cctv/.test(key)) return 'camera';
    if (/phone/.test(key)) return 'phone';
  }

  return null;
}

function typeFromLabel(label: string): DeviceType | null {
  const lbl = label.toLowerCase();
  if (/\bfirewall|asa|palo|fortigate\b/i.test(lbl)) return 'firewall';
  if (/\brouter|gateway\b/i.test(lbl)) return 'router';
  if (/\bswitch\b/i.test(lbl)) return 'switch';
  if (/\bnas|storage\b/i.test(lbl)) return 'nas';
  if (/\bserver|host\b/i.test(lbl)) return 'server';
  if (/\b(workstation|desktop|laptop|pc)\b/i.test(lbl)) return 'workstation';
  if (/\bcamera|cctv\b/i.test(lbl)) return 'camera';
  if (/\biot\b/i.test(lbl)) return 'iot';
  if (/\bap\b|access.?point|wifi|wireless/i.test(lbl)) return 'access_point';
  if (/\bphone|voip\b/i.test(lbl)) return 'phone';
  return null;
}

export interface LabelMetadata {
  primaryIp: string | null;
  hostname: string | null;
  macAddress: string | null;
}

// drawio device labels are typically multi-line — `Name<br>IP: ...<br>MAC: ...`.
// Pull whatever we can recognise so the user does less manual cleanup
// after import.
export function extractLabelMetadata(label: string): LabelMetadata {
  const primaryIp = matchValidIp(label);
  const macMatch = label.match(MAC_RE);
  const macAddress = macMatch ? macMatch[1].toLowerCase().replace(/-/g, ':') : null;
  // Hostname: explicit `host: foo` or `fqdn: foo` line. Avoid grabbing
  // arbitrary text that looks like a hostname.
  let hostname: string | null = null;
  for (const line of label.split('\n')) {
    const m = line.match(HOSTNAME_HINT_RE);
    if (m) { hostname = m[1]; break; }
  }
  return { primaryIp, hostname, macAddress };
}

function decodeHtmlEntities(s: string): string {
  if (!s) return '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|span|b|i|u|font)[^>]*>/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function firstNonEmptyLine(lines: string[]): string {
  for (const l of lines) {
    const trimmed = l.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function extForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  if (m.includes('webp')) return 'webp';
  return 'bin';
}

function parseDataUrl(url: string): { mime: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], data: m[2] };
}

function resolveGraphModel(doc: Document): Element | null {
  const direct = doc.querySelector('mxGraphModel');
  if (direct) return direct;
  const diagram = doc.querySelector('diagram');
  if (!diagram) return null;
  const inner = (diagram.textContent || '').trim();
  if (!inner) return null;
  // Compressed diagrams: base64 of deflate-raw of URI-encoded XML. We don't
  // support those in v1 — newer draw.io versions save uncompressed by default,
  // and our own export emits uncompressed. Return null so the caller reports
  // "compressed/empty" rather than crashing.
  if (inner.startsWith('<')) {
    const inner_doc = new DOMParser().parseFromString(inner, 'application/xml');
    return inner_doc.querySelector('mxGraphModel');
  }
  return null;
}

export interface DrawioParseError {
  code: 'invalid_xml' | 'no_model' | 'compressed' | 'empty';
  message: string;
}

export function parseDrawioXml(
  text: string,
  filename: string,
): { ok: true; extraction: DrawioExtraction } | { ok: false; error: DrawioParseError } {
  if (!text.trim()) {
    return { ok: false, error: { code: 'empty', message: 'File is empty' } };
  }

  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) {
    return { ok: false, error: { code: 'invalid_xml', message: 'File is not valid XML' } };
  }

  const model = resolveGraphModel(doc);
  if (!model) {
    const hasDiagram = doc.querySelector('diagram');
    if (hasDiagram) {
      return {
        ok: false,
        error: {
          code: 'compressed',
          message: 'This draw.io file uses compression we don\'t support. Open it in draw.io, File → Properties → uncheck Compressed, save, and try again.',
        },
      };
    }
    return { ok: false, error: { code: 'no_model', message: 'No <mxGraphModel> found in file' } };
  }

  const cells = Array.from(model.querySelectorAll('mxCell'));

  type CellInfo = {
    id: string;
    parent: string | null;
    label: string;
    styleRaw: string;
    style: Record<string, string>;
    vertex: boolean;
    edge: boolean;
    source: string | null;
    target: string | null;
    x: number;
    y: number;
    width: number;
    height: number;
  };

  const cellMap = new Map<string, CellInfo>();

  for (const c of cells) {
    const id = c.getAttribute('id') || '';
    if (!id) continue;
    const parent = c.getAttribute('parent');
    const styleRaw = c.getAttribute('style') || '';
    const style = styleMap(styleRaw);
    const rawValue = c.getAttribute('value') || '';
    const label = decodeHtmlEntities(rawValue);
    const vertex = c.getAttribute('vertex') === '1';
    const edge = c.getAttribute('edge') === '1';
    const source = c.getAttribute('source');
    const target = c.getAttribute('target');
    const geom = c.querySelector('mxGeometry');
    const x = geom ? num(geom.getAttribute('x')) : 0;
    const y = geom ? num(geom.getAttribute('y')) : 0;
    const width = geom ? num(geom.getAttribute('width')) : 0;
    const height = geom ? num(geom.getAttribute('height')) : 0;
    cellMap.set(id, {
      id,
      parent,
      label,
      styleRaw,
      style,
      vertex,
      edge,
      source,
      target,
      x,
      y,
      width,
      height,
    });
  }

  // Walk the parent chain and sum geometries to get absolute position. Root
  // layers (id "0"/"1") carry no geometry so adding them is a no-op.
  function absPos(info: CellInfo): { x: number; y: number } {
    let x = info.x;
    let y = info.y;
    let cur: CellInfo | undefined = info.parent ? cellMap.get(info.parent) : undefined;
    const seen = new Set<string>([info.id]);
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      x += cur.x;
      y += cur.y;
      cur = cur.parent ? cellMap.get(cur.parent) : undefined;
    }
    return { x, y };
  }

  const subnets: DrawioSubnetCandidate[] = [];
  const devices: DrawioDeviceCandidate[] = [];
  const images: DrawioImageCandidate[] = [];
  const connections: DrawioConnectionCandidate[] = [];

  // Pass 1: identify subnet containers. A subnet is either (a) a drawio
  // container without a recognised device-stencil shape, or (b) a plain
  // rectangle (no shape attribute) whose label carries a valid CIDR.
  // A device-stenciled cell with "10.0.0.0/24" in its label is NOT a
  // subnet — we'd rather see it as a device with a CIDR comment.
  const subnetIds = new Set<string>();
  for (const info of cellMap.values()) {
    if (!info.vertex) continue;
    const isContainer = info.style.container === '1';
    const shapeKey = info.style.shape || null;
    const lines = info.label.split('\n');
    const cidrMatch = matchValidCidr(info.label);
    const vlanMatch = info.label.match(VLAN_RE);
    // "Device-like" = any recognised drawio stencil (cisco / cisco19 /
    // networks / networks2) or a raw image. Prevents stencil-driven
    // device cells from being misclassified as subnets when their label
    // happens to contain a CIDR.
    const isDeviceLikeShape = shapeKey !== null && (
      shapeKey === 'image'
      || shapeKey.startsWith('mxgraph.cisco.')
      || shapeKey.startsWith('mxgraph.cisco19.')
      || shapeKey.startsWith('mxgraph.networks.')
      || shapeKey.startsWith('mxgraph.networks2.')
    );
    if (isDeviceLikeShape) continue;
    if (!isContainer && !cidrMatch) continue;

    const name = firstNonEmptyLine(
      lines
        .map(l => l.trim())
        .filter(l => !CIDR_RE.test(l) && !VLAN_RE.test(l)),
    ) || (cidrMatch || 'Subnet');

    const abs = absPos(info);
    subnets.push({
      cellId: info.id,
      name,
      cidr: cidrMatch,
      vlan_id: vlanMatch ? parseInt(vlanMatch[1], 10) : null,
      x: abs.x,
      y: abs.y,
      width: info.width > 0 ? info.width : 200,
      height: info.height > 0 ? info.height : 200,
    });
    subnetIds.add(info.id);
  }

  // Pass 2: devices & images (vertices that are not subnets). Coords are
  // emitted as absolute. The server converts to subnet-relative when the
  // parent subnet is actually applied, or keeps absolute otherwise — this
  // prevents devices from ending up at the wrong spot when their parent
  // subnet is skipped.
  for (const info of cellMap.values()) {
    if (!info.vertex) continue;
    if (subnetIds.has(info.id)) continue;

    const shapeKey = info.style.shape || null;
    const abs = absPos(info);

    if (shapeKey === 'image') {
      const imgUrl = info.style.image || '';
      const parsed = parseDataUrl(imgUrl);
      if (parsed) {
        const label = info.label || null;
        const ext = extForMime(parsed.mime);
        const baseName = (label || `image-${info.id}`).replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 64);
        images.push({
          cellId: info.id,
          filename: /\.\w+$/.test(baseName) ? baseName : `${baseName}.${ext}`,
          mime_type: parsed.mime,
          data: parsed.data,
          label,
          x: abs.x,
          y: abs.y,
          width: info.width > 0 ? info.width : 80,
          height: info.height > 0 ? info.height : 80,
        });
      }
      continue;
    }

    const cellParent = info.parent && subnetIds.has(info.parent) ? info.parent : null;
    const classification = classifyDrawioShape(shapeKey, info.label);
    const meta = extractLabelMetadata(info.label);
    const lines = info.label.split('\n');
    const name = firstNonEmptyLine(
      lines.map(l => l.trim()).filter(l => !IP_RE.test(l) && !MAC_RE.test(l) && !HOSTNAME_HINT_RE.test(l)),
    ) || firstNonEmptyLine(lines)
      || (classification.type ? `${classification.type}-${info.id}` : `device-${info.id}`);

    if (classification.type) {
      devices.push({
        cellId: info.id,
        name,
        type: classification.type,
        primary_ip: meta.primaryIp,
        hostname: meta.hostname,
        mac_address: meta.macAddress,
        library_id: classification.libraryId,
        library_icon_key: classification.libraryIconKey,
        subnetCellId: cellParent,
        x: abs.x,
        y: abs.y,
        isClassified: true,
      });
    } else if (meta.primaryIp) {
      devices.push({
        cellId: info.id,
        name,
        type: 'server',
        primary_ip: meta.primaryIp,
        hostname: meta.hostname,
        mac_address: meta.macAddress,
        library_id: null,
        library_icon_key: null,
        subnetCellId: cellParent,
        x: abs.x,
        y: abs.y,
        isClassified: false,
      });
    }
  }

  // Pass 3: edges
  for (const info of cellMap.values()) {
    if (!info.edge) continue;
    if (!info.source || !info.target) continue;
    const strokeColor = info.style.strokeColor || null;
    const strokeWidth = info.style.strokeWidth ? parseFloat(info.style.strokeWidth) : null;
    let connection_type = 'ethernet';
    if (info.style.dashed === '1') {
      const dp = info.style.dashPattern || '';
      if (dp === '1 3') connection_type = 'wifi';
      else if (dp === '6 6') connection_type = 'vpn';
      else if (dp === '3 3') connection_type = 'serial';
      else connection_type = 'wifi';
    } else if (strokeWidth && strokeWidth >= 3) {
      connection_type = 'fiber';
    }

    connections.push({
      cellId: info.id,
      sourceCellId: info.source,
      targetCellId: info.target,
      label: info.label || null,
      connection_type,
      edge_color: strokeColor,
      edge_width: Number.isFinite(strokeWidth ?? NaN) ? strokeWidth : null,
    });
  }

  return {
    ok: true,
    extraction: {
      filename,
      subnets,
      devices,
      images,
      connections,
    },
  };
}
