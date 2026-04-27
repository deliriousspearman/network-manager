#!/usr/bin/env tsx
/* eslint-disable no-console */
// Convert curated drawio stencil shapes into individual SVG files plus a
// matching client manifest and server allowlist.
//
// Run:   npx tsx scripts/build-icon-libraries.ts
// Output:
//   client/public/icon-libraries/{libraryId}/{iconKey}.svg
//   client/src/iconLibraries/manifest.ts
//   server/src/iconLibraries.ts
//
// The script is the single source of truth for the curated catalogue.
// It downloads stencil XML from drawio's GitHub `dev` branch, caches them
// under .cache/drawio-stencils/, and re-renders the SVGs deterministically.
// Re-run only when curating; the generated SVGs are committed.

import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join, resolve as resolvePath } from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolvePath(dirname(__filename), '..');

const CACHE_DIR = join(ROOT, '.cache/drawio-stencils');
const SVG_OUT_ROOT = join(ROOT, 'client/public/icon-libraries');
const CLIENT_MANIFEST = join(ROOT, 'client/src/iconLibraries/manifest.ts');
const CLIENT_DRAWIO_MAP = join(ROOT, 'client/src/iconLibraries/drawioMap.ts');
const SERVER_ALLOWLIST = join(ROOT, 'server/src/iconLibraries.ts');

const DRAWIO_REF = 'dev';
const BASE = `https://raw.githubusercontent.com/jgraph/drawio/${DRAWIO_REF}/src/main/webapp/stencils`;

interface CuratedIcon {
  stencil: string;            // exact <shape name="..."> attribute
  key: string;                // slug used in URLs and manifest
  label: string;              // display label
  suggestedTypes?: string[];  // device-type hints for the picker
}

interface LibrarySource {
  id: string;
  label: string;
  files: string[];            // paths relative to BASE
  // `curated` entries stabilise the iconKey/label/suggestedTypes for shapes
  // we care about (e.g. "Phone 1" → key "phone" instead of the auto-derived
  // "phone_1"). If `includeAllShapes` is true, every other shape from the
  // source XMLs is emitted with auto-derived key + label.
  curated: CuratedIcon[];
  includeAllShapes?: boolean;
}

const LIBRARIES: LibrarySource[] = [
  {
    id: 'network2018',
    label: 'Networking (legacy)',
    files: ['networks.xml'],
    includeAllShapes: true,
    curated: [
      { stencil: 'Router', key: 'router', label: 'Router', suggestedTypes: ['router'] },
      { stencil: 'Switch', key: 'switch', label: 'Switch', suggestedTypes: ['switch'] },
      { stencil: 'Firewall', key: 'firewall', label: 'Firewall', suggestedTypes: ['firewall'] },
      { stencil: 'Hub', key: 'hub', label: 'Hub' },
      { stencil: 'Server', key: 'server', label: 'Server', suggestedTypes: ['server'] },
      { stencil: 'Mainframe', key: 'mainframe', label: 'Mainframe' },
      { stencil: 'NAS Filer', key: 'nas', label: 'NAS', suggestedTypes: ['nas'] },
      { stencil: 'Storage', key: 'storage', label: 'Storage' },
      { stencil: 'Tape Storage', key: 'tape_storage', label: 'Tape Storage' },
      { stencil: 'Mail Server', key: 'mail_server', label: 'Mail Server' },
      { stencil: 'Proxy Server', key: 'proxy_server', label: 'Proxy Server' },
      { stencil: 'Load Balancer', key: 'load_balancer', label: 'Load Balancer' },
      { stencil: 'PC', key: 'pc', label: 'PC', suggestedTypes: ['workstation'] },
      { stencil: 'Desktop PC', key: 'desktop_pc', label: 'Desktop PC', suggestedTypes: ['workstation'] },
      { stencil: 'Laptop', key: 'laptop', label: 'Laptop', suggestedTypes: ['workstation'] },
      { stencil: 'Tablet', key: 'tablet', label: 'Tablet' },
      { stencil: 'Mobile', key: 'mobile', label: 'Mobile' },
      { stencil: 'Phone 1', key: 'phone', label: 'Phone', suggestedTypes: ['phone'] },
      { stencil: 'Printer', key: 'printer', label: 'Printer' },
      { stencil: 'Monitor', key: 'monitor', label: 'Monitor' },
      { stencil: 'Cloud', key: 'cloud', label: 'Cloud' },
      { stencil: 'Modem', key: 'modem', label: 'Modem' },
      { stencil: 'Rack', key: 'rack', label: 'Rack' },
      { stencil: 'Security Camera', key: 'camera', label: 'Camera', suggestedTypes: ['camera'] },
      { stencil: 'Radio Tower', key: 'radio_tower', label: 'Radio Tower' },
      { stencil: 'Satellite Dish', key: 'satellite_dish', label: 'Satellite Dish' },
      { stencil: 'UPS Enterprise', key: 'ups', label: 'UPS' },
    ],
  },
  {
    id: 'network2025',
    label: 'Networking',
    files: ['networks2.xml'],
    includeAllShapes: true,
    curated: [
      { stencil: 'router', key: 'router', label: 'Router', suggestedTypes: ['router'] },
      { stencil: 'switch', key: 'switch', label: 'Switch', suggestedTypes: ['switch'] },
      { stencil: 'firewall', key: 'firewall', label: 'Firewall', suggestedTypes: ['firewall'] },
      { stencil: 'hub', key: 'hub', label: 'Hub' },
      { stencil: 'server', key: 'server', label: 'Server', suggestedTypes: ['server'] },
      { stencil: 'mainframe', key: 'mainframe', label: 'Mainframe' },
      { stencil: 'global server', key: 'global_server', label: 'Global Server' },
      { stencil: 'data storage', key: 'data_storage', label: 'Storage', suggestedTypes: ['nas'] },
      { stencil: 'mail server', key: 'mail_server', label: 'Mail Server' },
      { stencil: 'proxy server', key: 'proxy_server', label: 'Proxy Server' },
      { stencil: 'load balancer', key: 'load_balancer', label: 'Load Balancer' },
      { stencil: 'desktop pc', key: 'desktop_pc', label: 'Desktop PC', suggestedTypes: ['workstation'] },
      { stencil: 'laptop', key: 'laptop', label: 'Laptop', suggestedTypes: ['workstation'] },
      { stencil: 'mobile phone', key: 'mobile_phone', label: 'Mobile Phone' },
      { stencil: 'modem', key: 'modem', label: 'Modem' },
      { stencil: 'cloud', key: 'cloud', label: 'Cloud' },
      { stencil: 'internet', key: 'internet', label: 'Internet' },
      { stencil: 'internet security', key: 'internet_security', label: 'Internet Security' },
      { stencil: 'lan', key: 'lan', label: 'LAN' },
      { stencil: 'cctv', key: 'cctv', label: 'CCTV', suggestedTypes: ['camera'] },
      { stencil: 'antenna', key: 'antenna', label: 'Antenna' },
      { stencil: 'biometric reader', key: 'biometric_reader', label: 'Biometric Reader' },
      { stencil: 'big data', key: 'big_data', label: 'Big Data' },
      { stencil: 'encryption', key: 'encryption', label: 'Encryption' },
      { stencil: 'lock', key: 'lock', label: 'Lock' },
      { stencil: 'mobile network', key: 'mobile_network', label: 'Mobile Network' },
    ],
  },
  {
    id: 'cisco',
    label: 'Cisco (classic)',
    files: [
      'cisco/routers.xml',
      'cisco/switches.xml',
      'cisco/security.xml',
      'cisco/servers.xml',
      'cisco/storage.xml',
      'cisco/wireless.xml',
      'cisco/computers_and_peripherals.xml',
      'cisco/hubs_and_gateways.xml',
      'cisco/modems_and_phones.xml',
      'cisco/misc.xml',
    ],
    includeAllShapes: true,
    curated: [
      { stencil: 'Router', key: 'router', label: 'Router', suggestedTypes: ['router'] },
      { stencil: 'Broadcast Router', key: 'broadcast_router', label: 'Broadcast Router' },
      { stencil: 'Layer 3 Switch', key: 'l3_switch', label: 'Layer 3 Switch', suggestedTypes: ['switch'] },
      { stencil: 'Multilayer Remote Switch', key: 'l2_switch', label: 'Switch', suggestedTypes: ['switch'] },
      { stencil: 'ATM Switch', key: 'atm_switch', label: 'ATM Switch' },
      { stencil: 'Firewall', key: 'firewall', label: 'Firewall', suggestedTypes: ['firewall'] },
      { stencil: 'PIX Firewall', key: 'pix_firewall', label: 'PIX Firewall' },
      { stencil: 'Lock', key: 'lock', label: 'Lock' },
      { stencil: 'Network Security', key: 'network_security', label: 'Network Security' },
      { stencil: 'Server With Router', key: 'server_with_router', label: 'Server With Router' },
      { stencil: 'Fileserver', key: 'fileserver', label: 'File Server' },
      { stencil: 'File Server', key: 'file_server', label: 'File Server (alt)' },
      { stencil: 'Host', key: 'host', label: 'Host', suggestedTypes: ['server'] },
      { stencil: 'IPTV Server', key: 'iptv_server', label: 'IPTV Server' },
      { stencil: 'PC', key: 'pc', label: 'PC', suggestedTypes: ['workstation'] },
      { stencil: 'Macintosh', key: 'macintosh', label: 'Macintosh', suggestedTypes: ['workstation'] },
      { stencil: 'Laptop', key: 'laptop', label: 'Laptop', suggestedTypes: ['workstation'] },
      { stencil: 'Printer', key: 'printer', label: 'Printer' },
      { stencil: 'IBM Mainframe', key: 'mainframe', label: 'IBM Mainframe' },
      { stencil: 'Antenna', key: 'antenna', label: 'Antenna' },
      { stencil: 'Wireless', key: 'wireless', label: 'Wireless' },
      { stencil: 'Wireless Bridge', key: 'wireless_bridge', label: 'Wireless Bridge' },
      { stencil: 'Radio Tower', key: 'radio_tower', label: 'Radio Tower' },
      { stencil: 'Satellite Dish', key: 'satellite_dish', label: 'Satellite Dish' },
      { stencil: 'Cloud', key: 'cloud', label: 'Cloud' },
      { stencil: 'Tape Array', key: 'tape_array', label: 'Tape Array' },
    ],
  },
  {
    id: 'cisco19',
    label: 'Cisco (19)',
    files: ['cisco19.xml'],
    includeAllShapes: true,
    curated: [
      { stencil: 'router', key: 'router', label: 'Router', suggestedTypes: ['router'] },
      { stencil: 'l3 switch', key: 'l3_switch', label: 'Layer 3 Switch', suggestedTypes: ['switch'] },
      { stencil: 'l2 switch', key: 'l2_switch', label: 'Layer 2 Switch', suggestedTypes: ['switch'] },
      { stencil: 'workgroup switch', key: 'workgroup_switch', label: 'Workgroup Switch' },
      { stencil: 'asa 5500', key: 'asa_5500', label: 'ASA 5500', suggestedTypes: ['firewall'] },
      { stencil: 'firewall', key: 'firewall', label: 'Firewall', suggestedTypes: ['firewall'] },
      { stencil: 'server', key: 'server', label: 'Server', suggestedTypes: ['server'] },
      { stencil: 'blade server', key: 'blade_server', label: 'Blade Server', suggestedTypes: ['server'] },
      { stencil: 'standard host', key: 'standard_host', label: 'Standard Host' },
      { stencil: 'storage', key: 'storage', label: 'Storage', suggestedTypes: ['nas'] },
      { stencil: 'cloud', key: 'cloud', label: 'Cloud' },
      { stencil: 'cloud2', key: 'cloud_alt', label: 'Cloud (alt)' },
      { stencil: 'wireless access point', key: 'wireless_access_point', label: 'Wireless AP', suggestedTypes: ['access_point'] },
      { stencil: 'access point', key: 'access_point', label: 'Access Point', suggestedTypes: ['access_point'] },
      { stencil: 'camera', key: 'camera', label: 'Camera', suggestedTypes: ['camera'] },
      { stencil: 'cell phone', key: 'cell_phone', label: 'Cell Phone' },
      { stencil: 'ip phone', key: 'ip_phone', label: 'IP Phone', suggestedTypes: ['phone'] },
      { stencil: 'laptop', key: 'laptop', label: 'Laptop', suggestedTypes: ['workstation'] },
      { stencil: 'pc', key: 'pc', label: 'PC', suggestedTypes: ['workstation'] },
      { stencil: 'printer', key: 'printer', label: 'Printer' },
      { stencil: 'router with firewall', key: 'router_with_firewall', label: 'Router With Firewall' },
      { stencil: 'asr 1000', key: 'asr_1000', label: 'ASR 1000' },
      { stencil: 'asr 9000', key: 'asr_9000', label: 'ASR 9000' },
      { stencil: 'branch', key: 'branch', label: 'Branch' },
      { stencil: 'data center', key: 'data_center', label: 'Data Center' },
      { stencil: 'iot cloud', key: 'iot_cloud', label: 'IoT Cloud', suggestedTypes: ['iot'] },
    ],
  },
];

// ─── XML fetch + parse ────────────────────────────────────────────────────────

async function fetchStencilFile(rel: string): Promise<string> {
  const cachePath = join(CACHE_DIR, rel);
  if (existsSync(cachePath)) return readFile(cachePath, 'utf8');
  await mkdir(dirname(cachePath), { recursive: true });
  const url = `${BASE}/${rel}`;
  process.stdout.write(`  fetching ${url}\n`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${url} ${res.status}`);
  const text = await res.text();
  await writeFile(cachePath, text, 'utf8');
  return text;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  preserveOrder: true,
  parseAttributeValue: false,
  trimValues: true,
});

interface ShapeBundle {
  attrs: Record<string, string>;
  // background is drawn first, then foreground (matching drawio's render order).
  commands: OrderedNode[];
}
type OrderedNode = Record<string, OrderedNode[]> & { ':@'?: Record<string, string> };

function findShapesInDoc(doc: OrderedNode[]): ShapeBundle[] {
  const out: ShapeBundle[] = [];
  function walk(nodes: OrderedNode[]) {
    for (const node of nodes) {
      for (const tag of Object.keys(node)) {
        if (tag === ':@') continue;
        const children = node[tag] as OrderedNode[];
        if (tag === 'shape') {
          const attrs = stripAttrPrefix((node[':@'] || {}) as Record<string, string>);
          const bg = (children || []).find(c => 'background' in c);
          const fg = (children || []).find(c => 'foreground' in c);
          const bgCmds = (bg?.background as OrderedNode[]) || [];
          const fgCmds = (fg?.foreground as OrderedNode[]) || [];
          if (bgCmds.length || fgCmds.length) {
            out.push({ attrs, commands: [...bgCmds, ...fgCmds] });
          }
        } else if (Array.isArray(children)) {
          walk(children);
        }
      }
    }
  }
  walk(doc);
  return out;
}

function stripAttrPrefix(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    out[k.startsWith('@_') ? k.slice(2) : k] = v;
  }
  return out;
}

function attrsOf(node: OrderedNode): Record<string, string> {
  return stripAttrPrefix((node[':@'] || {}) as Record<string, string>);
}

// ─── Shape → SVG converter ────────────────────────────────────────────────────

interface DrawState {
  strokeColor: string;
  fillColor: string;
  strokeWidth: number;
  dashArray: string | null;
  lineCap: string;
  lineJoin: string;
  miterLimit: string | null;
  alpha: number;
}

// Defaults match drawio's standard cell style: light-blue fill with darker-blue
// stroke. Stencils that set NO fillcolor/strokecolor (e.g. networks/Firewall —
// relies on these to get the brick-mortar contrast) render the same way they
// look in drawio's sidebar. Stencils that DO set explicit colors override these
// per shape command, so monochrome icons keep their explicit hues.
const DEFAULT_FILL = '#dae8fc';
const DEFAULT_STROKE = '#6c8ebf';

function defaultState(strokewidth: number): DrawState {
  return {
    strokeColor: DEFAULT_STROKE,
    fillColor: DEFAULT_FILL,
    strokeWidth: strokewidth,
    dashArray: null,
    lineCap: 'butt',
    lineJoin: 'miter',
    miterLimit: null,
    alpha: 1,
  };
}

function resolveColor(c: string | undefined, state: DrawState): string {
  if (!c) return state.strokeColor;
  // drawio dynamic-color tokens
  if (c === 'fill') return state.fillColor;
  if (c === 'stroke') return state.strokeColor;
  if (c === 'none') return 'none';
  if (c === 'shadow') return '#999999';
  // Hex literal forms
  if (c.startsWith('#')) return c;
  if (/^[0-9a-fA-F]{6}$/.test(c)) return `#${c}`;
  if (/^[0-9a-fA-F]{3}$/.test(c)) return `#${c}`;
  if (/^[0-9a-fA-F]{8}$/.test(c)) return `#${c}`;
  // Drawio sometimes uses tokens like "strokeColor2" — fall back to current stroke.
  return state.strokeColor;
}

function fmt(n: number | string): string {
  if (typeof n === 'number') return Number.isFinite(n) ? +n.toFixed(3) + '' : '0';
  const v = parseFloat(n);
  return Number.isFinite(v) ? +v.toFixed(3) + '' : '0';
}

// Convert a single shape's foreground command list to SVG inner markup.
function shapeToSvg(shape: ShapeBundle): string {
  const w = parseFloat(shape.attrs.w || '100');
  const h = parseFloat(shape.attrs.h || '100');
  const initialStrokeWidth = parseFloat(shape.attrs.strokewidth || '1') || 1;

  let state: DrawState = defaultState(initialStrokeWidth);
  const stack: DrawState[] = [];

  // Buffered shape: kind + attrs OR a path's `d` string.
  type Pending =
    | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number; ry?: number }
    | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
    | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
    | { kind: 'path'; d: string };
  let pending: Pending | null = null;
  const elements: string[] = [];

  // Wrap drawio's default colors in CSS variables so an inline-rendered SVG
  // can be tinted by setting --icon-primary / --icon-secondary on a wrapper,
  // while explicit stencil colors (e.g. flame's #ffffff) stay literal.
  // When the SVG is loaded as <img>, CSS vars don't propagate but the
  // fallback hex restores the original look.
  const colorAttr = (c: string, role: 'fill' | 'stroke'): string => {
    if (c === DEFAULT_FILL) return `var(--icon-primary, ${DEFAULT_FILL})`;
    if (c === DEFAULT_STROKE) return `var(--icon-secondary, ${DEFAULT_STROKE})`;
    void role;
    return c;
  };

  const emit = (mode: 'fill' | 'stroke' | 'fillstroke') => {
    if (!pending) return;
    const fill = mode === 'stroke' ? 'none' : colorAttr(state.fillColor, 'fill');
    const stroke = mode === 'fill' ? 'none' : colorAttr(state.strokeColor, 'stroke');
    const sw = mode === 'fill' ? 0 : state.strokeWidth;
    const styleParts: string[] = [];
    styleParts.push(`fill="${fill}"`, `stroke="${stroke}"`, `stroke-width="${fmt(sw)}"`);
    if (state.dashArray && mode !== 'fill') styleParts.push(`stroke-dasharray="${state.dashArray}"`);
    if (state.lineCap !== 'butt' && mode !== 'fill') styleParts.push(`stroke-linecap="${state.lineCap}"`);
    if (state.lineJoin !== 'miter' && mode !== 'fill') styleParts.push(`stroke-linejoin="${state.lineJoin}"`);
    if (state.miterLimit && mode !== 'fill') styleParts.push(`stroke-miterlimit="${state.miterLimit}"`);
    if (state.alpha !== 1) styleParts.push(`opacity="${state.alpha}"`);
    const style = styleParts.join(' ');
    switch (pending.kind) {
      case 'rect': {
        const rx = pending.rx ? ` rx="${fmt(pending.rx)}"` : '';
        const ry = pending.ry ? ` ry="${fmt(pending.ry)}"` : '';
        elements.push(`<rect x="${fmt(pending.x)}" y="${fmt(pending.y)}" width="${fmt(pending.w)}" height="${fmt(pending.h)}"${rx}${ry} ${style}/>`);
        break;
      }
      case 'ellipse':
        elements.push(`<ellipse cx="${fmt(pending.cx)}" cy="${fmt(pending.cy)}" rx="${fmt(pending.rx)}" ry="${fmt(pending.ry)}" ${style}/>`);
        break;
      case 'line':
        elements.push(`<line x1="${fmt(pending.x1)}" y1="${fmt(pending.y1)}" x2="${fmt(pending.x2)}" y2="${fmt(pending.y2)}" ${style}/>`);
        break;
      case 'path':
        elements.push(`<path d="${pending.d}" ${style}/>`);
        break;
    }
    pending = null;
  };

  const consumePath = (children: OrderedNode[]): string => {
    const parts: string[] = [];
    for (const c of children) {
      const tag = Object.keys(c).find(k => k !== ':@');
      if (!tag) continue;
      const a = attrsOf(c);
      switch (tag) {
        case 'move': parts.push(`M ${fmt(a.x)} ${fmt(a.y)}`); break;
        case 'line': parts.push(`L ${fmt(a.x)} ${fmt(a.y)}`); break;
        case 'curve': parts.push(`C ${fmt(a.x1)} ${fmt(a.y1)} ${fmt(a.x2)} ${fmt(a.y2)} ${fmt(a.x3)} ${fmt(a.y3)}`); break;
        case 'quad': parts.push(`Q ${fmt(a.x1)} ${fmt(a.y1)} ${fmt(a.x2)} ${fmt(a.y2)}`); break;
        case 'arc': {
          const rx = a.rx; const ry = a.ry;
          const xrot = a['x-axis-rotation'] || '0';
          const large = a['large-arc-flag'] || '0';
          const sweep = a['sweep-flag'] || '0';
          parts.push(`A ${fmt(rx)} ${fmt(ry)} ${fmt(xrot)} ${large} ${sweep} ${fmt(a.x)} ${fmt(a.y)}`);
          break;
        }
        case 'close': parts.push('Z'); break;
        // Ignore other tags inside <path> (rare).
      }
    }
    return parts.join(' ');
  };

  for (const node of shape.commands) {
    const tag = Object.keys(node).find(k => k !== ':@');
    if (!tag) continue;
    const a = attrsOf(node);
    const children = (node[tag] as OrderedNode[]) || [];
    switch (tag) {
      case 'save': stack.push({ ...state }); break;
      case 'restore': { const s = stack.pop(); if (s) state = s; break; }
      case 'strokecolor': state.strokeColor = resolveColor(a.color, state); break;
      case 'fillcolor': state.fillColor = resolveColor(a.color, state); break;
      case 'strokewidth':
      case 'linewidth': {
        const val = a.width;
        if (val && val !== 'inherit') {
          const parsed = parseFloat(val);
          if (Number.isFinite(parsed)) state.strokeWidth = parsed;
        }
        break;
      }
      case 'dashed':
        if (a.dashed === '0') state.dashArray = null;
        else if (!state.dashArray) state.dashArray = '4 2';
        break;
      case 'dashpattern': state.dashArray = a.pattern || state.dashArray; break;
      case 'linecap': state.lineCap = a.cap === 'flat' ? 'butt' : (a.cap || state.lineCap); break;
      case 'linejoin': state.lineJoin = a.join || state.lineJoin; break;
      case 'miterlimit': state.miterLimit = a.limit || null; break;
      case 'alpha': state.alpha = parseFloat(a.alpha || '1'); break;
      case 'rect':
        pending = {
          kind: 'rect',
          x: parseFloat(a.x || '0'), y: parseFloat(a.y || '0'),
          w: parseFloat(a.w || '0'), h: parseFloat(a.h || '0'),
        };
        break;
      case 'roundrect': {
        const rectW = parseFloat(a.w || '0');
        const rectH = parseFloat(a.h || '0');
        const arcSize = parseFloat(a.arcsize || '0');
        const r = Math.min(rectW, rectH) * arcSize / 100;
        pending = {
          kind: 'rect',
          x: parseFloat(a.x || '0'), y: parseFloat(a.y || '0'),
          w: rectW, h: rectH, rx: r, ry: r,
        };
        break;
      }
      case 'ellipse': {
        const ex = parseFloat(a.x || '0'); const ey = parseFloat(a.y || '0');
        const ew = parseFloat(a.w || '0'); const eh = parseFloat(a.h || '0');
        pending = { kind: 'ellipse', cx: ex + ew / 2, cy: ey + eh / 2, rx: ew / 2, ry: eh / 2 };
        break;
      }
      case 'line':
        pending = {
          kind: 'line',
          x1: parseFloat(a.x1 || '0'), y1: parseFloat(a.y1 || '0'),
          x2: parseFloat(a.x2 || '0'), y2: parseFloat(a.y2 || '0'),
        };
        break;
      case 'path': pending = { kind: 'path', d: consumePath(children) }; break;
      case 'fill': emit('fill'); break;
      case 'stroke': emit('stroke'); break;
      case 'fillstroke': emit('fillstroke'); break;
      // Skipped: text, image, clip, gradients, dashpattern variants.
      default:
        // Silently ignore — most uncovered tags are stylistic.
        break;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(w)} ${fmt(h)}" width="${fmt(w)}" height="${fmt(h)}">${elements.join('')}</svg>`;
}

// ─── Driver ──────────────────────────────────────────────────────────────────

function tsHeader(): string {
  return '// AUTO-GENERATED by scripts/build-icon-libraries.ts. Do not edit by hand.\n';
}

// drawio's runtime constructs a stencil's shape key as
// `mxgraph.<file_path_dot_separated>.<name_normalized>` — lowercase, with
// runs of non-alphanumeric chars collapsed to underscores. We invert this
// at build time so the importer can map a drawio shape (e.g.
// `mxgraph.cisco.routers.atm_router`) back to our (libraryId, iconKey).
function normalizeStencilName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function shapePrefixForFile(relPath: string): string {
  // 'cisco/routers.xml' -> 'mxgraph.cisco.routers'; 'networks.xml' -> 'mxgraph.networks'
  const noExt = relPath.replace(/\.xml$/i, '');
  const parts = noExt.split('/').filter(Boolean);
  return ['mxgraph', ...parts].join('.');
}

async function main() {
  if (existsSync(SVG_OUT_ROOT)) await rm(SVG_OUT_ROOT, { recursive: true, force: true });
  await mkdir(SVG_OUT_ROOT, { recursive: true });

  // For each library, fetch+parse all source files into a shape map (keyed by exact name).
  const manifest: Array<{ id: string; label: string; icons: Array<{ key: string; label: string; suggestedTypes?: string[] }> }> = [];
  const allowlist: Record<string, string[]> = {};
  // drawio shape key -> { libraryId, iconKey, suggestedType? }. Built as we
  // emit so we capture which file each curated stencil actually came from
  // (matters for cisco's multi-file library: prefix differs per sub-folder).
  const drawioMap: Record<string, { libraryId: string; iconKey: string; suggestedType?: string }> = {};

  for (const lib of LIBRARIES) {
    process.stdout.write(`\nLibrary: ${lib.id}\n`);
    const shapes = new Map<string, { bundle: ShapeBundle; sourceFile: string }>();
    for (const file of lib.files) {
      const xml = await fetchStencilFile(file);
      const doc = parser.parse(xml) as OrderedNode[];
      for (const s of findShapesInDoc(doc)) {
        const name = s.attrs.name;
        if (!name) continue;
        if (!shapes.has(name)) shapes.set(name, { bundle: s, sourceFile: file });
      }
    }

    const libDir = join(SVG_OUT_ROOT, lib.id);
    await mkdir(libDir, { recursive: true });

    const emittedIcons: Array<{ key: string; label: string; suggestedTypes?: string[] }> = [];
    const emittedKeys: string[] = [];
    const usedKeys = new Set<string>();
    const curatedStencils = new Set(lib.curated.map(c => c.stencil));
    for (const c of lib.curated) {
      const found = shapes.get(c.stencil);
      if (!found) {
        process.stdout.write(`  WARN: ${lib.id}: stencil "${c.stencil}" not found, skipping\n`);
        continue;
      }
      const svg = shapeToSvg(found.bundle);
      await writeFile(join(libDir, `${c.key}.svg`), svg, 'utf8');
      emittedIcons.push({ key: c.key, label: c.label, suggestedTypes: c.suggestedTypes });
      emittedKeys.push(c.key);
      usedKeys.add(c.key);
      // Reverse map: derive the drawio shape key from this stencil's source
      // file + normalized name. First-class hit for the importer.
      const drawioKey = `${shapePrefixForFile(found.sourceFile)}.${normalizeStencilName(c.stencil)}`;
      drawioMap[drawioKey] = {
        libraryId: lib.id,
        iconKey: c.key,
        suggestedType: c.suggestedTypes?.[0],
      };
      process.stdout.write(`  ✓ ${c.key}.svg (${c.stencil}) — ${drawioKey}\n`);
    }

    // Auto-include any remaining shapes not covered by `curated`. iconKey is
    // derived from the stencil name (lowercase, non-alphanumeric → underscore);
    // collisions get a numeric suffix. Label is the stencil name verbatim,
    // which matches drawio's sidebar.
    if (lib.includeAllShapes) {
      let autoCount = 0;
      for (const [stencilName, found] of shapes) {
        if (curatedStencils.has(stencilName)) continue;
        let key = normalizeStencilName(stencilName);
        if (!key) continue;
        if (usedKeys.has(key)) {
          let n = 2;
          while (usedKeys.has(`${key}_${n}`)) n++;
          key = `${key}_${n}`;
        }
        const svg = shapeToSvg(found.bundle);
        await writeFile(join(libDir, `${key}.svg`), svg, 'utf8');
        emittedIcons.push({ key, label: stencilName });
        emittedKeys.push(key);
        usedKeys.add(key);
        const drawioKey = `${shapePrefixForFile(found.sourceFile)}.${normalizeStencilName(stencilName)}`;
        if (!drawioMap[drawioKey]) {
          drawioMap[drawioKey] = { libraryId: lib.id, iconKey: key };
        }
        autoCount++;
      }
      process.stdout.write(`  + ${autoCount} auto-included from XML\n`);
    }

    manifest.push({ id: lib.id, label: lib.label, icons: emittedIcons });
    allowlist[lib.id] = emittedKeys;
  }

  // Write client manifest.
  await mkdir(dirname(CLIENT_MANIFEST), { recursive: true });
  const manifestSrc =
    tsHeader() +
    `
export interface IconLibraryEntry {
  key: string;
  label: string;
  suggestedTypes?: string[];
}

export interface IconLibrary {
  id: string;
  label: string;
  icons: IconLibraryEntry[];
}

export const ICON_LIBRARIES: IconLibrary[] = ${JSON.stringify(manifest, null, 2)};

export function libraryIconUrl(libraryId: string, iconKey: string): string {
  return \`/icon-libraries/\${libraryId}/\${iconKey}.svg\`;
}

export function findLibrary(libraryId: string): IconLibrary | undefined {
  return ICON_LIBRARIES.find(l => l.id === libraryId);
}

export function findLibraryIcon(libraryId: string, iconKey: string): IconLibraryEntry | undefined {
  return findLibrary(libraryId)?.icons.find(i => i.key === iconKey);
}
`;
  await writeFile(CLIENT_MANIFEST, manifestSrc, 'utf8');
  process.stdout.write(`\nWrote ${CLIENT_MANIFEST}\n`);

  // Write server allowlist.
  const allowlistSrc =
    tsHeader() +
    `
// Set of valid library_id -> Set<icon_key> for server-side validation.
export const LIBRARY_ICON_KEYS: Record<string, Set<string>> = {
${Object.entries(allowlist).map(([k, v]) => `  ${JSON.stringify(k)}: new Set(${JSON.stringify(v)}),`).join('\n')}
};

export function isValidLibraryIcon(libraryId: string, iconKey: string): boolean {
  return LIBRARY_ICON_KEYS[libraryId]?.has(iconKey) ?? false;
}
`;
  await writeFile(SERVER_ALLOWLIST, allowlistSrc, 'utf8');
  process.stdout.write(`Wrote ${SERVER_ALLOWLIST}\n`);

  // drawio import reverse map: drawio shape key -> our (libraryId, iconKey).
  // Used by the drawio importer so a cell with style=shape=mxgraph.cisco19.router
  // is stored as a device with a device_icon_overrides row pointing at
  // cisco19/router.
  const drawioMapSrc =
    tsHeader() +
    `
import type { DeviceType } from 'shared/types';

export interface DrawioShapeMapping {
  libraryId: string;
  iconKey: string;
  suggestedType?: DeviceType;
}

// Drawio shape keys are lowercase, with non-alphanumeric runs collapsed to
// underscores; matching is case-insensitive but values here are pre-lowered.
export const DRAWIO_SHAPE_MAP: Record<string, DrawioShapeMapping> = ${JSON.stringify(drawioMap, null, 2)};

export function lookupDrawioShape(rawShapeKey: string | null | undefined): DrawioShapeMapping | undefined {
  if (!rawShapeKey) return undefined;
  return DRAWIO_SHAPE_MAP[rawShapeKey.toLowerCase()];
}
`;
  await writeFile(CLIENT_DRAWIO_MAP, drawioMapSrc, 'utf8');
  process.stdout.write(`Wrote ${CLIENT_DRAWIO_MAP}\n`);

  process.stdout.write(`\nDone. ${manifest.reduce((n, l) => n + l.icons.length, 0)} icons across ${manifest.length} libraries; ${Object.keys(drawioMap).length} drawio shape mappings.\n`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
