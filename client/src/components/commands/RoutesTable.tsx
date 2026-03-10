import type { ParsedRoute, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function RoutesTable({ routes, rules = [] }: { routes: ParsedRoute[]; rules?: HighlightRule[] }) {
  if (!routes.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No routes parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Destination</th>
            <th>Gateway</th>
            <th>Device</th>
            <th>Protocol</th>
            <th>Scope</th>
            <th>Metric</th>
          </tr>
        </thead>
        <tbody>
          {routes.map(r => (
            <tr key={r.id} style={getRowStyle([r.destination, r.gateway, r.device, r.protocol, r.scope, r.metric], rules)}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.destination}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.gateway || '—'}</td>
              <td>{r.device || '—'}</td>
              <td>{r.protocol || '—'}</td>
              <td>{r.scope || '—'}</td>
              <td>{r.metric || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
