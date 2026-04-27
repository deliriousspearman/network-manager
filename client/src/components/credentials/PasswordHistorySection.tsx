import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Download, X } from 'lucide-react';
import {
  fetchCredentialHistory,
  addCredentialHistoryEntry,
  deleteCredentialHistoryEntry,
  downloadCredentialHistoryFile,
} from '../../api/credentials';
import { queryKeys } from '../../api/queryKeys';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import type { CredentialPasswordHistoryEntry } from 'shared/types';

interface Props {
  projectId: number;
  credentialId: number;
}

export default function PasswordHistorySection({ projectId, credentialId }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newNote, setNewNote] = useState('');

  const { data: entries, isLoading } = useQuery({
    queryKey: queryKeys.credentials.history(projectId, credentialId),
    queryFn: () => fetchCredentialHistory(projectId, credentialId),
  });

  const addMut = useMutation({
    mutationFn: () => addCredentialHistoryEntry(projectId, credentialId, {
      password: newPassword.trim() || null,
      note: newNote.trim() || null,
      status: 'invalid',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials.history(projectId, credentialId) });
      setNewPassword('');
      setNewNote('');
      setShowAddForm(false);
    },
    onError: (err: Error) => toast(err.message || 'Failed to add entry', 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: (hid: number) => deleteCredentialHistoryEntry(projectId, credentialId, hid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.credentials.history(projectId, credentialId) });
    },
    onError: (err: Error) => toast(err.message || 'Failed to delete entry', 'error'),
  });

  const handleSaveNew = () => {
    if (!newPassword.trim() && !newNote.trim()) {
      toast('Enter a password or note', 'error');
      return;
    }
    addMut.mutate();
  };

  const handleDelete = async (entry: CredentialPasswordHistoryEntry) => {
    const ok = await confirm('Delete this history entry? This cannot be undone.', 'Delete History Entry');
    if (ok) deleteMut.mutate(entry.id);
  };

  const handleDownload = async (entry: CredentialPasswordHistoryEntry) => {
    if (!entry.file_name) return;
    try {
      await downloadCredentialHistoryFile(projectId, credentialId, entry.id, entry.file_name);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to download file', 'error');
    }
  };

  const count = entries?.length ?? 0;

  return (
    <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
          Password History {count > 0 && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}>({count})</span>}
        </h3>
        {!showAddForm && (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setShowAddForm(true)}
          >
            <Plus size={13} /> Add known-bad password
          </button>
        )}
      </div>

      {showAddForm && (
        <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.75rem', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Record a password that didn't work</strong>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              aria-label="Cancel"
              onClick={() => { setShowAddForm(false); setNewPassword(''); setNewNote(''); }}
            ><X size={12} /></button>
          </div>
          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem' }}>Password</label>
            <input
              type="text"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="The value that was tried"
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
          </div>
          <div className="form-group" style={{ marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.8rem' }}>Note (optional)</label>
            <input
              type="text"
              value={newNote}
              onChange={e => setNewNote(e.target.value)}
              placeholder="e.g. tried during incident response"
            />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={addMut.isPending}
              onClick={handleSaveNew}
            >{addMut.isPending ? 'Saving…' : 'Save'}</button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => { setShowAddForm(false); setNewPassword(''); setNewNote(''); }}
            >Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Loading…</div>
      ) : count === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
          No history yet. Past passwords are recorded automatically when this credential is updated.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {entries!.map(entry => (
            <div
              key={entry.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.5rem 0.75rem',
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '0.15rem 0.45rem',
                  borderRadius: '3px',
                  background: entry.status === 'invalid' ? 'var(--color-danger-bg, #fee)' : 'var(--color-bg-tertiary, #eee)',
                  color: entry.status === 'invalid' ? 'var(--color-danger, #b00)' : 'var(--color-text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {entry.status === 'invalid' ? 'Invalid' : 'Previous'}
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                {new Date(entry.created_at + 'Z').toLocaleString()}
              </span>
              <span style={{ flex: 1, minWidth: '120px' }}>
                {entry.has_file && entry.file_name ? (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleDownload(entry)}
                  >
                    <Download size={12} /> {entry.file_name}
                  </button>
                ) : entry.password ? (
                  <span style={{ fontFamily: 'monospace', fontSize: '0.85rem', overflowWrap: 'anywhere' }}>
                    {entry.password}
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>—</span>
                )}
              </span>
              {entry.note && (
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', flex: '1 1 200px' }}>
                  {entry.note}
                </span>
              )}
              <button
                type="button"
                className="btn btn-danger btn-sm"
                title="Delete entry"
                aria-label="Delete entry"
                onClick={() => handleDelete(entry)}
              ><Trash2 size={12} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
