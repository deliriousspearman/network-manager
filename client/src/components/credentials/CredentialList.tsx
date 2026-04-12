import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown, Search, Pencil, Trash2, EyeOff, Eye, KeyRound } from 'lucide-react';
import { fetchCredentialsPaged, fetchCredentialFileText, downloadCredentialFile, deleteCredential, toggleCredentialHidden } from '../../api/credentials';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { useProject } from '../../contexts/ProjectContext';
import type { CredentialWithDevice } from 'shared/types';
import { createPortal } from 'react-dom';
import LoadingSpinner from '../ui/LoadingSpinner';
import Pagination from '../ui/Pagination';
import PageHeader from '../layout/PageHeader';
import EmptyState from '../ui/EmptyState';
import CredentialForm from './CredentialForm';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { usePersistedState } from '../../hooks/usePersistedState';

type SortCol = 'device_name' | 'host' | 'username' | 'type' | 'source';

const PAGE_LIMIT = 50;

function FileDetailModal({ credential, projectId, onClose }: {
  credential: CredentialWithDevice;
  projectId: number;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const [fileText, setFileText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCredentialFileText(projectId, credential.id)
      .then(text => setFileText(text))
      .catch(() => setFileText(null))
      .finally(() => setLoading(false));
  }, [projectId, credential.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownload = () => {
    if (credential.file_name) {
      downloadCredentialFile(projectId, credential.id, credential.file_name);
    }
  };

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div className="confirm-dialog credential-detail-modal" ref={trapRef} onClick={e => e.stopPropagation()}>
        <div className="confirm-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{credential.file_name}</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>
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
      </div>
    </div>,
    document.body
  );
}

export default function CredentialList() {
  const { projectId, project } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = usePersistedState<string>(`credentialList.search.${projectId}`, '');
  const [sortCol, setSortCol] = usePersistedState<SortCol>(`credentialList.sortCol.${projectId}`, 'device_name');
  const [sortDir, setSortDir] = usePersistedState<'asc' | 'desc'>(`credentialList.sortDir.${projectId}`, 'asc');
  const [filterUsed, setFilterUsed] = usePersistedState<string>(`credentialList.filterUsed.${projectId}`, '');
  const [filterHidden, setFilterHidden] = usePersistedState<string>(`credentialList.filterHidden.${projectId}`, '');
  const [selectedCredential, setSelectedCredential] = useState<CredentialWithDevice | null>(null);
  const [formModal, setFormModal] = useState<{ open: boolean; editId?: number }>({ open: false });
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['credentials', projectId, 'paged', page, PAGE_LIMIT, search, sortCol, sortDir, filterUsed, filterHidden],
    queryFn: () => fetchCredentialsPaged(projectId, { page, limit: PAGE_LIMIT, search, sort: sortCol, order: sortDir, used: filterUsed || undefined, hidden: filterHidden || undefined }),
    placeholderData: keepPreviousData,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCredential(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials', projectId] }),
    onError: () => toast('Failed to delete credential', 'error'),
  });

  const hideMut = useMutation({
    mutationFn: ({ id, hidden }: { id: number; hidden: boolean }) => toggleCredentialHidden(projectId, id, hidden),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials', projectId] }),
    onError: () => toast('Failed to update credential', 'error'),
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

  async function fetchAll() {
    const { fetchCredentialsPaged: fp } = await import('../../api/credentials');
    const all = await fp(projectId, { page: 1, limit: 9999, search, sort: sortCol, order: sortDir, used: filterUsed || undefined, hidden: filterHidden || undefined });
    return all.items;
  }

  async function exportCsv() {
    const items = await fetchAll();
    const rows = [['Device', 'Host', 'Username', 'Password', 'Type', 'Source', 'Used']];
    for (const c of items) {
      rows.push([c.device_name ?? '', c.host ?? '', c.username, c.password ?? '', c.type ?? '', c.source ?? '', c.used ? 'Yes' : 'No']);
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'credentials.csv';
    a.click();
    setExportOpen(false);
  }

  async function copyUserPass() {
    const items = await fetchAll();
    const text = items.map(c => `${c.username}:${c.password ?? ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback('Copied!');
    setTimeout(() => setCopyFeedback(''), 1500);
    setExportOpen(false);
  }

  async function copyPasswords() {
    const items = await fetchAll();
    const seen = new Set<string>();
    const text = items
      .map(c => c.password ?? '')
      .filter(p => p && !seen.has(p) && !!seen.add(p))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback('Copied!');
    setTimeout(() => setCopyFeedback(''), 1500);
    setExportOpen(false);
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  if (isLoading && !data) return <LoadingSpinner />;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };
  const items = data?.items ?? [];

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
                placeholder="Search"
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
            {copyFeedback && <span style={{ fontSize: 'var(--fs-sm)', color: 'var(--color-text-secondary)' }}>{copyFeedback}</span>}
            {data && data.total > 0 && (
              <div ref={exportRef} style={{ position: 'relative' }}>
                <button className="btn btn-secondary" onClick={() => setExportOpen(v => !v)}>Export ▾</button>
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
            <button className="btn btn-primary" onClick={() => setFormModal({ open: true })}>+ Add Credential</button>
          </>
        }
      />

      {!isLoading && data?.total === 0 && !search ? (
        <EmptyState
          icon={<KeyRound size={22} />}
          title="No credentials yet"
          description="Store device logins, SSH keys, and API tokens in one place."
          action={<button className="btn btn-primary" onClick={() => setFormModal({ open: true })}>+ Add Your First Credential</button>}
        />
      ) : !isLoading && items.length === 0 ? (
        <EmptyState title="No matches" description="No credentials match your search." />
      ) : (
        <>
          <div className="card table-container">
            <table>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => handleSort('device_name')}>Device <SortIcon col="device_name" /></th>
                  <th style={thStyle} onClick={() => handleSort('host')}>Host <SortIcon col="host" /></th>
                  <th style={thStyle} onClick={() => handleSort('username')}>Username <SortIcon col="username" /></th>
                  <th>Password</th>
                  <th style={thStyle} onClick={() => handleSort('type')}>Type <SortIcon col="type" /></th>
                  <th style={thStyle} onClick={() => handleSort('source')}>Source <SortIcon col="source" /></th>
                  <th>Used</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c: CredentialWithDevice) => (
                  <tr key={c.id}>
                    <td>{c.device_id ? <Link className="credential-file-link" to={`${base}/devices/${c.device_id}`}>{c.device_name}</Link> : '—'}</td>
                    <td>{c.host || '—'}</td>
                    <td>{c.username}</td>
                    <td>{c.password || '—'}</td>
                    <td>
                      {c.has_file && c.file_name ? (
                        <span className="credential-file-link" onClick={() => setSelectedCredential(c)}>
                          {c.type || '—'}
                        </span>
                      ) : (
                        c.type || '—'
                      )}
                    </td>
                    <td>{c.source || '—'}</td>
                    <td>
                      <span className="badge" style={{
                        background: c.used ? 'var(--color-success, #22c55e)' : 'var(--color-border)',
                        color: c.used ? '#fff' : 'var(--color-text-secondary)',
                        fontSize: '0.75rem',
                      }}>
                        {c.used ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="actions">
                      <button className="btn btn-secondary btn-sm" title="Edit" onClick={() => setFormModal({ open: true, editId: c.id })}><Pencil size={13} /></button>
                      <button
                        className="btn btn-secondary btn-sm"
                        title={c.hidden ? 'Unhide' : 'Hide'}
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
                        title="Delete"
                        onClick={async () => { if (await confirm('Delete this credential?')) deleteMut.mutate(c.id); }}
                      ><Trash2 size={13} /></button>
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

      {selectedCredential && (
        <FileDetailModal
          credential={selectedCredential}
          projectId={projectId}
          onClose={() => setSelectedCredential(null)}
        />
      )}

      {formModal.open && createPortal(
        <div className="confirm-overlay" onClick={() => setFormModal({ open: false })}>
          <CredentialFormModal editId={formModal.editId} onClose={() => setFormModal({ open: false })} />
        </div>,
        document.body
      )}
    </div>
  );
}

function CredentialFormModal({ editId, onClose }: { editId?: number; onClose: () => void }) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div className="confirm-dialog" ref={trapRef} style={{ maxWidth: 500, width: '90vw' }} onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{editId ? 'Edit Credential' : 'New Credential'}</span>
        <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
      </div>
      <CredentialForm editId={editId} onClose={onClose} />
    </div>
  );
}
