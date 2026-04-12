import type { ParsedRouterStaticRoute } from 'shared/types';

export default function RouterStaticRoutesTable({ routes }: { routes: ParsedRouterStaticRoute[] }) {
  if (!routes.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Destination</th>
            <th>Mask</th>
            <th>Next Hop</th>
            <th>Admin Distance</th>
            <th>Metric</th>
          </tr>
        </thead>
        <tbody>
          {routes.map(r => (
            <tr key={r.id}>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.destination}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.mask || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.next_hop || '—'}</td>
              <td>{r.admin_distance ?? '—'}</td>
              <td>{r.metric ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
