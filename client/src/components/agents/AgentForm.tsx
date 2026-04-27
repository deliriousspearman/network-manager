import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAgent, createAgent, updateAgent } from '../../api/agents';
import { fetchAgentTypes } from '../../api/agentTypes';
import { queryKeys } from '../../api/queryKeys';
import DevicePicker from '../ui/DevicePicker';
import { useProject } from '../../contexts/ProjectContext';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { onCmdEnterSubmit } from '../../hooks/useCmdEnterSubmit';
import { useToast } from '../ui/Toast';
import LoadingSpinner from '../ui/LoadingSpinner';
import { RichToolbar } from '../ui/RichEditor';
import { AGENT_STATUSES, AGENT_STATUS_LABELS } from 'shared/types';
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
  const [agentType, setAgentType] = useState<string>('');
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

  const { data: agentTypes = [] } = useQuery({
    queryKey: ['agent-types', projectId],
    queryFn: () => fetchAgentTypes(projectId),
  });

  const { data: agent, isLoading } = useQuery({
    queryKey: queryKeys.agents.detail(projectId, Number(id)),
    queryFn: () => fetchAgent(projectId, Number(id)),
    enabled: isEdit,
  });

  // Default the select to the first available type when creating, so the form is
  // valid the moment the user opens it (when there's at least one type defined).
  useEffect(() => {
    if (!isEdit && !agentType && agentTypes.length > 0) {
      setAgentType(agentTypes[0].key);
    }
  }, [isEdit, agentType, agentTypes]);

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
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.all(projectId) });
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

      <div className="card">
        <form onSubmit={handleSubmit} onKeyDown={onCmdEnterSubmit} onChange={() => setIsDirty(true)}>
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required maxLength={200} placeholder="e.g. Wazuh Agent - Web Server" />
          </div>

          <div className="form-group">
            <label>Agent Type *</label>
            {agentTypes.length === 0 ? (
              <div className="form-help">
                No agent types defined yet.{' '}
                <Link to={`${base}/settings#agent-types`}>Add one in Settings → Agent Types</Link>.
              </div>
            ) : (
              <select value={agentType} onChange={e => setAgentType(e.target.value)} disabled={agentTypes.length === 0}>
                {agentTypes.map(t => <option key={t.id} value={t.key}>{t.label}</option>)}
              </select>
            )}
          </div>

          <div className="form-group">
            <label>Device</label>
            <DevicePicker
              value={deviceId}
              onChange={(id) => { setDeviceId(id); setIsDirty(true); }}
              placeholder="— No device —"
            />
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
            <textarea className="agent-config-input" value={config} onChange={e => setConfig(e.target.value)} rows={6} maxLength={10000} placeholder="Paste agent configuration here..." />
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
            <div className="form-error">
              {formErrorMessage(mutation.error)}
            </div>
          )}

          <div className="actions actions-spaced">
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending || !agentType}>
              {mutation.isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Agent'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(`${base}/agents`)}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
