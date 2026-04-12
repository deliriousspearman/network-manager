import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAgent, createAgent, updateAgent } from '../../api/agents';
import { fetchDevices } from '../../api/devices';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { useToast } from '../ui/Toast';
import LoadingSpinner from '../ui/LoadingSpinner';
import { RichToolbar } from '../ui/RichEditor';
import { AGENT_TYPES, AGENT_TYPE_LABELS, AGENT_STATUSES, AGENT_STATUS_LABELS } from 'shared/types';
import type { AgentType } from 'shared/types';
import { formErrorMessage } from '../../utils/formError';

export default function AgentForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const [name, setName] = useState('');
  const [agentType, setAgentType] = useState<AgentType>('wazuh');
  const [deviceId, setDeviceId] = useState<number | null>(null);
  const [checkinSchedule, setCheckinSchedule] = useState('');
  const [config, setConfig] = useState('');
  const [diskPath, setDiskPath] = useState('');
  const [status, setStatus] = useState('active');
  const [version, setVersion] = useState('');
  const [notes, setNotes] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const notesEditorRef = useRef<HTMLDivElement>(null);

  useUnsavedChanges(isDirty);

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', projectId],
    queryFn: () => fetchDevices(projectId),
  });

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agents', projectId, id],
    queryFn: () => fetchAgent(projectId, Number(id)),
    enabled: isEdit,
  });

  useEffect(() => {
    if (agent) {
      setName(agent.name);
      setAgentType(agent.agent_type);
      setDeviceId(agent.device_id);
      setCheckinSchedule(agent.checkin_schedule || '');
      setConfig(agent.config || '');
      setDiskPath(agent.disk_path || '');
      setStatus(agent.status || 'active');
      setVersion(agent.version || '');
      setNotes(agent.notes || '');
      setUpdatedAt(agent.updated_at);
    }
  }, [agent]);

  // Sync notes HTML into the contentEditable element when populated from the
  // server. The element is uncontrolled after that — user edits flow back via
  // the onInput handler below. We read from `agent.notes` directly because
  // this effect fires in the same tick as the setNotes() above, so the `notes`
  // state hasn't been applied yet.
  useEffect(() => {
    if (notesEditorRef.current && agent) {
      const html = agent.notes || '';
      if (notesEditorRef.current.innerHTML !== html) {
        notesEditorRef.current.innerHTML = html;
      }
    }
  }, [agent]);

  const mutation = useMutation({
    mutationFn: (data: any) => isEdit ? updateAgent(projectId, Number(id), data) : createAgent(projectId, data),
    onSuccess: (result) => {
      setIsDirty(false);
      queryClient.invalidateQueries({ queryKey: ['agents', projectId] });
      toast(isEdit ? 'Agent updated' : 'Agent created', 'success');
      navigate(`${base}/agents/${result.id}`);
    },
    onError: (err: any) => toast(err.message || 'Failed to save agent', 'error'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      name: name.trim(),
      agent_type: agentType,
      device_id: deviceId,
      checkin_schedule: checkinSchedule.trim() || undefined,
      config: config.trim() || undefined,
      disk_path: diskPath.trim() || undefined,
      status,
      version: version.trim() || undefined,
      notes: notes.trim() || undefined,
      ...(isEdit ? { updated_at: updatedAt } : {}),
    });
  };

  if (isEdit && isLoading) return <LoadingSpinner />;

  return (
    <div>
      <div className="page-header">
        <h2>{isEdit ? 'Edit Agent' : 'Add Agent'}</h2>
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)}>
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={200} placeholder="e.g. Wazuh Agent - Web Server" />
          </div>

          <div className="form-group">
            <label>Agent Type *</label>
            <select value={agentType} onChange={e => setAgentType(e.target.value as AgentType)}>
              {AGENT_TYPES.map(t => <option key={t} value={t}>{AGENT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Device</label>
            <select value={deviceId ?? ''} onChange={e => setDeviceId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">— No device —</option>
              {devices.map(d => <option key={d.id} value={d.id}>{d.name}{d.os ? ` (${d.os})` : ''}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)}>
              {AGENT_STATUSES.map(s => <option key={s} value={s}>{AGENT_STATUS_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="form-group">
            <label>Version</label>
            <input value={version} onChange={e => setVersion(e.target.value)} maxLength={100} placeholder="e.g. 4.7.2" />
          </div>

          <div className="form-group">
            <label>Check-in Schedule</label>
            <textarea value={checkinSchedule} onChange={e => setCheckinSchedule(e.target.value)} rows={3} maxLength={1000} placeholder="e.g. every 60s, */5 * * * *" />
          </div>

          <div className="form-group">
            <label>Disk Path</label>
            <input value={diskPath} onChange={e => setDiskPath(e.target.value)} maxLength={500} placeholder="e.g. /var/ossec" />
          </div>

          <div className="form-group">
            <label>Configuration</label>
            <textarea value={config} onChange={e => setConfig(e.target.value)} rows={6} maxLength={10000} placeholder="Paste agent configuration here..." style={{ fontFamily: 'monospace', fontSize: '0.85rem' }} />
          </div>

          <div className="form-group">
            <label>Notes</label>
            <RichToolbar editorRef={notesEditorRef} />
            <div
              ref={notesEditorRef}
              className="overview-rich-editor"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Optional notes"
              onInput={e => {
                setNotes((e.target as HTMLDivElement).innerHTML);
                setIsDirty(true);
              }}
            />
          </div>

          {mutation.isError && (
            <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginTop: '0.5rem' }}>
              {formErrorMessage(mutation.error)}
            </div>
          )}

          <div className="actions" style={{ marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Agent'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`${base}/agents`)}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
