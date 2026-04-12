import type { ParsedRouterVlan } from 'shared/types';

export default function RouterVlansTable({ vlans }: { vlans: ParsedRouterVlan[] }) {
  if (!vlans.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>VLAN ID</th>
            <th>Name</th>
          </tr>
        </thead>
        <tbody>
          {vlans.map(v => (
            <tr key={v.id}>
              <td style={{ fontWeight: 500 }}>{v.vlan_id}</td>
              <td>{v.name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
