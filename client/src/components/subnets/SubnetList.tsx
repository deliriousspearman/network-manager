import { useState, useCallback } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Network as NetworkIcon, CheckSquare } from 'lucide-react';
import { fetchSubnetsPaged, bulkDeleteSubnets } from '../../api/subnets';
import { undoMany } from '../../api/undo';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { rowNavHandlers } from '../../utils/navigation';
import { SkeletonTable } from '../ui/Skeleton';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import ColumnMenu from '../ui/ColumnMenu';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import SimpleBulkDeleteBar from '../ui/SimpleBulkDeleteBar';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import type { Subnet } from 'shared/types';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useToast } from '../ui/Toast';
import { PAGE_LIMIT } from '../../utils/constants';

type SortCol = 'name' | 'cidr' | 'vlan_id' | 'description';

interface SubnetColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
  sortKey?: SortCol;
  render: (s: Subnet) => React.ReactNode;
  csvValue?: (s: Subnet) => string;
}

const COLUMNS: SubnetColumnDef[] = [
  { key: 'name', label: 'Name', defaultVisible: true, alwaysVisible: true, sortKey: 'name', render: s => s.name, csvValue: s => s.name },
  { key: 'cidr', label: 'CIDR', defaultVisible: true, alwaysVisible: true, sortKey: 'cidr', render: s => s.cidr, csvValue: s => s.cidr },
  { key: 'vlan_id', label: 'VLAN ID', defaultVisible: true, sortKey: 'vlan_id', render: s => s.vlan_id ?? '—', csvValue: s => s.vlan_id != null ? String(s.vlan_id) : '' },
  { key: 'description', label: 'Description', defaultVisible: true, sortKey: 'description', render: s => s.description || '—', csvValue: s => s.description ?? '' },
];

const thSortStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

export default function SubnetList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`subnetList.search.${projectId}`, '');
  const debouncedSearch = useDebouncedValue(search);
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`subnetList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`subnetList.sortDir.${projectId}`, 'asc');
  const [filterVlan, setFilterVlan] = usePersistedState<string>(`subnetList.filterVlan.${projectId}`, '');
  const toast = useToast();

  const cols = useColumnPrefs(COLUMNS, `subnetList.columns.${projectId}`);

  const vlanParam = (filterVlan === 'has' || filterVlan === 'none') ? filterVlan : undefined;
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.subnets.paged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, dir: sortDir, vlan: filterVlan,
    }),
    queryFn: () => fetchSubnetsPaged(projectId, { page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, order: sortDir, vlan: vlanParam }),
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
    const [{ fetchSubnetsPaged: fp }, { drainPaged, rowsToCsv, downloadCsv, CSV_EXPORT_MAX_ROWS }] = await Promise.all([
      import('../../api/subnets'),
      import('../../utils/csvExport'),
    ]);
    const { items: all, truncated } = await drainPaged(
      (p) => fp(projectId, { ...p, vlan: vlanParam }),
      { search, sort: sortCol, order: sortDir },
    );
    const exportCols = cols.active.filter(c => c.csvValue);
    const rows: (string | number | null | undefined)[][] = [exportCols.map(c => c.label)];
    for (const s of all) {
      rows.push(exportCols.map(c => c.csvValue!(s)));
    }
    downloadCsv(rowsToCsv(rows), 'subnets.csv');
    if (truncated) toast(`Export truncated at ${CSV_EXPORT_MAX_ROWS.toLocaleString()} rows`, 'info');
  }

  const base = `/p/${project.slug}`;
  const items = data?.items ?? [];
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const bulk = useBulkSelection<Subnet>(items);
  const [selectMode, setSelectMode] = useState(false);
  const [bulkPending, setBulkPending] = useState(false);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    bulk.clear();
  }, [bulk]);

  async function handleBulkDelete() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const ok = await confirm(
      `Delete ${ids.length} ${ids.length === 1 ? 'subnet' : 'subnets'}? They can be restored from Trash or with Ctrl+Z.`,
      'Delete Selected Subnets',
    );
    if (!ok) return;
    setBulkPending(true);
    try {
      const { deleted, failed } = await bulkDeleteSubnets(projectId, ids);
      queryClient.invalidateQueries({ queryKey: queryKeys.subnets.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      if (deleted.length > 0) {
        toast(
          `Deleted ${deleted.length} ${deleted.length === 1 ? 'subnet' : 'subnets'}`,
          'success',
          {
            label: 'Undo all',
            onClick: async () => {
              const { restored } = await undoMany(projectId, deleted.length);
              queryClient.invalidateQueries({ queryKey: queryKeys.subnets.all(projectId) });
              queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
              queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
              toast(`Restored ${restored} ${restored === 1 ? 'subnet' : 'subnets'}`, 'success');
            },
          }
        );
      }
      if (failed.length > 0) {
        toast(`Failed to delete ${failed.length} ${failed.length === 1 ? 'subnet' : 'subnets'}`, 'error');
      }
      exitSelectMode();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete subnets', 'error');
    } finally {
      setBulkPending(false);
    }
  }

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
                placeholder="Search name, CIDR, VLAN, description"
              />
            </div>
            <select
              className="list-filter-select"
              value={filterVlan}
              onChange={e => { setFilterVlan(e.target.value); setPage(1); }}
              aria-label="Filter by VLAN"
            >
              <option value="">All subnets</option>
              <option value="has">Has VLAN</option>
              <option value="none">No VLAN</option>
            </select>
            {data && data.total > 0 && (
              <button
                className={`btn btn-secondary btn-icon${selectMode ? ' active' : ''}`}
                onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
                title={selectMode ? 'Exit select mode' : 'Select subnets for bulk actions'}
                aria-label={selectMode ? 'Exit select mode' : 'Enter select mode'}
                aria-pressed={selectMode}
              >
                <CheckSquare size={14} />
              </button>
            )}
            {data && data.total > 0 && (
              <button className="btn btn-secondary btn-icon" onClick={exportCsv} title="Export CSV" aria-label="Export CSV">
                <Download size={14} />
              </button>
            )}
            <Link to={`${base}/subnets/new`} className="btn btn-primary">+ Add Subnet</Link>
          </>
        }
      />

      {isLoading && !data ? (
        <SkeletonTable rows={8} columns={cols.active.length || 4} />
      ) : data?.total === 0 && !search && !filterVlan ? (
        <EmptyState
          icon={<NetworkIcon size={22} />}
          title="No subnets yet"
          description="Add a subnet to start organising your network."
          action={<Link to={`${base}/subnets/new`} className="btn btn-primary">+ Add Your First Subnet</Link>}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No matches" description="No subnets match your search." />
      ) : (
        <>
          {selectMode && (
            <SimpleBulkDeleteBar
              count={bulk.count}
              noun="subnet"
              onDelete={handleBulkDelete}
              onClose={exitSelectMode}
              pending={bulkPending}
            />
          )}
          <div className="card table-container">
            <table>
              <thead>
                <tr onContextMenu={cols.openMenuAt}>
                  {selectMode && (
                    <th style={{ width: '32px', padding: '0.6rem 0.25rem' }}>
                      <input
                        type="checkbox"
                        aria-label="Select all visible"
                        checked={bulk.allVisibleSelected}
                        ref={el => { if (el) el.indeterminate = bulk.someVisibleSelected && !bulk.allVisibleSelected; }}
                        onChange={bulk.toggleAll}
                      />
                    </th>
                  )}
                  {cols.active.map(col => (
                    <th
                      key={col.key}
                      style={col.sortKey ? thSortStyle : undefined}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                    >
                      {col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((s: Subnet) => {
                  const isSelected = bulk.selectedIds.has(s.id);
                  const rowProps = selectMode
                    ? { onClick: () => bulk.toggle(s.id), style: { cursor: 'pointer' } as React.CSSProperties }
                    : { style: { cursor: 'pointer' } as React.CSSProperties, ...rowNavHandlers(`${base}/subnets/${s.id}`, navigate) };
                  return (
                    <tr key={s.id} className={isSelected ? 'row-selected' : undefined} {...rowProps}>
                      {selectMode && (
                        <td style={{ padding: '0.6rem 0.25rem' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${s.name}`}
                            checked={isSelected}
                            onChange={() => bulk.toggle(s.id)}
                          />
                        </td>
                      )}
                      {cols.active.map(col => (
                        <td key={col.key}>{col.render(s)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />
          )}
        </>
      )}

      {cols.menu && (
        <ColumnMenu
          columns={COLUMNS}
          order={cols.order}
          visible={cols.visible}
          position={cols.menu}
          dragOver={cols.dragOver}
          menuRef={cols.menuRef}
          onToggle={cols.toggle}
          onReset={cols.reset}
          onDragStart={cols.handleDragStart}
          onDragOver={cols.handleDragOver}
          onDrop={cols.handleDrop}
          onDragEnd={cols.handleDragEnd}
        />
      )}
    </div>
  );
}
