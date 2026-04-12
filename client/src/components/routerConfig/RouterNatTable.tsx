import type { ParsedRouterNatRule } from 'shared/types';

function formatEndpoint(addr: string | null, port: string | null): string {
  if (!addr && !port) return '—';
  if (addr && port) return `${addr}:${port}`;
  return addr || port || '—';
}

export default function RouterNatTable({ rules }: { rules: ParsedRouterNatRule[] }) {
  if (!rules.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Protocol</th>
            <th>Inside</th>
            <th>Outside</th>
          </tr>
        </thead>
        <tbody>
          {rules.map(n => (
            <tr key={n.id}>
              <td>{n.nat_type}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{n.protocol || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{formatEndpoint(n.inside_src, n.inside_port)}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{formatEndpoint(n.outside_src, n.outside_port)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
