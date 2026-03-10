export interface SystemctlServiceRow {
  unit_name: string;
  load: string;
  active: string;
  sub: string;
  description: string;
}

// Parse `systemctl list-units --type=service [--all]` tabular output.
// Also handles `systemctl status <service>` single-service output.
export function parseSystemctlStatus(raw: string): SystemctlServiceRow[] {
  const lines = raw.split('\n');

  // Detect list format: has a header line with UNIT, LOAD, ACTIVE columns
  const headerIdx = lines.findIndex(l => /\bUNIT\b/.test(l) && /\bLOAD\b/.test(l) && /\bACTIVE\b/.test(l));
  if (headerIdx !== -1) {
    return parseListFormat(lines, headerIdx);
  }

  // Otherwise try single-service status format
  return parseSingleServiceFormat(lines);
}

function parseListFormat(lines: string[], headerIdx: number): SystemctlServiceRow[] {
  const header = lines[headerIdx];

  // Find column start positions from the header
  const loadIdx = header.indexOf('LOAD');
  const activeIdx = header.indexOf('ACTIVE');
  const subIdx = header.indexOf('SUB');
  const descIdx = header.indexOf('DESCRIPTION');

  if (loadIdx === -1 || activeIdx === -1) return [];

  const rows: SystemctlServiceRow[] = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const raw = lines[i];
    // Strip leading Unicode status symbols and whitespace (●, ○, ✗, ×, etc.)
    const stripped = raw.replace(/^[\s●○✗×✓•◉◎]+/, '').trimEnd();
    if (!stripped || stripped.startsWith('LOAD') || stripped.startsWith('To show')) break;

    // Extract unit name (first whitespace-delimited token)
    const match = stripped.match(/^(\S+)\s+(.*)/);
    if (!match) continue;

    const unit_name = match[0].split(/\s+/)[0];
    // Use column positions on the original raw line for the other fields
    const load = loadIdx < raw.length ? raw.substring(loadIdx).split(/\s+/)[0].trim() : '';
    const active = activeIdx < raw.length ? raw.substring(activeIdx).split(/\s+/)[0].trim() : '';
    const sub = subIdx !== -1 && subIdx < raw.length ? raw.substring(subIdx).split(/\s+/)[0].trim() : '';
    const description = descIdx !== -1 && descIdx < raw.length ? raw.substring(descIdx).trim() : '';

    if (!unit_name || unit_name === 'UNIT') continue;

    rows.push({ unit_name, load, active, sub, description });
  }

  return rows;
}

function parseSingleServiceFormat(lines: string[]): SystemctlServiceRow[] {
  // First non-empty line: "● nginx.service - Description" or "nginx.service - Description"
  let unit_name = '';
  let description = '';
  let load = '';
  let active = '';
  let sub = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (!unit_name) {
      // Strip leading symbol
      const clean = trimmed.replace(/^[●○✗×✓•◉◎]\s*/, '');
      const dashIdx = clean.indexOf(' - ');
      if (dashIdx !== -1) {
        unit_name = clean.substring(0, dashIdx).trim();
        description = clean.substring(dashIdx + 3).trim();
      } else {
        unit_name = clean.split(/\s+/)[0];
      }
      continue;
    }

    const loadMatch = trimmed.match(/^Loaded:\s*(.+?)(?:\s*;.*)?$/);
    if (loadMatch) {
      // Extract just the load state word: "loaded", "not-found", "masked"
      load = loadMatch[1].split(/[\s(]/)[0].trim();
      continue;
    }

    const activeMatch = trimmed.match(/^Active:\s*(\S+)\s*\((\S+)\)/);
    if (activeMatch) {
      active = activeMatch[1];
      sub = activeMatch[2];
      continue;
    }
    // Active without sub-state
    const activeSimple = trimmed.match(/^Active:\s*(\S+)/);
    if (activeSimple && !active) {
      active = activeSimple[1];
      continue;
    }
  }

  if (!unit_name) return [];
  return [{ unit_name, load, active, sub, description }];
}
