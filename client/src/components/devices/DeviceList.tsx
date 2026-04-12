import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Upload, Monitor } from 'lucide-react';
import { fetchDevicesPaged } from '../../api/devices';
import { analyzePcap, analyzeArp } from '../../api/pcapImport';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { getStorage, setStorage } from '../../utils/storage';
import { usePersistedState } from '../../hooks/usePersistedState';
import { rowNavHandlers } from '../../utils/navigation';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import PcapImportModal from './PcapImportModal';
import CsvImportModal from './CsvImportModal';
import ArpImportModal from './ArpImportModal';
import { CredentialKey } from '../diagram/nodes/CredentialKey';
import type { DeviceWithIps, PcapAnalyzeResult } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';

type SortCol = 'name' | 'type' | 'hosting_type' | 'primary_ip' | 'os' | 'subnet_name' | 'status';

interface ColumnDef {
  key: string;
  label: string;
  defaultVisible: boolean;
  alwaysVisible?: boolean;
  sortKey?: SortCol;
  thStyle?: React.CSSProperties;
  render: (d: DeviceWithIps) => React.ReactNode;
  csvValue?: (d: DeviceWithIps) => string;
}

const COLUMNS: ColumnDef[] = [
  {
    key: 'status', label: 'Status', defaultVisible: true, alwaysVisible: true,
    sortKey: 'status',
    thStyle: { width: '28px', padding: '0.6rem 0.25rem' },
    render: (d) => <span className={`status-dot status-dot-${d.status || 'none'}`} />,
    csvValue: (d) => d.status ?? '',
  },
  {
    key: 'name', label: 'Name', defaultVisible: true, alwaysVisible: true,
    sortKey: 'name',
    render: (d) => d.name,
    csvValue: (d) => d.name,
  },
  {
    key: 'type', label: 'Type', defaultVisible: true,
    sortKey: 'type',
    render: (d) => <span className={`badge badge-${d.type}`}>{DEVICE_TYPE_LABELS[d.type] || d.type}</span>,
    csvValue: (d) => DEVICE_TYPE_LABELS[d.type] || d.type,
  },
  {
    key: 'hosting', label: 'Hosting', defaultVisible: true,
    sortKey: 'hosting_type',
    render: (d) => d.hosting_type ? <span className={`badge badge-hosting-${d.hosting_type}`}>{d.hosting_type}</span> : '—',
    csvValue: (d) => d.hosting_type ?? '',
  },
  {
    key: 'ip', label: 'IP Address', defaultVisible: true,
    sortKey: 'primary_ip',
    render: (d) => d.primary_ip || '—',
    csvValue: (d) => d.primary_ip ?? '',
  },
  {
    key: 'os', label: 'OS', defaultVisible: true,
    sortKey: 'os',
    render: (d) => d.os || '—',
    csvValue: (d) => d.os ?? '',
  },
  {
    key: 'subnet', label: 'Subnet', defaultVisible: true,
    sortKey: 'subnet_name',
    render: (d) => d.subnet_name || '—',
    csvValue: (d) => d.subnet_name ?? '',
  },
  {
    key: 'mac_address', label: 'MAC Address', defaultVisible: false,
    render: (d) => d.mac_address || '—',
    csvValue: (d) => d.mac_address ?? '',
  },
  {
    key: 'hostname', label: 'Hostname', defaultVisible: false,
    render: (d) => d.hostname || '—',
    csvValue: (d) => d.hostname ?? '',
  },
  {
    key: 'domain', label: 'Domain', defaultVisible: false,
    render: (d) => d.domain || '—',
    csvValue: (d) => d.domain ?? '',
  },
  {
    key: 'location', label: 'Location', defaultVisible: false,
    render: (d) => d.location || '—',
    csvValue: (d) => d.location ?? '',
  },
  {
    key: 'tags', label: 'Tags', defaultVisible: true,
    render: (d) => d.tags?.length > 0 ? (
      <div className="flex flex-wrap gap-1">
        {d.tags.map(tag => <span key={tag} className="tag-pill">{tag}</span>)}
      </div>
    ) : null,
    csvValue: (d) => (d.tags ?? []).join('; '),
  },
  {
    key: 'av', label: 'AV', defaultVisible: true,
    thStyle: { textAlign: 'center' },
    render: (d) => d.av ? '🛡️' : '',
    csvValue: (d) => d.av ? 'Yes' : '',
  },
  {
    key: 'creds', label: 'Creds', defaultVisible: true,
    thStyle: { textAlign: 'center' },
    render: (d) => d.credential_count ? <CredentialKey used={!!d.any_credential_used} size="1.1rem" /> : '',
    csvValue: (d) => d.credential_count ? 'Yes' : '',
  },
  {
    key: 'notes', label: 'Notes', defaultVisible: false,
    render: (d) => d.notes ? (d.notes.length > 60 ? d.notes.slice(0, 60) + '…' : d.notes) : '—',
    csvValue: (d) => d.notes ?? '',
  },
];

const DEFAULT_VISIBLE = new Set(COLUMNS.filter(c => c.defaultVisible).map(c => c.key));
const DEFAULT_ORDER = COLUMNS.map(c => c.key);

interface ColConfig { visible: Set<string>; order: string[] }

function loadColConfig(projectId: number): ColConfig {
  const stored = getStorage(`deviceList.columns.${projectId}`);
  if (!stored) return { visible: new Set(DEFAULT_VISIBLE), order: DEFAULT_ORDER };
  try {
    const cfg = JSON.parse(stored);
    const validKeys = new Set(COLUMNS.map(c => c.key));

    // Visibility
    const vis = new Set<string>(
      Array.isArray(cfg.visible) ? cfg.visible.filter((k: string) => validKeys.has(k)) : [...DEFAULT_VISIBLE],
    );
    for (const col of COLUMNS) { if (col.alwaysVisible) vis.add(col.key); }
    if (vis.size === 0) for (const k of DEFAULT_VISIBLE) vis.add(k);

    // Order — start from stored, append any missing keys
    let order: string[] = Array.isArray(cfg.order) ? cfg.order.filter((k: string) => validKeys.has(k)) : [];
    const inOrder = new Set(order);
    for (const k of DEFAULT_ORDER) { if (!inOrder.has(k)) order.push(k); }

    return { visible: vis, order };
  } catch {
    return { visible: new Set(DEFAULT_VISIBLE), order: DEFAULT_ORDER };
  }
}

function saveColConfig(projectId: number, visible: Set<string>, order: string[]) {
  setStorage(`deviceList.columns.${projectId}`, JSON.stringify({ visible: [...visible], order }));
}

const PAGE_LIMIT = 50;

const MAX_PCAP_SIZE = 10 * 1024 * 1024; // 10 MB

export default function DeviceList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`deviceList.search.${projectId}`, '');
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`deviceList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`deviceList.sortDir.${projectId}`, 'asc');

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

  const handleDragOver = useCallback((e: React.DragEvent, key: string) => {
    e.preventDefault();
    setDragOver(key);
  }, []);

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

  const handleHeaderContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setColMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close column menu on click-outside or Escape
  useEffect(() => {
    if (!colMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenu(null);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColMenu(null); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => { document.removeEventListener('mousedown', handleClick); document.removeEventListener('keydown', handleKey); };
  }, [colMenu]);

  // PCAP / ARP import
  const pcapInputRef = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ data: PcapAnalyzeResult; source: 'pcap' | 'arp' } | null>(null);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [arpModalOpen, setArpModalOpen] = useState(false);

  useEffect(() => {
    if (!importMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (importMenuRef.current && !importMenuRef.current.contains(e.target as Node)) {
        setImportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [importMenuOpen]);

  const analyzePcapMut = useMutation({
    mutationFn: (payload: { filename: string; data: string }) => analyzePcap(projectId, payload),
    onSuccess: (data) => setImportResult({ data, source: 'pcap' }),
    onError: () => toast('Failed to analyze PCAP file', 'error'),
  });

  const analyzeArpMut = useMutation({
    mutationFn: (payload: { text: string }) => analyzeArp(projectId, payload),
    onSuccess: (data) => { setArpModalOpen(false); setImportResult({ data, source: 'arp' }); },
    onError: () => toast('Failed to analyze ARP output', 'error'),
  });

  const analyzePcapMutate = analyzePcapMut.mutate;

  const handlePcapSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > MAX_PCAP_SIZE) {
      toast('File too large (max 10 MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      analyzePcapMutate({ filename: file.name, data: base64 });
    };
    reader.readAsDataURL(file);
  }, [analyzePcapMutate, toast]);

  const { data, isLoading } = useQuery({
    queryKey: ['devices', projectId, 'paged', page, PAGE_LIMIT, search, sortCol, sortDir],
    queryFn: () => fetchDevicesPaged(projectId, { page, limit: PAGE_LIMIT, search, sort: sortCol, order: sortDir }),
    placeholderData: keepPreviousData,
  });

  const handlePageChange = useCallback((p: number) => {
    setPage(p);
  }, []);

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

  const colMap = new Map(COLUMNS.map(c => [c.key, c]));
  const activeCols = colOrder.filter(k => visibleCols.has(k)).map(k => colMap.get(k)!).filter(Boolean);

  async function exportCsv() {
    const { fetchDevicesPaged: fp } = await import('../../api/devices');
    const all = await fp(projectId, { page: 1, limit: 9999, search, sort: sortCol, order: sortDir });
    const exportCols = activeCols.filter(c => c.csvValue);
    const rows = [exportCols.map(c => c.label)];
    for (const d of all.items) {
      rows.push(exportCols.map(c => c.csvValue!(d)));
    }
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'devices.csv';
    a.click();
  }

  if (isLoading && !data) return <LoadingSpinner />;

  const base = `/p/${project.slug}`;
  const thSortStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const items = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Devices"
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
            <div ref={importMenuRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => setImportMenuOpen(o => !o)}
                disabled={analyzePcapMut.isPending || analyzeArpMut.isPending}
                title={analyzePcapMut.isPending || analyzeArpMut.isPending ? 'Analyzing...' : 'Import devices'}
              >
                <Upload size={14} />
              </button>
              {importMenuOpen && (
                <div className="context-menu" style={{ right: 0, top: 'calc(100% + 4px)', left: 'auto' }}>
                  <div className="context-menu-items">
                    <button
                      className="context-menu-item"
                      onClick={() => { setImportMenuOpen(false); pcapInputRef.current?.click(); }}
                    >
                      PCAP file (.pcap / .pcapng)
                    </button>
                    <button
                      className="context-menu-item"
                      onClick={() => { setImportMenuOpen(false); setArpModalOpen(true); }}
                    >
                      ARP output (arp -avn)
                    </button>
                    <button
                      className="context-menu-item"
                      onClick={() => { setImportMenuOpen(false); setCsvImportOpen(true); }}
                    >
                      CSV file
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Link to={`${base}/devices/new`} className="btn btn-primary">+ Add Device</Link>
          </>
        }
      />

      {!isLoading && data?.total === 0 && !search ? (
        <EmptyState
          icon={<Monitor size={22} />}
          title="No devices yet"
          description="Track servers, workstations, routers, switches and more."
          action={<Link to={`${base}/devices/new`} className="btn btn-primary">+ Add Your First Device</Link>}
        />
      ) : !isLoading && items.length === 0 ? (
        <EmptyState title="No matches" description="No devices match your search." />
      ) : (
        <>
          <div className="card table-container">
            <table>
              <thead>
                <tr onContextMenu={handleHeaderContextMenu}>
                  {activeCols.map(col => (
                    <th
                      key={col.key}
                      style={{ ...(col.thStyle || {}), ...(col.sortKey ? thSortStyle : {}) }}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                    >
                      {col.key === 'status' ? null : col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((d: DeviceWithIps) => (
                  <tr key={d.id} style={{ cursor: 'pointer' }} {...rowNavHandlers(`${base}/devices/${d.id}`, navigate)}>
                    {activeCols.map(col => (
                      <td key={col.key} style={col.thStyle?.textAlign ? { textAlign: col.thStyle.textAlign as any } : undefined}>
                        {col.render(d)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data && (
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onChange={handlePageChange} />
          )}
        </>
      )}
      <input
        ref={pcapInputRef}
        type="file"
        accept=".pcap,.pcapng,.cap"
        style={{ display: 'none' }}
        onChange={handlePcapSelect}
      />
      {arpModalOpen && (
        <ArpImportModal
          onClose={() => setArpModalOpen(false)}
          onSubmit={(text) => analyzeArpMut.mutate({ text })}
          isPending={analyzeArpMut.isPending}
        />
      )}

      {importResult && (
        <PcapImportModal
          result={importResult.data}
          source={importResult.source}
          projectId={projectId}
          onClose={() => setImportResult(null)}
          onApplied={() => queryClient.invalidateQueries({ queryKey: ['devices', projectId] })}
        />
      )}

      {csvImportOpen && (
        <CsvImportModal
          onClose={() => setCsvImportOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: ['devices', projectId] })}
        />
      )}

      {colMenu && (
        <div
          ref={colMenuRef}
          className="column-menu"
          style={{ top: colMenu.y, left: colMenu.x }}
        >
          <div className="column-menu-title">Toggle Columns</div>
          {colOrder.map(key => {
            const col = colMap.get(key);
            if (!col) return null;
            return (
              <label
                key={col.key}
                className={`column-menu-item${col.alwaysVisible ? ' column-menu-item-disabled' : ''}${dragOver === col.key ? ' column-menu-item-dragover' : ''}`}
                draggable
                onDragStart={() => handleDragStart(col.key)}
                onDragOver={(e) => handleDragOver(e, col.key)}
                onDrop={() => handleDrop(col.key)}
                onDragEnd={handleDragEnd}
              >
                <span className="column-menu-drag">⠿</span>
                <input
                  type="checkbox"
                  checked={visibleCols.has(col.key)}
                  disabled={col.alwaysVisible}
                  onChange={() => toggleColumn(col.key)}
                />
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
