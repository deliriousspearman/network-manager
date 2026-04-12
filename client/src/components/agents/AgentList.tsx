import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Bot } from 'lucide-react';
import { fetchAgentsPaged } from '../../api/agents';
import { useProject } from '../../contexts/ProjectContext';
import { getStorage, setStorage } from '../../utils/storage';
import { rowNavHandlers } from '../../utils/navigation';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import type { AgentWithDevice } from 'shared/types';
import { AGENT_TYPE_LABELS, AGENT_STATUS_LABELS } from 'shared/types';
import { usePersistedState } from '../../hooks/usePersistedState';

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

const COLUMNS: ColumnDef[] = [
  {
    key: 'status', label: 'Status', defaultVisible: true, alwaysVisible: true,
    sortKey: 'status',
    thStyle: { width: '28px', padding: '0.6rem 0.25rem' },
    render: (a) => <span className={`status-dot status-dot-agent-${a.status || 'unknown'}`} />,
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
    render: (a) => <span className={`badge badge-agent-${a.agent_type}`}>{AGENT_TYPE_LABELS[a.agent_type] || a.agent_type}</span>,
    csvValue: (a) => AGENT_TYPE_LABELS[a.agent_type] || a.agent_type,
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

const DEFAULT_VISIBLE = new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
const DEFAULT_ORDER = COLUMNS.map(c => c.key);

interface ColConfig { visible: Set<string>; order: string[] }

function loadColConfig(projectId: number): ColConfig {
  const stored = getStorage(`agentList.columns.${projectId}`);
  if (!stored) return { visible: new Set(DEFAULT_VISIBLE), order: DEFAULT_ORDER };
  try {
    const cfg = JSON.parse(stored);
    const validKeys = new Set(COLUMNS.map(c => c.key));
    const vis = new Set<string>(
      Array.isArray(cfg.visible) ? cfg.visible.filter((k: string) => validKeys.has(k)) : [...DEFAULT_VISIBLE],
    );
    for (const col of COLUMNS) { if (col.alwaysVisible) vis.add(col.key); }
    if (vis.size === 0) for (const k of DEFAULT_VISIBLE) vis.add(k);
    let order: string[] = Array.isArray(cfg.order) ? cfg.order.filter((k: string) => validKeys.has(k)) : [];
    const inOrder = new Set(order);
    for (const k of DEFAULT_ORDER) { if (!inOrder.has(k)) order.push(k); }
    return { visible: vis, order };
  } catch {
    return { visible: new Set(DEFAULT_VISIBLE), order: DEFAULT_ORDER };
  }
}

function saveColConfig(projectId: number, visible: Set<string>, order: string[]) {
  setStorage(`agentList.columns.${projectId}`, JSON.stringify({ visible: [...visible], order }));
}

const PAGE_LIMIT = 50;

export default function AgentList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`agentList.search.${projectId}`, '');
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`agentList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`agentList.sortDir.${projectId}`, 'asc');

  // Column visibility & order
  const [visibleCols, setVisibleCols] = useState<Set<string>>(() => loadColConfig(projectId).visible);
  const [colOrder, setColOrder] = useState<string[]>(() => loadColConfig(projectId).order);
  const [colMenu, setColMenu] = useState<{ x: number; y: number } | null>(null);
  const colMenuRef = useRef<HTMLDivElement>(null);
  const dragItem = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  const toggleColumn = useCallback((key: string) => {
    setVisibleCols(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      saveColConfig(projectId, next, colOrder);
      return next;
    });
  }, [projectId, colOrder]);

  const handleDragStart = useCallback((key: string) => { dragItem.current = key; }, []);
  const handleDragOver = useCallback((e: React.DragEvent, key: string) => { e.preventDefault(); setDragOver(key); }, []);
  const handleDrop = useCallback((targetKey: string) => {
    const srcKey = dragItem.current;
    dragItem.current = null;
    setDragOver(null);
    if (!srcKey || srcKey === targetKey) return;
    setColOrder(prev => {
      const next = [...prev];
      const srcIdx = next.indexOf(srcKey);
      const tgtIdx = next.indexOf(targetKey);
      if (srcIdx === -1 || tgtIdx === -1) return prev;
      next.splice(srcIdx, 1);
      next.splice(tgtIdx, 0, srcKey);
      saveColConfig(projectId, visibleCols, next);
      return next;
    });
  }, [projectId, visibleCols]);
  const handleDragEnd = useCallback(() => { dragItem.current = null; setDragOver(null); }, []);

  const resetColumns = useCallback(() => {
    setVisibleCols(new Set(DEFAULT_VISIBLE));
    setColOrder(DEFAULT_ORDER);
    saveColConfig(projectId, new Set(DEFAULT_VISIBLE), DEFAULT_ORDER);
  }, [projectId]);

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => { e.preventDefault(); setColMenu({ x: e.clientX, y: e.clientY }); }, []);

  useEffect(() => {
    if (!colMenu) return;
    const handleClick = (e: MouseEvent) => { if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenu(null); };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColMenu(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [colMenu]);

  const { data, isLoading } = useQuery({
    queryKey: ['agents', projectId, 'paged', page, PAGE_LIMIT, search, sortCol, sortDir],
    queryFn: () => fetchAgentsPaged(projectId, { page, limit: PAGE_LIMIT, search, sort: sortCol, order: sortDir }),
    placeholderData: keepPreviousData,
  });

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

  const colMap = new Map(COLUMNS.map(c => [c.key, c]));
  const activeCols = colOrder.filter(k => visibleCols.has(k)).map(k => colMap.get(k)!).filter(Boolean);

  async function exportCsv() {
    const { fetchAgentsPaged: fp } = await import('../../api/agents');
    const all = await fp(projectId, { page: 1, limit: 9999, search, sort: sortCol, order: sortDir });
    const exportCols = activeCols.filter(c => c.csvValue);
    const rows = [exportCols.map(c => c.label)];
    for (const a of all.items) rows.push(exportCols.map(c => c.csvValue!(a)));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    el.download = 'agents.csv';
    el.click();
  }

  if (isLoading && !data) return <LoadingSpinner />;

  const base = `/p/${project.slug}`;
  const thSortStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={typeof data?.total === 'number' ? `${data.total} total` : undefined}
        actions={
          <>
            <div className="list-search">
              <Search size={14} className="list-search-icon" />
              <input className="list-search-input" value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search" />
            </div>
            {data && data.total > 0 && (
              <button className="btn btn-secondary btn-icon" onClick={exportCsv} title="Export CSV"><Download size={14} /></button>
            )}
            <Link to={`${base}/agents/new`} className="btn btn-primary">+ Add Agent</Link>
          </>
        }
      />

      {!isLoading && data?.total === 0 && !search ? (
        <EmptyState
          icon={<Bot size={22} />}
          title="No agents yet"
          description="Register an agent to start collecting data from your network."
          action={<Link to={`${base}/agents/new`} className="btn btn-primary">+ Add Your First Agent</Link>}
        />
      ) : !isLoading && items.length === 0 ? (
        <EmptyState title="No matches" description="No agents match your search." />
      ) : (
        <>
          <div className="card table-container">
            <table>
              <thead>
                <tr onContextMenu={handleHeaderContextMenu}>
                  {activeCols.map(col => (
                    <th key={col.key} style={{ ...(col.thStyle || {}), ...(col.sortKey ? thSortStyle : {}) }} onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}>
                      {col.key === 'status' ? null : col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((a: AgentWithDevice) => (
                  <tr key={a.id} style={{ cursor: 'pointer' }} {...rowNavHandlers(`${base}/agents/${a.id}`, navigate)}>
                    {activeCols.map(col => (
                      <td key={col.key} style={col.thStyle?.textAlign ? { textAlign: col.thStyle.textAlign as any } : undefined}>
                        {col.render(a)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={setPage} />}
        </>
      )}

      {colMenu && (
        <div ref={colMenuRef} className="column-menu" style={{ top: colMenu.y, left: colMenu.x }}>
          <div className="column-menu-title">Toggle Columns</div>
          {colOrder.map(key => {
            const col = colMap.get(key);
            if (!col) return null;
            return (
              <label key={col.key} className={`column-menu-item${col.alwaysVisible ? ' column-menu-item-disabled' : ''}${dragOver === col.key ? ' column-menu-item-dragover' : ''}`}
                draggable onDragStart={() => handleDragStart(col.key)} onDragOver={(e) => handleDragOver(e, col.key)} onDrop={() => handleDrop(col.key)} onDragEnd={handleDragEnd}>
                <span className="column-menu-drag">{'\u2807'}</span>
                <input type="checkbox" checked={visibleCols.has(col.key)} disabled={col.alwaysVisible} onChange={() => toggleColumn(col.key)} />
                {col.label}
              </label>
            );
          })}
          <div className="column-menu-divider" />
          <button className="column-menu-reset" onClick={resetColumns}>Reset to Default</button>
        </div>
      )}
    </div>
  );
}
