import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download } from 'lucide-react';
import { fetchDevicesPaged } from '../../api/devices';
import { useProject } from '../../contexts/ProjectContext';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import type { DeviceWithIps } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';

type SortCol = 'name' | 'type' | 'hosting_type' | 'primary_ip' | 'os' | 'subnet_name' | 'status';

const PAGE_LIMIT = 50;

export default function DeviceList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading } = useQuery({
    queryKey: ['devices', projectId, 'paged', page, PAGE_LIMIT, search, sortCol, sortDir],
    queryFn: () => fetchDevicesPaged(projectId, { page, limit: PAGE_LIMIT, search, sort: sortCol, order: sortDir }),
  });

  const handleSort = useCallback((col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortCol]);

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  async function exportCsv() {
    // Fetch all matching rows for export (no pagination, same search/sort)
    const { fetchDevicesPaged: fp } = await import('../../api/devices');
    const all = await fp(projectId, { page: 1, limit: 9999, search, sort: sortCol, order: sortDir });
    const rows = [['Name', 'Type', 'Hosting', 'IP Address', 'OS', 'Subnet', 'Tags', 'Status']];
    for (const d of all.items) {
      rows.push([d.name, DEVICE_TYPE_LABELS[d.type] || d.type, d.hosting_type ?? '', d.primary_ip ?? '', d.os ?? '', d.subnet_name ?? '', (d.tags ?? []).join('; '), d.status ?? '']);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'devices.csv';
    a.click();
  }

  if (isLoading && !data) return <LoadingSpinner />;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const items = data?.items ?? [];

  return (
    <div>
      <div className="page-header">
        <h2>Devices</h2>
        <div className="flex items-center gap-2">
          <div className="diagram-search-wrap">
            <Search size={14} className="diagram-search-icon" />
            <input
              className="diagram-search"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search"
            />
          </div>
          {data && data.total > 0 && (
            <button className="btn btn-secondary" onClick={exportCsv} title="Export CSV">
              <Download size={14} />
            </button>
          )}
          <Link to={`${base}/devices/new`} className="btn btn-primary">+ Add Device</Link>
        </div>
      </div>

      {!isLoading && data?.total === 0 && !search ? (
        <div className="empty-state">No devices yet. Add your first device to get started.</div>
      ) : !isLoading && items.length === 0 ? (
        <div className="empty-state">No devices match your search.</div>
      ) : (
        <>
          <div className="card table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28px', padding: '0.6rem 0.25rem' }} />
                  <th style={thStyle} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                  <th style={thStyle} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></th>
                  <th style={thStyle} onClick={() => handleSort('hosting_type')}>Hosting <SortIcon col="hosting_type" /></th>
                  <th style={thStyle} onClick={() => handleSort('primary_ip')}>IP Address <SortIcon col="primary_ip" /></th>
                  <th style={thStyle} onClick={() => handleSort('os')}>OS <SortIcon col="os" /></th>
                  <th style={thStyle} onClick={() => handleSort('subnet_name')}>Subnet <SortIcon col="subnet_name" /></th>
                  <th>Tags</th>
                  <th style={{ textAlign: 'center' }}>AV</th>
                  <th style={{ textAlign: 'center' }}>Creds</th>
                </tr>
              </thead>
              <tbody>
                {items.map((d: DeviceWithIps) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`${base}/devices/${d.id}`)}>
                    <td style={{ padding: '0.6rem 0.25rem', textAlign: 'center' }}>
                      <span className={`status-dot status-dot-${d.status || 'none'}`} />
                    </td>
                    <td>{d.name}</td>
                    <td><span className={`badge badge-${d.type}`}>{DEVICE_TYPE_LABELS[d.type] || d.type}</span></td>
                    <td>{d.hosting_type ? <span className={`badge badge-hosting-${d.hosting_type}`}>{d.hosting_type}</span> : '—'}</td>
                    <td>{d.primary_ip || '—'}</td>
                    <td>{d.os || '—'}</td>
                    <td>{d.subnet_name || '—'}</td>
                    <td>
                      {d.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.tags.map(tag => <span key={tag} className="tag-pill">{tag}</span>)}
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>{d.av ? '🛡️' : ''}</td>
                    <td style={{ textAlign: 'center' }}>{d.credential_count ? '🔑' : ''}</td>
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
