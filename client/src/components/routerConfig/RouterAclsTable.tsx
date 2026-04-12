import React from 'react';
import type { ParsedRouterAcl } from 'shared/types';

export default function RouterAclsTable({ acls }: { acls: ParsedRouterAcl[] }) {
  if (!acls.length) return null;

  // Group by acl_name preserving first-seen order
  const groups = new Map<string, ParsedRouterAcl[]>();
  for (const a of acls) {
    const list = groups.get(a.acl_name) ?? [];
    list.push(a);
    groups.set(a.acl_name, list);
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Seq</th>
            <th>Action</th>
            <th>Protocol</th>
            <th>Source</th>
            <th>Src Port</th>
            <th>Destination</th>
            <th>Dst Port</th>
          </tr>
        </thead>
        <tbody>
          {Array.from(groups.entries()).map(([name, entries]) => (
            <React.Fragment key={name}>
              <tr>
                <td colSpan={7} style={{ fontWeight: 600, background: 'var(--color-bg)', fontSize: '0.8rem' }}>
                  {name}
                </td>
              </tr>
              {entries.map(a => (
                <tr key={a.id}>
                  <td>{a.sequence ?? '—'}</td>
                  <td>
                    <span className={`badge badge-status-${a.action === 'permit' ? 'up' : 'down'}`}>
                      {a.action}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.protocol || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.src || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.src_port || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.dst || '—'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{a.dst_port || '—'}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
