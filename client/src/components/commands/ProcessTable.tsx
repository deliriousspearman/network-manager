import type { ParsedProcess, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function ProcessTable({ processes, rules = [] }: { processes: ParsedProcess[]; rules?: HighlightRule[] }) {
  if (!processes.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No processes parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>PID</th>
            <th>User</th>
            <th>CPU%</th>
            <th>MEM%</th>
            <th>Command</th>
          </tr>
        </thead>
        <tbody>
          {processes.map(p => (
            <tr key={p.id} style={getRowStyle([p.pid, p.user, p.command], rules)}>
              <td>{p.pid}</td>
              <td>{p.user}</td>
              <td>{p.cpu_percent}</td>
              <td>{p.mem_percent}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.command}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
