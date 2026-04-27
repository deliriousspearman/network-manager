import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Pencil, Trash2, EyeOff, Eye, KeyRound, Download, Upload, CheckSquare } from 'lucide-react';
import { fetchCredentialsPaged, fetchCredentialFileText, downloadCredentialFile, deleteCredential, toggleCredentialHidden, bulkDeleteCredentials } from '../../api/credentials';
import { undoMany } from '../../api/undo';
import { useBulkSelection } from '../../hooks/useBulkSelection';
import SimpleBulkDeleteBar from '../ui/SimpleBulkDeleteBar';
import { queryKeys } from '../../api/queryKeys';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useProject } from '../../contexts/ProjectContext';
import type { CredentialWithDevice } from 'shared/types';
import { SkeletonTable } from '../ui/Skeleton';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import ColumnMenu from '../ui/ColumnMenu';
import Modal from '../ui/Modal';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import CredentialForm from './CredentialForm';
import CredentialCsvImportModal from './CredentialCsvImportModal';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { PAGE_LIMIT } from '../../utils/constants';

type SortCol = 'device_name' | 'host' | 'username' | 'type' | 'source';

const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

function FileDetailModal({ credential, projectId, onClose }: {
  credential: CredentialWithDevice;
  projectId: number;
  onClose: () => void;
}) {
  const [fileText, setFileText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCredentialFileText(projectId, credential.id)
      .then(text => setFileText(text))
      .catch(() => setFileText(null))
      .finally(() => setLoading(false));
  }, [projectId, credential.id]);

  const handleDownload = () => {
    if (credential.file_name) {
      downloadCredentialFile(projectId, credential.id, credential.file_name);
    }
  };

  return (
    <Modal
      onClose={onClose}
      className="credential-detail-modal"
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{credential.file_name}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
      {loading ? (
        <div className="loading">Loading...</div>
      ) : (
        <>
          {fileText !== null ? (
            <pre className="credential-file-preview">{fileText}</pre>
          ) : (
            <div className="confirm-dialog-message">Unable to display file content.</div>
          )}
          <div className="confirm-dialog-actions">
            <button className="btn btn-primary" onClick={handleDownload}>Download</button>
          </div>
        </>
      )}
    </Modal>
  );
}

export default function CredentialList() {
  const { projectId, project } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [flashId, setFlashId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`credentialList.search.${projectId}`, '');
  const debouncedSearch = useDebouncedValue(search);
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`credentialList.sortCol.${projectId}`, 'device_name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`credentialList.sortDir.${projectId}`, 'asc');
  const [filterUsed, setFilterUsed] = usePersistedState<string>(`credentialList.filterUsed.${projectId}`, '');
  const [filterHidden, setFilterHidden] = usePersistedState<string>(`credentialList.filterHidden.${projectId}`, '');
  const [selectedCredential, setSelectedCredential] = useState<CredentialWithDevice | null>(null);
  const [formModal, setFormModal] = useState<{ open: boolean; editId?: number }>({ open: false });
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.credentials.paged(projectId, {
      page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, dir: sortDir, used: filterUsed, hidden: filterHidden,
    }),
    queryFn: () => fetchCredentialsPaged(projectId, { page, limit: PAGE_LIMIT, search: debouncedSearch, sort: sortCol, order: sortDir, used: filterUsed || undefined, hidden: filterHidden || undefined }),
    placeholderData: keepPreviousData,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCredential(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) }),
    onError: (err: Error) => toast(err.message || 'Failed to delete credential', 'error'),
  });

  const hideMut = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) => toggleCredentialHidden(projectId, id, hidden),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) }),
    onError: (err: Error) => toast(err.message || 'Failed to update credential', 'error'),
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

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!formModal.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFormModal({ open: false }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [formModal.open]);

  useEffect(() => {
    if (!highlightId || !data?.items) return;
    const id = Number(highlightId);
    if (!data.items.some(c => c.id === id)) return;
    const row = document.getElementById(`credential-row-${id}`);
    if (row) {
      row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setFlashId(id);
      const timer = setTimeout(() => {
        setFlashId(null);
        setSearchParams(prev => {
          const next = new URLSearchParams(prev);
          next.delete('highlight');
          return next;
        }, { replace: true });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [highlightId, data?.items, setSearchParams]);

  async function fetchAll() {
    const [{ fetchCredentialsPaged: fp }, { drainPaged, CSV_EXPORT_MAX_ROWS }] = await Promise.all([
      import('../../api/credentials'),
      import('../../utils/csvExport'),
    ]);
    const { items, truncated } = await drainPaged(
      (p) => fp(projectId, { ...p, used: filterUsed || undefined, hidden: filterHidden || undefined }),
      { search, sort: sortCol, order: sortDir },
    );
    if (truncated) toast(`Export truncated at ${CSV_EXPORT_MAX_ROWS.toLocaleString()} rows`, 'info');
    return items;
  }

  async function exportCsv() {
    const items = await fetchAll();
    const { rowsToCsv, downloadCsv } = await import('../../utils/csvExport');
    const rows: (string | number | null | undefined)[][] = [['Device', 'Host', 'Username', 'Password', 'Type', 'Source', 'Used']];
    for (const c of items) {
      rows.push([c.device_name ?? '', c.host ?? '', c.username, c.password ?? '', c.type ?? '', c.source ?? '', c.used ? 'Yes' : 'No']);
    }
    downloadCsv(rowsToCsv(rows), 'credentials.csv');
    setExportOpen(false);
  }

  async function copyUserPass() {
    const items = await fetchAll();
    const text = items.map(c => `${c.username}:${c.password ?? ''}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast(`Copied ${items.length} user:password ${items.length === 1 ? 'pair' : 'pairs'}`, 'success');
    setExportOpen(false);
  }

  async function copyPasswords() {
    const items = await fetchAll();
    const seen = new Set<string>();
    const text = items
      .map(c => c.password ?? '')
      .filter(p => p && !seen.has(p) && !!seen.add(p))
      .join('\n');
    await navigator.clipboard.writeText(text);
    toast(`Copied ${seen.size} unique ${seen.size === 1 ? 'password' : 'passwords'}`, 'success');
    setExportOpen(false);
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  const base = `/p/${project.slug}`;
  const items = data?.items ?? [];

  interface CredColumnDef {
    key: string;
    label: string;
    defaultVisible: boolean;
    alwaysVisible?: boolean;
    sortKey?: SortCol;
    render: (c: CredentialWithDevice) => React.ReactNode;
  }
  const columns = useMemo<CredColumnDef[]>(() => [
    {
      key: 'device', label: 'Device', defaultVisible: true, sortKey: 'device_name',
      render: c => c.device_id ? <Link className="credential-file-link" to={`${base}/devices/${c.device_id}`}>{c.device_name}</Link> : '—',
    },
    { key: 'host', label: 'Host', defaultVisible: true, sortKey: 'host', render: c => c.host || '—' },
    { key: 'username', label: 'Username', defaultVisible: true, alwaysVisible: true, sortKey: 'username', render: c => c.username },
    {
      key: 'password', label: 'Password', defaultVisible: true,
      render: c => (
        c.has_file && c.file_name
          ? <span className="credential-file-link" onClick={() => setSelectedCredential(c)}>{c.password || c.file_name}</span>
          : (c.password || '—')
      ),
    },
    { key: 'type', label: 'Type', defaultVisible: true, sortKey: 'type', render: c => c.type || '—' },
    { key: 'source', label: 'Source', defaultVisible: true, sortKey: 'source', render: c => c.source || '—' },
    {
      key: 'used', label: 'Used', defaultVisible: true,
      render: c => (
        <span className="badge" style={{
          background: c.used ? 'var(--color-success, #22c55e)' : 'var(--color-border)',
          color: c.used ? '#fff' : 'var(--color-text-secondary)',
          fontSize: '0.75rem',
        }}>
          {c.used ? 'Yes' : 'No'}
        </span>
      ),
    },
    {
      key: 'last_used_at', label: 'Last used', defaultVisible: false,
      render: c => c.last_used_at ? new Date(c.last_used_at + 'Z').toLocaleString() : '—',
    },
  ], [base]);

  const cols = useColumnPrefs(columns, `credentialList.columns.${projectId}`);

  const bulk = useBulkSelection<CredentialWithDevice>(items);
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
      `Delete ${ids.length} ${ids.length === 1 ? 'credential' : 'credentials'}? They can be restored from Trash or with Ctrl+Z.`,
      'Delete Selected Credentials',
    );
    if (!ok) return;
    setBulkPending(true);
    try {
      const { deleted, failed } = await bulkDeleteCredentials(projectId, ids);
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      if (deleted.length > 0) {
        toast(
          `Deleted ${deleted.length} ${deleted.length === 1 ? 'credential' : 'credentials'}`,
          'success',
          {
            label: 'Undo all',
            onClick: async () => {
              const { restored } = await undoMany(projectId, deleted.length);
              queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) });
              queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
              toast(`Restored ${restored} ${restored === 1 ? 'credential' : 'credentials'}`, 'success');
            },
          }
        );
      }
      if (failed.length > 0) {
        toast(`Failed to delete ${failed.length} ${failed.length === 1 ? 'credential' : 'credentials'}`, 'error');
      }
      exitSelectMode();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete credentials', 'error');
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Credentials"
        subtitle={typeof data?.total === 'number' ? `${data.total} total` : undefined}
        actions={
          <>
            <div className="list-search">
              <Search size={14} className="list-search-icon" />
              <input
                className="list-search-input"
                value={search}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search username, host, type, device"
              />
            </div>
            <select
              className="list-filter-select"
              value={filterUsed}
              onChange={e => { setFilterUsed(e.target.value); setPage(1); }}
            >
              <option value="">All credentials</option>
              <option value="1">Used only</option>
              <option value="0">Unused only</option>
            </select>
            <select
              className="list-filter-select"
              value={filterHidden}
              onChange={e => { setFilterHidden(e.target.value); setPage(1); }}
            >
              <option value="">Visible</option>
              <option value="1">Hidden</option>
              <option value="all">No Filter</option>
            </select>
            {data && data.total > 0 && (
              <div ref={exportRef} style={{ position: 'relative' }}>
                <button
                  className="btn btn-secondary btn-icon"
                  onClick={() => setExportOpen(v => !v)}
                  title="Export"
                  aria-label="Export"
                  aria-haspopup="menu"
                  aria-expanded={exportOpen}
                >
                  <Download size={14} />
                </button>
                {exportOpen && (
                  <div className="context-menu" style={{ right: 0, top: 'calc(100% + 4px)', left: 'auto', minWidth: 200 }}>
                    <div className="context-menu-items">
                      <button className="context-menu-item" onClick={exportCsv}>Export CSV</button>
                      <button className="context-menu-item" onClick={copyUserPass}>Copy username:password</button>
                      <button className="context-menu-item" onClick={copyPasswords}>Copy passwords</button>
                    </div>
                  </div>
                )}
              </div>
            )}
            <button
              className="btn btn-secondary btn-icon"
              onClick={() => setImportModalOpen(true)}
              title="Import CSV"
              aria-label="Import CSV"
            >
              <Upload size={14} />
            </button>
            {data && data.total > 0 && (
              <button
                className={`btn btn-secondary btn-icon${selectMode ? ' active' : ''}`}
                onClick={() => { if (selectMode) exitSelectMode(); else setSelectMode(true); }}
                title={selectMode ? 'Exit select mode' : 'Select credentials for bulk actions'}
                aria-label={selectMode ? 'Exit select mode' : 'Enter select mode'}
                aria-pressed={selectMode}
              >
                <CheckSquare size={14} />
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setFormModal({ open: true })}>+ Add Credential</button>
          </>
        }
      />

      {isLoading && !data ? (
        <SkeletonTable rows={8} columns={cols.active.length + 1} />
      ) : data?.total === 0 && !search ? (
        <EmptyState
          icon={<KeyRound size={22} />}
          title="No credentials yet"
          description="Store device logins, SSH keys, and API tokens in one place."
          action={<button className="btn btn-primary" onClick={() => setFormModal({ open: true })}>+ Add Your First Credential</button>}
          secondaryActions={
            <>
              <span>Or import from:</span>
              <button type="button" onClick={() => setImportModalOpen(true)}>CSV</button>
            </>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState title="No matches" description="No credentials match your search." />
      ) : (
        <>
          {selectMode && (
            <SimpleBulkDeleteBar
              count={bulk.count}
              noun="credential"
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
                      style={col.sortKey ? thStyle : undefined}
                      onClick={col.sortKey ? () => handleSort(col.sortKey!) : undefined}
                    >
                      {col.label}{col.sortKey && <> <SortIcon col={col.sortKey} /></>}
                    </th>
                  ))}
                  {!selectMode && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.map((c: CredentialWithDevice) => {
                  const isSelected = bulk.selectedIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      id={`credential-row-${c.id}`}
                      className={[
                        flashId === c.id ? 'row-flash' : '',
                        isSelected ? 'row-selected' : '',
                      ].filter(Boolean).join(' ') || undefined}
                      style={selectMode ? { cursor: 'pointer' } : undefined}
                      onClick={selectMode ? () => bulk.toggle(c.id) : undefined}
                    >
                      {selectMode && (
                        <td style={{ padding: '0.6rem 0.25rem' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${c.username}`}
                            checked={isSelected}
                            onChange={() => bulk.toggle(c.id)}
                          />
                        </td>
                      )}
                      {cols.active.map(col => (
                        <td key={col.key}>{col.render(c)}</td>
                      ))}
                      {!selectMode && (
                        <td className="actions">
                          <button className="btn btn-secondary btn-sm" title="Edit" aria-label="Edit" onClick={() => setFormModal({ open: true, editId: c.id })}><Pencil size={13} /></button>
                          <button
                            className="btn btn-secondary btn-sm"
                            title={c.hidden ? 'Unhide' : 'Hide'} aria-label={c.hidden ? 'Unhide' : 'Hide'}
                            onClick={async () => {
                              if (c.hidden) {
                                hideMut.mutate({ id: c.id, hidden: false });
                                return;
                              }
                              const ok = await confirm(
                                "This credential will no longer appear in the list. You can unhide it later by switching the filter to 'Hidden' or 'No Filter'.",
                                'Hide Credential',
                              );
                              if (ok) hideMut.mutate({ id: c.id, hidden: true });
                            }}
                          >{c.hidden ? <Eye size={13} /> : <EyeOff size={13} />}</button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete" aria-label="Delete"
                            onClick={async () => { if (await confirm('Delete this credential?')) deleteMut.mutate(c.id); }}
                          ><Trash2 size={13} /></button>
                        </td>
                      )}
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
          columns={columns}
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

      {selectedCredential && (
        <FileDetailModal
          credential={selectedCredential}
          projectId={projectId}
          onClose={() => setSelectedCredential(null)}
        />
      )}

      {formModal.open && (
        <CredentialFormModal editId={formModal.editId} onClose={() => setFormModal({ open: false })} />
      )}

      {importModalOpen && (
        <CredentialCsvImportModal
          onClose={() => setImportModalOpen(false)}
          onImported={() => queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) })}
        />
      )}
    </div>
  );
}

function CredentialFormModal({ editId, onClose }: { editId?: number; onClose: () => void }) {
  return (
    <Modal
      onClose={onClose}
      style={{ maxWidth: 500, width: '90vw' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{editId ? 'Edit Credential' : 'New Credential'}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
      }
    >
      <CredentialForm editId={editId} onClose={onClose} />
    </Modal>
  );
}
