import type { ParsedRouterConfig } from './types.js';
import { parsePfsenseFamilyXml } from './pfsense.js';

// OPNsense forks from pfSense and m0n0wall and reuses the same config.xml
// schema; only the root element name differs (`<opnsense>` vs `<pfsense>`).
// Newer OPNsense releases add model-based config under `<OPNsense>` (capitalised)
// for plugins, but the core sections we extract — system, interfaces, vlans,
// staticroutes, filter, nat, dhcpd, users — all live under the lowercase
// `<opnsense>` root for backwards compatibility.
export function parseOpnsenseConfig(raw: string): ParsedRouterConfig {
  return parsePfsenseFamilyXml(raw, 'opnsense', 'OPNsense');
}
