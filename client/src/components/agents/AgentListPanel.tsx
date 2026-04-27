import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Bot, CheckSquare } from 'lucide-react';
import { fetchAgentsPaged, bulkDeleteAgents } from '../../api/agents';
import { fetchAgentTypes } from '../../api/agentTypes';
import { undoMany } from '../../api/undo';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { rowNavHandlers } from '../../utils/navigation';
import { SkeletonTable } from '../ui/Skeleton';
import Pagination from '../ui/Pagination';
import EmptyState from '../ui/EmptyState';
import ColumnMenu from '../ui/ColumnMenu';
import type { AgentWithDevice } from 'shared/types';
import { AGENT_STATUS_LABELS } from 'shared/types';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import SimpleBulkDeleteBar from '../ui/SimpleBulkDeleteBar';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { PAGE_LIMIT } from '../../utils/constants';

type SortCol = 'name' | 'agent_type' | 'device_name' | 'status' | 'checkin_schedule' | 'version';

interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
  sortKey?: SortCol;
  thStyle?: React.CSSProperties;
  render: (a: AgentWithDevice) => React.ReactNode;
  csvValue?: (a: AgentWithDevice) => string;
}

function buildColumns(typeLabels: Map<string, string>): ColumnDef[] {
  return [
  {
    key: 'status', label: 'Status', defaultVisible: true, alwaysVisible: true,
    sortKey: 'status',
    thStyle: { width: '28px', padding: '0.6rem 0.25rem' },
    render: (a) => {
      const status = a.status || 'unknown';
      const label = status.charAt(0).toUpperCase() + status.slice(1);
      return (
        <span title={label}>
          <span className={`status-dot status-dot-agent-${status}`} aria-hidden="true" />
          <span className="sr-only">Status: {label}</span>
        </span>
      );
    },
    csvValue: (a) => a.status ?? '',
  },
  {
    key: 'name', label: 'Name', defaultVisible: true, alwaysVisible: true,
    sortKey: 'name',
    render: (a) => a.name,
    csvValue: (a) => a.name,
  },
  {
    key: 'agent_type', label: 'Type', defaultVisible: true,
    sortKey: 'agent_type',
    render: (a) => <span className={`badge badge-agent-${a.agent_type}`}>{typeLabels.get(a.agent_type) || a.agent_type}</span>,
    csvValue: (a) => typeLabels.get(a.agent_type) || a.agent_type,
  },
  {
    key: 'device', label: 'Device', defaultVisible: true,
    sortKey: 'device_name',
    render: (a) => a.device_name || '—',
    csvValue: (a) => a.device_name ?? '',
  },
  {
    key: 'device_os', label: 'OS', defaultVisible: true,
    render: (a) => a.device_os || '—',
    csvValue: (a) => a.device_os ?? '',
  },
  {
    key: 'checkin_schedule', label: 'Check-in', defaultVisible: true,
    sortKey: 'checkin_schedule',
    render: (a) => {
      if (!a.checkin_schedule) return '—';
      const lines = a.checkin_schedule.split('\n');
      return lines.length > 1 ? `${lines[0]} …` : lines[0];
    },
    csvValue: (a) => a.checkin_schedule ?? '',
  },
  {
    key: 'version', label: 'Version', defaultVisible: true,
    sortKey: 'version',
    render: (a) => a.version || '—',
    csvValue: (a) => a.version ?? '',
  },
  {
    key: 'disk_path', label: 'Disk Path', defaultVisible: false,
    render: (a) => a.disk_path ? <code className="agent-disk-path">{a.disk_path}</code> : '—',
    csvValue: (a) => a.disk_path ?? '',
  },
  {
    key: 'notes', label: 'Notes', defaultVisible: false,
    render: (a) => a.notes ? (a.notes.length > 60 ? a.notes.slice(0, 60) + '…' : a.notes) : '—',
    csvValue: (a) => a.notes ?? '',
  },
  ];
}

const thSortStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

interface AgentListPanelProps {
  onTotalChange?: (total: number | undefined) => void;
}

export default function AgentListPanel({ onTotalChange }: AgentListPanelProps) {
  const { projectId, project } = useProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`agentList.search.${projectId}`, '');
  const debouncedSearch = useDebouncedValue(search);
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`agentList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`agentList.sortDir.${projectId}`, 'asc');
  const [filterStatus, setFilterStatus] = usePersistedState<string>(`agentList.filterStatus.${projectId}`, '');
  const [filterType, setFilterType] = usePersistedState<string>(`agentList.filterType.${projectId}`, '');

  const { data: agentTypes = [] } = useQuery({
    queryKey: ['agent-types', projectId],
    queryFn: () => fetchAgentTypes(projectId),
  });

  const COLUMNS = useMemo(() => {
    const labels = new Map(agentTypes.map(t => [t.key, t.label] as const));
    return buildColumns(labels);
  }, [agentTypes]);

  const cols = useColumnPrefs(COLUMNS, `agentList.columns.${projectId}`);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.agents.paged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, dir: sortDir,
      status: filterStatus, type: filterType,
    }),
    queryFn: () => fetchAgentsPaged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, order: sortDir,
      status: filterStatus || undefined,
      agent_type: filterType || undefined,
    }),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    onTotalChange?.(data?.total);
  }, [data?.total, onTotalChange]);

  const handleSort = useCallback((col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  }, [sortCol]);

  const handleSearch = useCallback((value: string) => { setSearch(value); setPage(1); }, []);

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  async function exportCsv() {
    const [{ fetchAgentsPaged: fp }, { drainPaged, rowsToCsv, downloadCsv, CSV_EXPORT_MAX_ROWS }] = await Promise.all([
      import('../../api/agents'),
      import('../../utils/csvExport'),
    ]);
    const { items: all, truncated } = await drainPaged(
      (p) => fp(projectId, {
        ...p,
        status: filterStatus || undefined,
        agent_type: filterType || undefined,
      }),
      { search, sort: sortCol, order: sortDir },
    );
    const exportCols = cols.active.filter(c => c.csvValue);
    const rows: (string | number | null | undefined)[][] = [exportCols.map(c => c.label)];
    for (const a of all) rows.push(exportCols.map(c => c.csvValue!(a)));
    downloadCsv(rowsToCsv(rows), 'agents.csv');
    if (truncated) toast(`Export truncated at ${CSV_EXPORT_MAX_ROWS.toLocaleString()} rows`, 'info');
  }

  const base = `/p/${project.slug}`;
  const items = data?.items ?? [];
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const bulk = useBulkSelection<AgentWithDevice>(items);
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
      `Delete ${ids.length} ${ids.length === 1 ? 'agent' : 'agents'}? They can be restored from Trash or with Ctrl+Z.`,
      'Delete Selected Agents',
    );
    if (!ok) return;
    setBulkPending(true);
    try {
      const { deleted, failed } = await bulkDeleteAgents(projectId, ids);
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      if (deleted.length > 0) {
        toast(
          `Deleted ${deleted.length} ${deleted.length === 1 ? 'agent' : 'agents'}`,
          'success',
          {
            label: 'Undo all',
            onClick: async () => {
              const { restored } = await undoMany(projectId, deleted.length);
              queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) });
              queryClient.invalidateQueries({ queryKey: ['agent-diagram', projectId] });
              queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
              toast(`Restored ${restored} ${restored === 1 ? 'agent' : 'agents'}`, 'success');
            },
          }
        );
      }
      if (failed.length > 0) {
        toast(`Failed to delete ${failed.length} ${failed.length === 1 ? 'agent' : 'agents'}`, 'error');
      }
      exitSelectMode();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete agents', 'error');
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <>
      <div className="list-toolbar">
        <div className="list-search">
          <Search size={14} className="list-search-icon" />
          <input className="list-search-input" value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search name, type, version, device" />
        </div>
        <select
          className="list-filter-select"
          value={filterStatus}
          onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {Object.entries(AGENT_STATUS_LABELS).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
          <option value="none">No status</option>
        </select>
        <select
          className="list-filter-select"
          value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(1); }}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          {agentTypes.map(t => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>
        {data && data.total > 0 && (
          <button
            className={`btn btn-secondary btn-icon${selectMode ? ' active' : ''}`}
            onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
            title={selectMode ? 'Exit select mode' : 'Select agents for bulk actions'}
            aria-label={selectMode ? 'Exit select mode' : 'Enter select mode'}
            aria-pressed={selectMode}
          >
            <CheckSquare size={14} />
          </button>
        )}
        {data && data.total > 0 && (
          <button className="btn btn-secondary btn-icon" onClick={exportCsv} title="Export CSV" aria-label="Export CSV"><Download size={14} /></button>
        )}
        <Link to={`${base}/agents/new`} className="btn btn-primary list-toolbar-action">+ Add Agent</Link>
      </div>

      {isLoading && !data ? (
        <SkeletonTable rows={8} columns={cols.active.length || 7} />
      ) : data?.total === 0 && !search && !filterStatus && !filterType ? (
        <EmptyState
          icon={<Bot size={22} />}
          title="No agents yet"
          description="Register an agent to start collecting data from your network."
          action={<Link to={`${base}/agents/new`} className="btn btn-primary">+ Add Your First Agent</Link>}
        />
      ) : items.length === 0 ? (
        <EmptyState title="No matches" description="No agents match your filters." />
      ) : (
        <>
          {selectMode && (
            <SimpleBulkDeleteBar
              count={bulk.count}
              noun="agent"
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
                    <th key={col.key} style={{ ...(col.thStyle || {}), ...(col.sortKey ? thSortStyle : {}) }} onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}>
                      {col.key === 'status' ? null : col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a: AgentWithDevice) => {
                  const isSelected = bulk.selectedIds.has(a.id);
                  const rowProps = selectMode
                    ? { onClick: () => bulk.toggle(a.id), style: { cursor: 'pointer' } as React.CSSProperties }
                    : { style: { cursor: 'pointer' } as React.CSSProperties, ...rowNavHandlers(`${base}/agents/${a.id}`, navigate) };
                  return (
                    <tr key={a.id} className={isSelected ? 'row-selected' : undefined} {...rowProps}>
                      {selectMode && (
                        <td style={{ padding: '0.6rem 0.25rem' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${a.name}`}
                            checked={isSelected}
                            onChange={() => bulk.toggle(a.id)}
                          />
                        </td>
                      )}
                      {cols.active.map(col => (
                        <td key={col.key} style={col.thStyle?.textAlign ? { textAlign: col.thStyle.textAlign as React.CSSProperties['textAlign'] } : undefined}>
                          {col.render(a)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />}
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
    </>
  );
}
