import type { ParsedInterface, HighlightRule } from 'shared/types';

function getRowStyle(fields: (string | number | null | undefined)[], rules: HighlightRule[]): React.CSSProperties {
  const text = fields.map(f => String(f ?? '')).join(' ').toLowerCase();
  for (const rule of rules) {
    if (text.includes(rule.keyword.toLowerCase())) return { background: rule.color, ...(rule.text_color ? { color: rule.text_color } : {}) };
  }
  return {};
}

export default function InterfacesTable({ interfaces, rules = [] }: { interfaces: ParsedInterface[]; rules?: HighlightRule[] }) {
  if (!interfaces.length) return <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>No interfaces parsed.</p>;

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Interface</th>
            <th>State</th>
            <th>IP Addresses</th>
            <th>MAC Address</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map(iface => {
            let ips: string[] = [];
            try { ips = JSON.parse(iface.ip_addresses); } catch {}
            return (
              <tr key={iface.id} style={getRowStyle([iface.interface_name, iface.state, iface.ip_addresses, iface.mac_address], rules)}>
                <td style={{ fontWeight: 500 }}>{iface.interface_name}</td>
                <td>{iface.state}</td>
                <td>
                  {ips.map((ip, i) => (
                    <div key={i} style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{ip}</div>
                  ))}
                </td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{iface.mac_address || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
