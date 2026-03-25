import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { fetchCredentials, fetchCredentialFileText, downloadCredentialFile, deleteCredential } from '../../api/credentials';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useProject } from '../../contexts/ProjectContext';
import type { CredentialWithDevice } from 'shared/types';
import { createPortal } from 'react-dom';

type SortCol = 'device_name' | 'host' | 'username' | 'type' | 'source';

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
      <div className="confirm-dialog credential-detail-modal" onClick={e => e.stopPropagation()}>
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
  const queryClient = useQueryClient();
  const { data: credentials, isLoading } = useQuery({ queryKey: ['credentials', projectId], queryFn: () => fetchCredentials(projectId) });
  const [selectedCredential, setSelectedCredential] = useState<CredentialWithDevice | null>(null);
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState('');
  const exportRef = useRef<HTMLDivElement>(null);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteCredential(projectId, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials', projectId] }),
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function exportCsv() {
    const rows = [['Device', 'Host', 'Username', 'Password', 'Type', 'Source']];
    for (const c of sorted) {
      rows.push([c.device_name ?? '', c.host ?? '', c.username, c.password ?? '', c.type ?? '', c.source ?? '']);
    }
    const csv = rows.map(r => r.map(v => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'credentials.csv';
    a.click();
    setExportOpen(false);
  }

  function copyUserPass() {
    const text = sorted.map(c => `${c.username}:${c.password ?? ''}`).join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback('Copied!');
    setTimeout(() => setCopyFeedback(''), 1500);
    setExportOpen(false);
  }

  function copyPasswords() {
    const seen = new Set<string>();
    const text = sorted
      .map(c => c.password ?? '')
      .filter(p => p && !seen.has(p) && !!seen.add(p))
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopyFeedback('Copied!');
    setTimeout(() => setCopyFeedback(''), 1500);
    setExportOpen(false);
  }

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return null;
    return sortDir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />;
  }

  const sorted = useMemo(() => {
    if (!credentials || !sortCol) return credentials ?? [];
    return [...credentials].sort((a, b) => {
      const av = (a[sortCol] ?? '') as string;
      const bv = (b[sortCol] ?? '') as string;
      if (!av && bv) return 1;
      if (av && !bv) return -1;
      const cmp = av.localeCompare(bv, undefined, { sensitivity: 'base' });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [credentials, sortCol, sortDir]);

  if (isLoading) return <div className="loading">Loading...</div>;

  const base = `/p/${project.slug}`;
  const thStyle: React.CSSProperties = { cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' };

  return (
    <div>
      <div className="page-header">
        <h2>Credentials</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {copyFeedback && <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{copyFeedback}</span>}
          <div ref={exportRef} style={{ position: 'relative' }}>
            <button className="btn btn-secondary" onClick={() => setExportOpen(v => !v)}>Export ▾</button>
            {exportOpen && (
              <div style={{ position: 'absolute', right: 0, top: '100%', marginTop: 4, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 100, minWidth: 200 }}>
                <button className="dropdown-item" onClick={exportCsv}>Export CSV</button>
                <button className="dropdown-item" onClick={copyUserPass}>Copy username:password</button>
                <button className="dropdown-item" onClick={copyPasswords}>Copy passwords</button>
              </div>
            )}
          </div>
          <Link to={`${base}/credentials/new`} className="btn btn-primary">+ Add Credential</Link>
        </div>
      </div>

      {!credentials?.length ? (
        <div className="empty-state">No credentials yet. Add your first credential to get started.</div>
      ) : (
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c: CredentialWithDevice) => (
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
                  <td className="actions">
                    <Link to={`${base}/credentials/${c.id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={async () => { if (await confirm('Delete this credential?')) deleteMut.mutate(c.id); }}
                    >Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedCredential && (
        <FileDetailModal
          credential={selectedCredential}
          projectId={projectId}
          onClose={() => setSelectedCredential(null)}
        />
      )}
    </div>
  );
}
