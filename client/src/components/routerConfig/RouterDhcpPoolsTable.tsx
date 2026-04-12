import type { ParsedRouterDhcpPool } from 'shared/types';

export default function RouterDhcpPoolsTable({ pools }: { pools: ParsedRouterDhcpPool[] }) {
  if (!pools.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Pool</th>
            <th>Network</th>
            <th>Netmask</th>
            <th>Gateway</th>
            <th>DNS</th>
            <th>Lease</th>
            <th>Domain</th>
          </tr>
        </thead>
        <tbody>
          {pools.map(p => {
            let dns: string[] = [];
            if (p.dns_servers) {
              try { dns = JSON.parse(p.dns_servers); } catch { /* ignore */ }
            }
            return (
              <tr key={p.id}>
                <td style={{ fontWeight: 500 }}>{p.pool_name}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.network || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.netmask || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.default_router || '—'}</td>
                <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{dns.length > 0 ? dns.join(', ') : '—'}</td>
                <td>{p.lease_time || '—'}</td>
                <td>{p.domain_name || '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
