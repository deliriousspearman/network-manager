import type { ParsedRouterInterface } from 'shared/types';

export default function RouterInterfacesTable({ interfaces }: { interfaces: ParsedRouterInterface[] }) {
  if (!interfaces.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Interface</th>
            <th>Description</th>
            <th>IP Address</th>
            <th>Mask</th>
            <th>VLAN</th>
            <th>Admin</th>
            <th>MAC</th>
          </tr>
        </thead>
        <tbody>
          {interfaces.map(i => (
            <tr key={i.id}>
              <td style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{i.interface_name}</td>
              <td>{i.description || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{i.ip_address || '—'}</td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{i.subnet_mask || '—'}</td>
              <td>{i.vlan ?? '—'}</td>
              <td>
                {i.admin_status ? (
                  <span className={`badge badge-status-${i.admin_status === 'up' ? 'up' : 'down'}`}>
                    {i.admin_status}
                  </span>
                ) : '—'}
              </td>
              <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{i.mac_address || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
