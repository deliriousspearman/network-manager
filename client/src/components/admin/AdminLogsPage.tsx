import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAllActivityLogs } from '../../api/activityLogs';
import { fetchSettings } from '../../api/settings';
import type { ActivityLog } from '../../api/activityLogs';

const RESOURCE_LABELS: Record<string, string> = {
  device: 'Device',
  subnet: 'Subnet',
  credential: 'Credential',
  connection: 'Connection',
  command_output: 'Command Output',
  project: 'Project',
  backup: 'Backup',
  settings: 'Settings',
};

const ACTION_LABELS: Record<string, string> = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  exported: 'Exported',
  imported: 'Imported',
  captured: 'Captured',
};

const ACTION_COLORS: Record<string, string> = {
  created: 'var(--color-success, #22c55e)',
  updated: 'var(--color-primary)',
  deleted: 'var(--color-danger, #ef4444)',
  exported: '#a855f7',
  imported: '#a855f7',
  captured: '#14b8a6',
};

function formatTimestamp(ts: string, timezone: string): string {
  const date = new Date(ts + 'Z');
  const dateStr = date.toLocaleString(undefined, { timeZone: timezone });
  const tzAbbr = new Intl.DateTimeFormat(undefined, { timeZone: timezone, timeZoneName: 'short' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value ?? timezone;
  return `${dateStr} ${tzAbbr}`;
}

function parseDetails(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function renderDetails(log: ActivityLog): string {
  const d = parseDetails(log.details);
  if (!d) return '';
  if (log.resource_type === 'backup') {
    const parts: string[] = [`scope: ${d.scope}`];
    if (!d.includesCredentials) parts.push('no credentials');
    if (!d.includesCommandOutputs) parts.push('no command outputs');
    return parts.join(', ');
  }
  if (log.resource_type === 'command_output') {
    return d.command_type ? String(d.command_type) : '';
  }
  if (log.resource_type === 'settings') {
    return d.timezone ? `→ ${d.timezone}` : '';
  }
  return '';
}

export default function AdminLogsPage() {
  const [filterResource, setFilterResource] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [pageSize, setPageSize] = useState<number | 'all'>(50);
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [filterResource, filterAction, pageSize]);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['admin-logs'],
    queryFn: fetchAllActivityLogs,
    staleTime: 10_000,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  const timezone = settings?.timezone ?? 'UTC';

  const filtered = useMemo(() => {
    if (!logs) return [];
    return logs.filter(l => {
      if (filterResource && l.resource_type !== filterResource) return false;
      if (filterAction && l.action !== filterAction) return false;
      return true;
    });
  }, [logs, filterResource, filterAction]);

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filtered.length / pageSize);
  const paginated = pageSize === 'all'
    ? filtered
    : filtered.slice((page - 1) * pageSize, page * pageSize);

  if (isLoading) return <div className="loading">Loading...</div>;

  const usedResources = [...new Set(logs?.map(l => l.resource_type) ?? [])].sort();
  const usedActions = [...new Set(logs?.map(l => l.action) ?? [])].sort();

  const selectStyle: React.CSSProperties = {
    padding: '0.35rem 0.5rem',
    border: '1px solid var(--color-border)',
    borderRadius: 6,
    background: 'var(--color-input-bg)',
    color: 'var(--color-text)',
    fontSize: '0.85rem',
    fontFamily: 'inherit',
  };

  return (
    <div>
      <div className="page-header">
        <h2>Admin Logs</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={filterResource} onChange={e => setFilterResource(e.target.value)} style={selectStyle}>
            <option value="">All resources</option>
            {usedResources.map(r => <option key={r} value={r}>{RESOURCE_LABELS[r] ?? r}</option>)}
          </select>
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={selectStyle}>
            <option value="">All actions</option>
            {usedActions.map(a => <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>)}
          </select>
          <select value={pageSize} onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={selectStyle}>
            <option value={50}>50 per page</option>
            <option value={100}>100 per page</option>
            <option value={200}>200 per page</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {!filtered.length ? (
        <div className="empty-state">No activity yet. Events will appear here as you use the app.</div>
      ) : (
        <div className="card table-container">
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Project</th>
                <th>Resource</th>
                <th>Action</th>
                <th>Name</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((log: ActivityLog) => (
                <tr key={log.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {formatTimestamp(log.created_at, timezone)}
                  </td>
                  <td style={{ fontSize: '0.85rem' }}>
                    {log.project_name ?? '—'}
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                      {RESOURCE_LABELS[log.resource_type] ?? log.resource_type}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{ background: ACTION_COLORS[log.action] ?? 'var(--color-border)', color: '#fff' }}>
                      {ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td style={{ fontWeight: log.resource_name ? 500 : 'normal', color: log.resource_name ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                    {log.resource_name ?? '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {renderDetails(log)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pageSize !== 'all' && totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', padding: '0.75rem', fontSize: '0.85rem' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
              <span style={{ color: 'var(--color-text-secondary)' }}>Page {page} of {totalPages}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
