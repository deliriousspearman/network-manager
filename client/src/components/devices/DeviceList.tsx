import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Download, Upload, Monitor, CheckSquare } from 'lucide-react';
import { fetchDevicesPaged } from '../../api/devices';
import BulkActionBar from './BulkActionBar';
import TagFilterPopover from './TagFilterPopover';
import { queryKeys } from '../../api/queryKeys';
import { analyzePcap, analyzeArp, analyzeNmap } from '../../api/pcapImport';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import { rowNavHandlers } from '../../utils/navigation';
import { SkeletonTable } from '../ui/Skeleton';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import ColumnMenu from '../ui/ColumnMenu';
import PcapImportModal from './PcapImportModal';
import CsvImportModal from './CsvImportModal';
import ArpImportModal from './ArpImportModal';
import NmapImportModal from './NmapImportModal';
import { CredentialKey } from '../diagram/nodes/CredentialKey';
import type { DeviceWithIps, PcapAnalyzeResult, NmapAnalyzeResult } from 'shared/types';
import { DEVICE_TYPE_LABELS } from 'shared/types';
import { PAGE_LIMIT } from '../../utils/constants';

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
    render: (d) => {
      const label = d.status ? d.status.charAt(0).toUpperCase() + d.status.slice(1) : 'No status';
      return (
        <span title={label}>
          <span className={`status-dot status-dot-${d.status || 'none'}`} aria-hidden="true" />
          <span className="sr-only">Status: {label}</span>
        </span>
      );
    },
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

const thSortStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

const MAX_PCAP_SIZE = 10 * 1024 * 1024; // 10 MB

export default function DeviceList() {
  const { projectId, project } = useProject();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`deviceList.search.${projectId}`, '');
  const debouncedSearch = useDebouncedValue(search);
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`deviceList.sortCol.${projectId}`, 'name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`deviceList.sortDir.${projectId}`, 'asc');
  const [filterType, setFilterType] = usePersistedState<string>(`deviceList.filterType.${projectId}`, '');
  const [filterHosting, setFilterHosting] = usePersistedState<string>(`deviceList.filterHosting.${projectId}`, '');
  const [filterStatus, setFilterStatus] = usePersistedState<string>(`deviceList.filterStatus.${projectId}`, '');
  const [filterTags, setFilterTags] = usePersistedState<string[]>(`deviceList.filterTags.${projectId}`, []);

  const cols = useColumnPrefs(COLUMNS, `deviceList.columns.${projectId}`);

  // PCAP / ARP / Nmap import
  const pcapInputRef = useRef<HTMLInputElement>(null);
  const nmapInputRef = useRef<HTMLInputElement>(null);
  const importMenuRef = useRef<HTMLDivElement>(null);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [importResult, setImportResult] = useState<{ data: PcapAnalyzeResult; source: 'pcap' | 'arp' } | null>(null);
  const [nmapResult, setNmapResult] = useState<NmapAnalyzeResult | null>(null);
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
    onError: (err: Error) => toast(err.message || 'Failed to analyze PCAP file', 'error'),
  });

  const analyzeArpMut = useMutation({
    mutationFn: (payload: { text: string }) => analyzeArp(projectId, payload),
    onSuccess: (data) => { setArpModalOpen(false); setImportResult({ data, source: 'arp' }); },
    onError: (err: Error) => toast(err.message || 'Failed to analyze ARP output', 'error'),
  });

  const analyzeNmapMut = useMutation({
    mutationFn: (payload: { filename: string; text: string }) => analyzeNmap(projectId, payload),
    onSuccess: (data) => setNmapResult(data),
    onError: (e: Error) => toast(e.message || 'Failed to analyze Nmap file', 'error'),
  });

  const analyzePcapMutate = analyzePcapMut.mutate;
  const analyzeNmapMutate = analyzeNmapMut.mutate;

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

  const handleNmapSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (file.size > MAX_PCAP_SIZE) {
      toast('File too large (max 10 MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      analyzeNmapMutate({ filename: file.name, text: reader.result as string });
    };
    reader.readAsText(file);
  }, [analyzeNmapMutate, toast]);

  const tagsKey = filterTags.length ? [...filterTags].sort().join(',') : '';
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.devices.paged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, dir: sortDir,
      type: filterType, hostingType: filterHosting, status: filterStatus, tags: tagsKey,
    }),
    queryFn: () => fetchDevicesPaged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, order: sortDir,
      type: filterType || undefined,
      hosting_type: filterHosting || undefined,
      status: filterStatus || undefined,
      tags: filterTags.length ? filterTags : undefined,
    }),
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

  async function exportCsv() {
    const [{ fetchDevicesPaged }, { drainPaged, rowsToCsv, downloadCsv, CSV_EXPORT_MAX_ROWS }] = await Promise.all([
      import('../../api/devices'),
      import('../../utils/csvExport'),
    ]);
    const { items, truncated } = await drainPaged(
      (p) => fetchDevicesPaged(projectId, {
        ...p,
        type: filterType || undefined,
        hosting_type: filterHosting || undefined,
        status: filterStatus || undefined,
      }),
      { search, sort: sortCol, order: sortDir },
    );
    const exportCols = cols.active.filter(c => c.csvValue);
    const rows: (string | number | null | undefined)[][] = [exportCols.map(c => c.label)];
    for (const d of items) {
      rows.push(exportCols.map(c => c.csvValue!(d)));
    }
    downloadCsv(rowsToCsv(rows), 'devices.csv');
    if (truncated) toast(`Export truncated at ${CSV_EXPORT_MAX_ROWS.toLocaleString()} rows`, 'info');
  }

  const base = `/p/${project.slug}`;
  const items = data?.items ?? [];
  const bulk = useBulkSelection<DeviceWithIps>(items);
  const [selectMode, setSelectMode] = useState(false);

  const selectedItems = selectMode ? items.filter(d => bulk.selectedIds.has(d.id)) : [];

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    bulk.clear();
  }, [bulk]);

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
                placeholder="Search name, hostname, IP, MAC, OS, tags"
              />
            </div>
            <select
              className="list-filter-select"
              value={filterType}
              onChange={e => { setFilterType(e.target.value); setPage(1); }}
              aria-label="Filter by type"
            >
              <option value="">All types</option>
              {Object.entries(DEVICE_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>{label}</option>
              ))}
            </select>
            <select
              className="list-filter-select"
              value={filterHosting}
              onChange={e => { setFilterHosting(e.target.value); setPage(1); }}
              aria-label="Filter by hosting type"
            >
              <option value="">All hosting</option>
              <option value="baremetal">Baremetal</option>
              <option value="vm">VM</option>
              <option value="hypervisor">Hypervisor</option>
            </select>
            <select
              className="list-filter-select"
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              <option value="up">Up</option>
              <option value="down">Down</option>
              <option value="warning">Warning</option>
              <option value="unknown">Unknown</option>
              <option value="none">No status</option>
            </select>
            <TagFilterPopover
              projectId={projectId}
              selected={filterTags}
              onChange={(tags) => { setFilterTags(tags); setPage(1); }}
            />
            {data && data.total > 0 && (
              <button
                className={`btn btn-secondary btn-icon${selectMode ? ' active' : ''}`}
                onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
                title={selectMode ? 'Exit select mode' : 'Select devices for bulk actions'}
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
            <div ref={importMenuRef} style={{ position: 'relative' }}>
              <button
                className="btn btn-secondary btn-icon"
                onClick={() => setImportMenuOpen(o => !o)}
                disabled={analyzePcapMut.isPending || analyzeArpMut.isPending || analyzeNmapMut.isPending}
                title={analyzePcapMut.isPending || analyzeArpMut.isPending || analyzeNmapMut.isPending ? 'Analyzing...' : 'Import devices'}
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
                      onClick={() => { setImportMenuOpen(false); nmapInputRef.current?.click(); }}
                    >
                      Nmap XML (.xml)
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

      {isLoading && !data ? (
        <SkeletonTable rows={8} columns={cols.active.length || 8} />
      ) : data?.total === 0 && !search && !filterType && !filterHosting && !filterStatus && filterTags.length === 0 ? (
        <EmptyState
          icon={<Monitor size={22} />}
          title="No devices yet"
          description="Track servers, workstations, routers, switches and more."
          action={<Link to={`${base}/devices/new`} className="btn btn-primary">+ Add Your First Device</Link>}
          secondaryActions={
            <>
              <span>Or import from:</span>
              <button type="button" onClick={() => nmapInputRef.current?.click()}>Nmap XML</button>
              <button type="button" onClick={() => pcapInputRef.current?.click()}>PCAP</button>
              <button type="button" onClick={() => setArpModalOpen(true)}>ARP table</button>
              <button type="button" onClick={() => setCsvImportOpen(true)}>CSV</button>
            </>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No matches" description="No devices match your filters." />
      ) : (
        <>
          {selectMode && (
            <BulkActionBar
              projectId={projectId}
              selectedIds={bulk.selectedIds}
              selectedItems={selectedItems}
              onClose={exitSelectMode}
              onClear={bulk.clear}
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
                      style={{ ...(col.thStyle || {}), ...(col.sortKey ? thSortStyle : {}) }}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                    >
                      {col.key === 'status' ? null : col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((d: DeviceWithIps) => {
                  const isSelected = bulk.selectedIds.has(d.id);
                  const rowProps = selectMode
                    ? {
                        onClick: () => bulk.toggle(d.id),
                        style: { cursor: 'pointer' } as React.CSSProperties,
                      }
                    : {
                        style: { cursor: 'pointer' } as React.CSSProperties,
                        ...rowNavHandlers(`${base}/devices/${d.id}`, navigate),
                      };
                  return (
                    <tr
                      key={d.id}
                      className={isSelected ? 'row-selected' : undefined}
                      {...rowProps}
                    >
                      {selectMode && (
                        <td style={{ padding: '0.6rem 0.25rem' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${d.name}`}
                            checked={isSelected}
                            onChange={() => bulk.toggle(d.id)}
                          />
                        </td>
                      )}
                      {cols.active.map(col => (
                        <td key={col.key} style={col.thStyle?.textAlign ? { textAlign: col.thStyle.textAlign as any } : undefined}>
                          {col.render(d)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
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
      <input
        ref={nmapInputRef}
        type="file"
        accept=".xml"
        style={{ display: 'none' }}
        onChange={handleNmapSelect}
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
          onApplied={() => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) })}
        />
      )}

      {nmapResult && (
        <NmapImportModal
          result={nmapResult}
          projectId={projectId}
          onClose={() => setNmapResult(null)}
          onApplied={() => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) })}
        />
      )}

      {csvImportOpen && (
        <CsvImportModal
          onClose={() => setCsvImportOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) })}
        />
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
