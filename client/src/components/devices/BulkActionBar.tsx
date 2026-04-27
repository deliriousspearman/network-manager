import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, X, ChevronDown, Activity, Network, Server, Cpu, Tag } from 'lucide-react';
import { bulkUpdateDevices, bulkDeleteDevices } from '../../api/devices';
import { undoMany } from '../../api/undo';
import { fetchSubnets } from '../../api/subnets';
import { fetchHypervisors } from '../../api/devices';
import { queryKeys } from '../../api/queryKeys';
import { useToast } from '../ui/Toast';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import type { DeviceWithIps } from 'shared/types';

interface Props {
  projectId: number;
  selectedIds: Set<number>;
  selectedItems: DeviceWithIps[];
  onClose: () => void;
  onClear: () => void;
}

const STATUS_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'warning', label: 'Warning' },
  { value: 'unknown', label: 'Unknown' },
  { value: null, label: 'No status' },
];

const HOSTING_OPTIONS: Array<{ value: string | null; label: string }> = [
  { value: 'baremetal', label: 'Baremetal' },
  { value: 'vm', label: 'VM' },
  { value: 'hypervisor', label: 'Hypervisor' },
  { value: null, label: 'None' },
];

export default function BulkActionBar({ projectId, selectedIds, selectedItems, onClose, onClear }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirmDialog();
  const ids = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const count = ids.length;

  const [statusOpen, setStatusOpen] = useState(false);
  const [hostingOpen, setHostingOpen] = useState(false);
  const [subnetOpen, setSubnetOpen] = useState(false);
  const [hypervisorOpen, setHypervisorOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);

  const statusRef = useRef<HTMLDivElement>(null);
  const hostingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (statusRef.current && !statusRef.current.contains(e.target as Node)) setStatusOpen(false);
      if (hostingRef.current && !hostingRef.current.contains(e.target as Node)) setHostingOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const bulkMutation = useMutation({
    mutationFn: (body: Parameters<typeof bulkUpdateDevices>[1]) => bulkUpdateDevices(projectId, body),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
      if (data.skipped.length > 0) {
        toast(`Updated ${data.updated}, skipped ${data.skipped.length} (would create cycle)`, 'info');
      } else {
        toast(`Updated ${data.updated} ${data.updated === 1 ? 'device' : 'devices'}`, 'success');
      }
      onClear();
    },
    onError: (err: Error) => toast(err.message || 'Failed to update devices', 'error'),
  });

  async function applyStatus(value: string | null) {
    setStatusOpen(false);
    const label = value ? STATUS_OPTIONS.find(o => o.value === value)?.label ?? value : 'No status';
    const ok = await confirm(`Set status to "${label}" on ${count} ${count === 1 ? 'device' : 'devices'}?`, 'Bulk update status');
    if (!ok) return;
    bulkMutation.mutate({ ids, updates: { status: value } });
  }

  async function applyHosting(value: string | null) {
    setHostingOpen(false);
    const label = value ? HOSTING_OPTIONS.find(o => o.value === value)?.label ?? value : 'None';
    const ok = await confirm(`Set hosting to "${label}" on ${count} ${count === 1 ? 'device' : 'devices'}?`, 'Bulk update hosting');
    if (!ok) return;
    bulkMutation.mutate({ ids, updates: { hosting_type: value } });
  }

  async function handleBulkDelete() {
    const ok = await confirm(
      `Delete ${count} ${count === 1 ? 'device' : 'devices'}? They can be restored from Trash or with Ctrl+Z.`,
      'Delete Selected Devices',
    );
    if (!ok) return;
    try {
      const { deleted, failed } = await bulkDeleteDevices(projectId, ids);
      queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
      queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
      queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
      if (deleted.length > 0) {
        toast(
          `Deleted ${deleted.length} ${deleted.length === 1 ? 'device' : 'devices'}`,
          'success',
          {
            label: 'Undo all',
            onClick: async () => {
              const { restored } = await undoMany(projectId, deleted.length);
              queryClient.invalidateQueries({ queryKey: queryKeys.devices.all(projectId) });
              queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
              queryClient.invalidateQueries({ queryKey: ['trash', projectId] });
              toast(`Restored ${restored} ${restored === 1 ? 'device' : 'devices'}`, 'success');
            },
          }
        );
      }
      if (failed.length > 0) {
        toast(`Failed to delete ${failed.length} ${failed.length === 1 ? 'device' : 'devices'}`, 'error');
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete devices', 'error');
    }
    onClear();
  }

  return (
    <div className="bulk-action-bar">
      <span className="bulk-action-count">{count} selected</span>

      <div ref={statusRef} className="bulk-action-menu-wrap">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setStatusOpen(o => !o)}
          disabled={bulkMutation.isPending}
        >
          <Activity size={13} /> Status <ChevronDown size={12} />
        </button>
        {statusOpen && (
          <div className="context-menu" style={{ right: 'auto', left: 0, top: 'calc(100% + 4px)' }}>
            <div className="context-menu-items">
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className="context-menu-item"
                  onClick={() => applyStatus(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setSubnetOpen(true)}
        disabled={bulkMutation.isPending}
      >
        <Network size={13} /> Subnet
      </button>

      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setHypervisorOpen(true)}
        disabled={bulkMutation.isPending}
      >
        <Cpu size={13} /> Hypervisor
      </button>

      <div ref={hostingRef} className="bulk-action-menu-wrap">
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setHostingOpen(o => !o)}
          disabled={bulkMutation.isPending}
        >
          <Server size={13} /> Hosting <ChevronDown size={12} />
        </button>
        {hostingOpen && (
          <div className="context-menu" style={{ right: 'auto', left: 0, top: 'calc(100% + 4px)' }}>
            <div className="context-menu-items">
              {HOSTING_OPTIONS.map(opt => (
                <button
                  key={opt.label}
                  className="context-menu-item"
                  onClick={() => applyHosting(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setTagsOpen(true)}
        disabled={bulkMutation.isPending}
      >
        <Tag size={13} /> Tags
      </button>

      <div className="bulk-action-spacer" />

      <button className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={bulkMutation.isPending}>
        <Trash2 size={13} /> Delete
      </button>

      <button className="btn btn-secondary btn-sm" onClick={onClose} title="Exit select mode">
        <X size={13} /> Done
      </button>

      {subnetOpen && (
        <SubnetModal
          projectId={projectId}
          count={count}
          onClose={() => setSubnetOpen(false)}
          onSubmit={subnet_id => {
            setSubnetOpen(false);
            bulkMutation.mutate({ ids, updates: { subnet_id } });
          }}
          pending={bulkMutation.isPending}
        />
      )}

      {hypervisorOpen && (
        <HypervisorModal
          projectId={projectId}
          count={count}
          onClose={() => setHypervisorOpen(false)}
          onSubmit={hypervisor_id => {
            setHypervisorOpen(false);
            bulkMutation.mutate({ ids, updates: { hypervisor_id } });
          }}
          pending={bulkMutation.isPending}
        />
      )}

      {tagsOpen && (
        <TagsModal
          count={count}
          selectedItems={selectedItems}
          onClose={() => setTagsOpen(false)}
          onSubmit={(addTags, removeTags) => {
            setTagsOpen(false);
            bulkMutation.mutate({ ids, addTags, removeTags });
          }}
          pending={bulkMutation.isPending}
        />
      )}
    </div>
  );
}

interface SubnetModalProps {
  projectId: number;
  count: number;
  onClose: () => void;
  onSubmit: (subnet_id: number | null) => void;
  pending: boolean;
}

function SubnetModal({ projectId, count, onClose, onSubmit, pending }: SubnetModalProps) {
  const { data: subnets = [] } = useQuery({ queryKey: queryKeys.subnets.all(projectId), queryFn: () => fetchSubnets(projectId) });
  const [value, setValue] = useState<string>('');

  return (
    <Modal open onClose={onClose} title={`Change subnet for ${count} ${count === 1 ? 'device' : 'devices'}`}>
      <div className="bulk-modal-body">
        <label className="bulk-modal-label">Subnet</label>
        <select
          className="bulk-modal-select"
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
        >
          <option value="">(None)</option>
          {subnets.map(s => (
            <option key={s.id} value={s.id}>{s.name} ({s.cidr})</option>
          ))}
        </select>
      </div>
      <div className="bulk-modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={() => onSubmit(value ? Number(value) : null)}
          disabled={pending}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

interface HypervisorModalProps {
  projectId: number;
  count: number;
  onClose: () => void;
  onSubmit: (hypervisor_id: number | null) => void;
  pending: boolean;
}

function HypervisorModal({ projectId, count, onClose, onSubmit, pending }: HypervisorModalProps) {
  const { data: hypervisors = [] } = useQuery({ queryKey: ['hypervisors', projectId], queryFn: () => fetchHypervisors(projectId) });
  const [value, setValue] = useState<string>('');

  return (
    <Modal open onClose={onClose} title={`Change hypervisor for ${count} ${count === 1 ? 'device' : 'devices'}`}>
      <div className="bulk-modal-body">
        <label className="bulk-modal-label">Hypervisor</label>
        <select
          className="bulk-modal-select"
          value={value}
          onChange={e => setValue(e.target.value)}
          autoFocus
        >
          <option value="">(None)</option>
          {hypervisors.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
        {hypervisors.length === 0 && (
          <p className="bulk-modal-hint">No hypervisors exist in this project yet. Set a device's hosting type to "Hypervisor" first.</p>
        )}
      </div>
      <div className="bulk-modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
        <button
          className="btn btn-primary"
          onClick={() => onSubmit(value ? Number(value) : null)}
          disabled={pending}
        >
          Apply
        </button>
      </div>
    </Modal>
  );
}

interface TagsModalProps {
  count: number;
  selectedItems: DeviceWithIps[];
  onClose: () => void;
  onSubmit: (addTags: string[], removeTags: string[]) => void;
  pending: boolean;
}

function TagsModal({ count, selectedItems, onClose, onSubmit, pending }: TagsModalProps) {
  const [addInput, setAddInput] = useState('');
  const [removeSelected, setRemoveSelected] = useState<Set<string>>(new Set());

  const existingTags = useMemo(() => {
    const set = new Set<string>();
    for (const d of selectedItems) {
      for (const t of d.tags ?? []) set.add(t);
    }
    return Array.from(set).sort();
  }, [selectedItems]);

  function toggleRemove(tag: string) {
    setRemoveSelected(prev => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  function handleApply() {
    const addTags = addInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    const removeTags = Array.from(removeSelected);
    if (addTags.length === 0 && removeTags.length === 0) {
      onClose();
      return;
    }
    onSubmit(addTags, removeTags);
  }

  return (
    <Modal open onClose={onClose} title={`Edit tags on ${count} ${count === 1 ? 'device' : 'devices'}`}>
      <div className="bulk-modal-body">
        <label className="bulk-modal-label">Add tags (comma-separated)</label>
        <input
          className="bulk-modal-input"
          type="text"
          value={addInput}
          onChange={e => setAddInput(e.target.value)}
          placeholder="e.g. production, monitored"
          autoFocus
        />

        <label className="bulk-modal-label" style={{ marginTop: '1rem' }}>Remove tags</label>
        {existingTags.length === 0 ? (
          <p className="bulk-modal-hint">No existing tags on the selected devices.</p>
        ) : (
          <div className="bulk-modal-tag-list">
            {existingTags.map(tag => (
              <label key={tag} className="bulk-modal-tag-item">
                <input
                  type="checkbox"
                  checked={removeSelected.has(tag)}
                  onChange={() => toggleRemove(tag)}
                />
                <span className="badge">{tag}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div className="bulk-modal-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={pending}>Cancel</button>
        <button className="btn btn-primary" onClick={handleApply} disabled={pending}>Apply</button>
      </div>
    </Modal>
  );
}
