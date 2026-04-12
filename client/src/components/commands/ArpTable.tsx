import type { ParsedArpEntry, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function ArpTable({ entries, rules = [] }: { entries: ParsedArpEntry[]; rules?: HighlightRule[] }) {
  if (!entries.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No ARP entries parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>IP Address</th>
            <th>MAC Address</th>
            <th>Interface</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(e => (
            <tr key={e.id} style={getRowStyle([e.ip, e.mac_address, e.interface_name], rules)}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.ip || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.mac_address || '—'}</td>
              <td>{e.interface_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
