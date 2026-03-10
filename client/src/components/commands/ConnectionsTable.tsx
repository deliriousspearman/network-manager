import type { ParsedNetConnection, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function ConnectionsTable({ connections, rules = [] }: { connections: ParsedNetConnection[]; rules?: HighlightRule[] }) {
  if (!connections.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No connections parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Protocol</th>
            <th>Local Address</th>
            <th>Foreign Address</th>
            <th>State</th>
            <th>PID/Program</th>
          </tr>
        </thead>
        <tbody>
          {connections.map(c => (
            <tr key={c.id} style={getRowStyle([c.protocol, c.local_addr, c.foreign_addr, c.state, c.pid_program], rules)}>
              <td>{c.protocol}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.local_addr}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{c.foreign_addr}</td>
              <td>{c.state}</td>
              <td>{c.pid_program}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
