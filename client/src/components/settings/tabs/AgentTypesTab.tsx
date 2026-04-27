import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { useConfirmDialog } from '../../ui/ConfirmDialog';
import { useToast } from '../../ui/Toast';
import Modal from '../../ui/Modal';
import {
  fetchAgentTypes, createAgentType, updateAgentType, deleteAgentType,
  agentTypeIconUrl, AgentTypeInUseError,
} from '../../../api/agentTypes';
import { useProject } from '../../../contexts/ProjectContext';
import { DEFAULT_AGENT_ICONS } from '../../../assets/agent-icons';
import type { AgentType } from 'shared/types';
import AgentIconPicker, { type AgentIconValue } from '../AgentIconPicker';

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function iconSrcFor(t: AgentType, projectId: number): string {
  if (t.icon_source === 'upload' && t.has_upload) return `${agentTypeIconUrl(projectId, t.id)}?v=${t.updated_at}`;
  if (t.icon_source === 'builtin' && t.icon_builtin_key) return DEFAULT_AGENT_ICONS[t.icon_builtin_key] || DEFAULT_AGENT_ICONS.custom;
  return DEFAULT_AGENT_ICONS.custom;
}

export default function AgentTypesTab() {
  const { projectId } = useProject();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<AgentType | 'new' | null>(null);

  const { data: types = [] } = useQuery({
    queryKey: ['agent-types', projectId],
    queryFn: () => fetchAgentTypes(projectId),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAgentType(projectId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types', projectId] });
      queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
      toast('Agent type deleted', 'success');
    },
    onError: (err: Error) => {
      if (err instanceof AgentTypeInUseError) toast(err.message, 'error');
      else toast(err.message || 'Failed to delete agent type', 'error');
    },
  });

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3 className="card-header-title">Agent Types</h3>
          <div className="card-header-subtitle">
            Define the agent types your project uses. Each type has a label, a stable key (used when saving agents), and an icon — choose one from the gallery or upload your own.
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>
          <Plus size={14} /> Add agent type
        </button>
      </div>

      {types.length === 0 ? (
        <div className="empty-state">
          No agent types defined yet. Click <strong>Add agent type</strong> to create one.
        </div>
      ) : (
        <div className="settings-icon-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
          {types.map(t => (
            <div key={t.id} className="settings-icon-card">
              <img src={iconSrcFor(t, projectId)} alt={t.label} className="settings-icon-preview" draggable={false} />
              <div className="settings-icon-label" style={{ fontWeight: 500 }}>{t.label}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace' }}>{t.key}</div>
              <div className="settings-icon-actions">
                <button className="btn btn-sm" onClick={() => setEditing(t)} title="Edit">
                  <Pencil size={12} />
                </button>
                <button
                  className="btn btn-sm btn-danger"
                  disabled={deleteMut.isPending}
                  onClick={async () => {
                    if (await confirm(`Delete agent type "${t.label}"?`, 'Delete agent type')) {
                      deleteMut.mutate(t.id);
                    }
                  }}
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <AgentTypeEditor
          existing={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          projectId={projectId}
        />
      )}
    </div>
  );
}

interface EditorProps {
  existing: AgentType | null;
  onClose: () => void;
  projectId: number;
}

function AgentTypeEditor({ existing, onClose, projectId }: EditorProps) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const [label, setLabel] = useState(existing?.label ?? '');
  const [key, setKey] = useState(existing?.key ?? '');
  const [keyTouched, setKeyTouched] = useState(false);
  const [icon, setIcon] = useState<AgentIconValue>(() => {
    if (existing?.icon_source === 'upload' && existing.has_upload) {
      return {
        icon_source: 'upload',
        filename: existing.filename ?? 'icon',
        mime_type: existing.mime_type ?? 'image/png',
        data: '',
        previewUrl: `${agentTypeIconUrl(projectId, existing.id)}?v=${existing.updated_at}`,
      };
    }
    return {
      icon_source: 'builtin',
      icon_builtin_key: existing?.icon_builtin_key ?? 'custom',
    };
  });

  const isEdit = !!existing;

  const saveMut = useMutation({
    mutationFn: async () => {
      const trimmedLabel = label.trim();
      if (!trimmedLabel) throw new Error('Label is required');

      if (isEdit) {
        const body: Parameters<typeof updateAgentType>[2] = { label: trimmedLabel };
        if (icon.icon_source === 'builtin') {
          body.icon_source = 'builtin';
          body.icon_builtin_key = icon.icon_builtin_key;
        } else if (icon.data) {
          // Only send upload payload when user picked a new file (data populated).
          body.icon_source = 'upload';
          body.filename = icon.filename;
          body.mime_type = icon.mime_type;
          body.data = icon.data;
        }
        return updateAgentType(projectId, existing!.id, body);
      } else {
        const body: Parameters<typeof createAgentType>[1] = {
          label: trimmedLabel,
          key: key.trim() || undefined,
          icon_source: icon.icon_source,
        };
        if (icon.icon_source === 'builtin') {
          body.icon_builtin_key = icon.icon_builtin_key;
        } else {
          if (!icon.data) throw new Error('Please choose an image to upload');
          body.filename = icon.filename;
          body.mime_type = icon.mime_type;
          body.data = icon.data;
        }
        return createAgentType(projectId, body);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-types', projectId] });
      queryClient.invalidateQueries({ queryKey: ['diagram', projectId] });
      toast(isEdit ? 'Agent type updated' : 'Agent type created', 'success');
      onClose();
    },
    onError: (err: Error) => toast(err.message || 'Save failed', 'error'),
  });

  const effectiveKey = isEdit ? existing!.key : (keyTouched ? key : slugify(label));

  return (
    <Modal
      onClose={onClose}
      style={{ minWidth: 480, maxWidth: 640 }}
      title={isEdit ? 'Edit Agent Type' : 'Add Agent Type'}
    >
      <div className="form-group">
        <label>Label *</label>
        <input
          value={label}
          onChange={e => setLabel(e.target.value)}
          maxLength={100}
          placeholder="e.g. Wazuh"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label>Key</label>
        <input
          value={effectiveKey}
          onChange={e => { setKey(e.target.value); setKeyTouched(true); }}
          maxLength={60}
          placeholder="auto-generated from label"
          disabled={isEdit}
          style={{ fontFamily: 'monospace' }}
        />
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
          {isEdit ? 'Key is fixed after creation.' : 'Stable identifier stored on each agent. Auto-generated from the label if left blank.'}
        </div>
      </div>

      <div className="form-group">
        <label>Icon</label>
        <AgentIconPicker value={icon} onChange={setIcon} />
      </div>

      <div className="actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
        <button className="btn btn-secondary" onClick={onClose} disabled={saveMut.isPending}>Cancel</button>
        <button className="btn btn-primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
        </button>
      </div>
    </Modal>
  );
}
