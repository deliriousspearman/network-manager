import { useState, useCallback } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Network as NetworkIcon } from 'lucide-react';
import { fetchSubnetsPaged } from '../../api/subnets';
import { useProject } from '../../contexts/ProjectContext';
import { rowNavHandlers } from '../../utils/navigation';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import type { Subnet } from 'shared/types';
import { usePersistedState } from '../../hooks/usePersistedState';

type SortCol = 'name' | 'cidr' | 'vlan_id' | 'description';

const PAGE_LIMIT = 50;

export default function SubnetList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`subnetList.search.${projectId}`, '');
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`subnetList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`subnetList.sortDir.${projectId}`, 'asc');

  const { data, isLoading } = useQuery({
    queryKey: ['subnets', projectId, 'paged', page, PAGE_LIMIT, search, sortCol, sortDir],
    queryFn: () => fetchSubnetsPaged(projectId, { page, limit: PAGE_LIMIT, search, sort: sortCol, order: sortDir }),
    placeholderData: keepPreviousData,
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
    const { fetchSubnetsPaged: fp } = await import('../../api/subnets');
    const all = await fp(projectId, { page: 1, limit: 9999, search, sort: sortCol, order: sortDir });
    const rows = [['Name', 'CIDR', 'VLAN ID', 'Description']];
    for (const s of all.items) {
      rows.push([s.name, s.cidr, s.vlan_id != null ? String(s.vlan_id) : '', s.description ?? '']);
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'subnets.csv';
    a.click();
  }

  if (isLoading && !data) return <LoadingSpinner />;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Subnets"
        subtitle={typeof data?.total === 'number' ? `${data.total} total` : undefined}
        actions={
          <>
            <div className="list-search">
              <Search size={14} className="list-search-icon" />
              <input
                className="list-search-input"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search"
              />
            </div>
            {data && data.total > 0 && (
              <button className="btn btn-secondary btn-icon" onClick={exportCsv} title="Export CSV">
                <Download size={14} />
              </button>
            )}
            <Link to={`${base}/subnets/new`} className="btn btn-primary">+ Add Subnet</Link>
          </>
        }
      />

      {!isLoading && data?.total === 0 && !search ? (
        <EmptyState
          icon={<NetworkIcon size={22} />}
          title="No subnets yet"
          description="Add a subnet to start organising your network."
          action={<Link to={`${base}/subnets/new`} className="btn btn-primary">+ Add Your First Subnet</Link>}
        />
      ) : !isLoading && items.length === 0 ? (
        <EmptyState title="No matches" description="No subnets match your search." />
      ) : (
        <>
          <div className="card table-container">
            <table>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('name')}>Name <SortIcon col="name" /></th>
                  <th style={thStyle} onClick={() => handleSort('cidr')}>CIDR <SortIcon col="cidr" /></th>
                  <th style={thStyle} onClick={() => handleSort('vlan_id')}>VLAN ID <SortIcon col="vlan_id" /></th>
                  <th style={thStyle} onClick={() => handleSort('description')}>Description <SortIcon col="description" /></th>
                </tr>
              </thead>
              <tbody>
                {items.map((s: Subnet) => (
                  <tr key={s.id} style={{ cursor: 'pointer' }} {...rowNavHandlers(`${base}/subnets/${s.id}`, navigate)}>
                    <td>{s.name}</td>
                    <td>{s.cidr}</td>
                    <td>{s.vlan_id || '—'}</td>
                    <td>{s.description || '—'}</td>
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
