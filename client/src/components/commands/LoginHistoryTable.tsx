import type { ParsedLogin, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function LoginHistoryTable({ logins, rules = [] }: { logins: ParsedLogin[]; rules?: HighlightRule[] }) {
  if (!logins.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No logins parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Terminal</th>
            <th>Source IP</th>
            <th>Login Time</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {logins.map(l => (
            <tr key={l.id} style={getRowStyle([l.user, l.terminal, l.source_ip, l.login_time, l.duration], rules)}>
              <td>{l.user}</td>
              <td>{l.terminal}</td>
              <td>{l.source_ip || '—'}</td>
              <td>{l.login_time}</td>
              <td>{l.duration || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
