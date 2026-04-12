import { parseCiscoConfig } from './cisco.js';
import { parseMikrotikConfig } from './mikrotik.js';
import { parseVyattaConfig } from './vyatta.js';
import { parseFortigateConfig } from './fortigate.js';
import { parseJuniperConfig } from './juniper.js';
import { parsePfsenseConfig } from './pfsense.js';
import { parseOpnsenseConfig } from './opnsense.js';
import { parsePaloAltoConfig } from './paloalto.js';
import type { ParsedRouterConfig } from './types.js';

export type { ParsedRouterConfig } from './types.js';

// Registry of router config parsers keyed by vendor. Vendors not in the registry
// will fall through to raw-view mode at the route layer.
export const routerConfigParsers: Record<string, (raw: string) => ParsedRouterConfig> = {
  cisco: parseCiscoConfig,
  mikrotik: parseMikrotikConfig,
  vyos: parseVyattaConfig,
  edgeos: parseVyattaConfig,
  // UniFi gateways (UDM/UXG/USG) are EdgeOS-derived; the same parser handles them.
  unifi: parseVyattaConfig,
  fortigate: parseFortigateConfig,
  juniper: parseJuniperConfig,
  pfsense: parsePfsenseConfig,
  opnsense: parseOpnsenseConfig,
  paloalto: parsePaloAltoConfig,
};
