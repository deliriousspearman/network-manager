import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Undo2, X } from 'lucide-react';
import { fetchTrash, purgeTrashEntry, emptyTrash } from '../../api/trash';
import { undoActivity } from '../../api/activityLogs';
import { fetchSettings } from '../../api/settings';
import { queryKeys } from '../../api/queryKeys';
import { useProject } from '../../contexts/ProjectContext';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';

const TYPE_LABELS: Record<string, string> = {
  device: 'Devices',
  subnet: 'Subnets',
  credential: 'Credentials',
  agent: 'Agents',
  connection: 'Connections',
  timeline_entry: 'Timeline entries',
  annotation: 'Annotations',
  agent_annotation: 'Agent annotations',
};

function formatTimestamp(ts: string, timezone: string): string {
  const date = new Date(ts + 'Z');
  return date.toLocaleString(undefined, { timeZone: timezone });
}

export default function TrashPage() {
  const { projectId } = useProject();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const [filterType, setFilterType] = useState<string>('');

  const { data, isLoading } = useQuery({
    queryKey: ['trash', projectId, filterType],
    queryFn: () => fetchTrash(projectId, filterType || undefined),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    staleTime: 60_000,
  });
  const timezone = settings?.timezone ?? 'UTC';

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.subnets.all(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.credentials.all(projectId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) });
    queryClient.invalidateQueries({ queryKey: ['timeline', projectId] });
    queryClient.invalidateQueries({ queryKey: ['activity-logs', projectId] });
    queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
  };

  const restoreMutation = useMutation({
    mutationFn: (logId: number) => undoActivity(projectId, logId),
    onSuccess: () => { invalidateAll(); toast('Restored', 'success'); },
    onError: (err: Error) => toast(err.message || 'Failed to restore', 'error'),
  });

  const purgeMutation = useMutation({
    mutationFn: (logId: number) => purgeTrashEntry(projectId, logId),
    onSuccess: () => { invalidateAll(); toast('Entry purged', 'success'); },
    onError: (err: Error) => toast(err.message || 'Failed to purge', 'error'),
  });

  const emptyMutation = useMutation({
    mutationFn: () => emptyTrash(projectId),
    onSuccess: () => { invalidateAll(); toast('Trash emptied', 'success'); },
    onError: (err: Error) => toast(err.message || 'Failed to empty trash', 'error'),
  });

  if (isLoading && !data) return <LoadingSpinner />;

  const items = data?.items ?? [];
  const counts = data?.counts ?? [];
  const totalByType = counts.reduce((sum, c) => sum + c.count, 0);

  const handleEmpty = async () => {
    if (!items.length) return;
    const ok = await confirm(
      `Permanently purge ${totalByType} trash ${totalByType === 1 ? 'entry' : 'entries'}? This cannot be undone.`,
      'Empty trash',
    );
    if (!ok) return;
    emptyMutation.mutate();
  };

  const handlePurge = async (logId: number, name: string | null) => {
    const ok = await confirm(
      `Permanently purge "${name ?? 'entry'}" from trash? This cannot be undone.`,
      'Purge entry',
    );
    if (!ok) return;
    purgeMutation.mutate(logId);
  };

  return (
    <div>
      <div className="page-header">
        <h2>Trash</h2>
        <div className="page-header-actions">
          <select value={filterType} onChange={e => setFilterType(e.target.value)} className="list-filter-select">
            <option value="">All ({totalByType})</option>
            {counts.map(c => (
              <option key={c.resource_type} value={c.resource_type}>
                {TYPE_LABELS[c.resource_type] ?? c.resource_type} ({c.count})
              </option>
            ))}
          </select>
          <button
            className="btn btn-danger"
            onClick={handleEmpty}
            disabled={!items.length || emptyMutation.isPending}
            title="Permanently purge everything in trash"
          >
            <Trash2 size={14} /> Empty trash
          </button>
        </div>
      </div>

      <p className="text-sm text-secondary mb-3">
        Deleted devices, subnets, credentials, agents, and timeline entries can be restored from here.
        Purging an entry removes its recovery snapshot permanently.
      </p>

      {items.length === 0 ? (
        <EmptyState
          icon={<Trash2 size={28} />}
          title="Trash is empty"
          description="Deleted items that can be restored will appear here."
        />
      ) : (
        <div className="card table-container">
          <table>
            <thead>
              <tr>
                <th>Deleted at</th>
                <th>Type</th>
                <th>Name</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td style={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {formatTimestamp(item.created_at, timezone)}
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--color-border)', color: 'var(--color-text)' }}>
                      {TYPE_LABELS[item.resource_type] ?? item.resource_type}
                    </span>
                  </td>
                  <td style={{ fontWeight: 500 }}>{item.resource_name ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => restoreMutation.mutate(item.id)}
                        disabled={restoreMutation.isPending}
                        title="Restore"
                      >
                        <Undo2 size={12} /> Restore
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handlePurge(item.id, item.resource_name)}
                        disabled={purgeMutation.isPending}
                        title="Purge permanently"
                      >
                        <X size={12} /> Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
