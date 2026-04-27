import { useState, useCallback, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { fetchAllActivityLogsPaged } from '../../api/activityLogs';
import { fetchSettings } from '../../api/settings';
import type { ActivityLog } from '../../api/activityLogs';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import { PAGE_LIMIT } from '../../utils/constants';

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
  useEffect(() => { document.title = 'Network Manager - Admin Logs'; return () => { document.title = 'Network Manager'; }; }, []);
  const [filterResource, setFilterResource] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const handleFilterResource = useCallback((value: string) => {
    setFilterResource(value);
    setPage(1);
  }, []);

  const handleFilterAction = useCallback((value: string) => {
    setFilterAction(value);
    setPage(1);
  }, []);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', 'paged', page, PAGE_LIMIT, search, filterResource, filterAction],
    queryFn: () => fetchAllActivityLogsPaged({ page, limit: PAGE_LIMIT, search, resource_type: filterResource, action: filterAction }),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  const timezone = settings?.timezone ?? 'UTC';

  if (isLoading && !data) return <LoadingSpinner />;

  const items = data?.items ?? [];

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
          <div className="diagram-search-wrap">
            <Search size={14} className="diagram-search-icon" />
            <input
              className="diagram-search"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search action, resource, details"
            />
          </div>
          <select value={filterResource} onChange={e => handleFilterResource(e.target.value)} style={selectStyle}>
            <option value="">All resources</option>
            {Object.entries(RESOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select value={filterAction} onChange={e => handleFilterAction(e.target.value)} style={selectStyle}>
            <option value="">All actions</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {!isLoading && items.length === 0 ? (
        <div className="empty-state">No activity yet. Events will appear here as you use the app.</div>
      ) : (
        <>
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
                {items.map((log: ActivityLog) => (
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
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}
