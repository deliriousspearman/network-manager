import type { ParsedMount, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function MountTable({ mounts, rules = [] }: { mounts: ParsedMount[]; rules?: HighlightRule[] }) {
  if (!mounts.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No mounts parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Device</th>
            <th>Mount Point</th>
            <th>FS Type</th>
            <th>Options</th>
          </tr>
        </thead>
        <tbody>
          {mounts.map(m => (
            <tr key={m.id} style={getRowStyle([m.device, m.mount_point, m.fs_type, m.options], rules)}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.device}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{m.mount_point}</td>
              <td>{m.fs_type}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.75rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.options}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
