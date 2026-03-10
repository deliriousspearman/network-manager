export interface LastRow {
  user: string;
  terminal: string;
  source_ip: string;
  login_time: string;
  duration: string;
}

export function parseLast(raw: string): LastRow[] {
  const lines = raw.trim().split('\n');
  const rows: LastRow[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Skip summary lines
    if (trimmed.startsWith('wtmp begins') || trimmed.startsWith('btmp begins')) continue;
    if (trimmed.startsWith('reboot')) continue;

    // Format: user terminal source_ip login_time - logout_time (duration)
    // Or:     user terminal source_ip login_time   still logged in
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;

    const user = parts[0];
    const terminal = parts[1];

    // The source IP might be missing (local logins), detect by checking if 3rd field looks like an IP/hostname
    let sourceIp = '';
    let timeStartIdx = 2;

    if (parts[2] && (parts[2].match(/^\d+\.\d+/) || parts[2].includes(':') || parts[2].match(/^[a-zA-Z]/))) {
      // Check if it's a day-of-week (which would indicate no source IP)
      if (['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].includes(parts[2])) {
        timeStartIdx = 2;
      } else {
        sourceIp = parts[2];
        timeStartIdx = 3;
      }
    }

    // Extract login time - everything from the day-of-week to the dash or "still"
    const rest = parts.slice(timeStartIdx).join(' ');
    const dashMatch = rest.match(/^(.+?)\s+-\s+(.+?)(?:\s+\((.+?)\))?$/);
    const stillMatch = rest.match(/^(.+?)\s+still logged in/);

    let loginTime = '';
    let duration = '';

    if (dashMatch) {
      loginTime = dashMatch[1].trim();
      duration = dashMatch[3] ? dashMatch[3].trim() : '';
    } else if (stillMatch) {
      loginTime = stillMatch[1].trim();
      duration = 'still logged in';
    } else {
      loginTime = rest;
    }

    rows.push({ user, terminal, source_ip: sourceIp, login_time: loginTime, duration });
  }

  return rows;
}
