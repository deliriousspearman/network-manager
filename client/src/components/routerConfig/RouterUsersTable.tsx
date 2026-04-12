import type { ParsedRouterUser } from 'shared/types';

export default function RouterUsersTable({ users }: { users: ParsedRouterUser[] }) {
  if (!users.length) return null;
  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Privilege</th>
            <th>Auth Method</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td style={{ fontWeight: 500, fontFamily: 'monospace', fontSize: '0.8rem' }}>{u.username}</td>
              <td>{u.privilege ?? '—'}</td>
              <td>{u.auth_method || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
