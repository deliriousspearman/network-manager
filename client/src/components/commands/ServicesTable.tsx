import type { ParsedService, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

function activeClass(active: string): React.CSSProperties {
  if (active === 'active') return { color: 'var(--color-success, #22c55e)', fontWeight: 600 };
  if (active === 'failed') return { color: 'var(--color-danger, #ef4444)', fontWeight: 600 };
  if (active === 'inactive') return { color: 'var(--color-text-secondary)' };
  return {};
}

export default function ServicesTable({ services, rules = [] }: { services: ParsedService[]; rules?: HighlightRule[] }) {
  if (!services.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No services parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Unit</th>
            <th>Load</th>
            <th>Active</th>
            <th>Sub</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {services.map(s => (
            <tr key={s.id} style={getRowStyle([s.unit_name, s.load, s.active, s.sub, s.description], rules)}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{s.unit_name}</td>
              <td>{s.load}</td>
              <td style={activeClass(s.active)}>{s.active}</td>
              <td>{s.sub}</td>
              <td style={{ fontSize: '0.85rem' }}>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
