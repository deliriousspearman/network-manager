import type { ParsedUserHistoryEntry, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function UserHistoryTable({ entries, rules = [] }: { entries: ParsedUserHistoryEntry[]; rules?: HighlightRule[] }) {
  if (!entries.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No history entries parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th style={{ width: '4rem' }}>#</th>
            <th style={{ width: '12rem' }}>Timestamp</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={getRowStyle([e.line_no, e.timestamp, e.command], rules)}>
              <td>{e.line_no}</td>
              <td>{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</td>
              <td><code style={{ fontSize: '0.8rem' }}>{e.command}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
