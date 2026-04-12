import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import DOMPurify from 'dompurify';
import { fetchAgent, deleteAgent } from '../../api/agents';
import { useProject } from '../../contexts/ProjectContext';
import { useConfirmDialog } from '../ui/ConfirmDialog';
import { useToast } from '../ui/Toast';
import { AGENT_TYPE_LABELS, AGENT_STATUS_LABELS } from 'shared/types';
import type { AgentStatus } from 'shared/types';
import LoadingSpinner from '../ui/LoadingSpinner';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export default function AgentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const confirm = useConfirmDialog();
  const toast = useToast();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;

  const { data: agent, isLoading } = useQuery({
    queryKey: ['agents', projectId, id],
    queryFn: () => fetchAgent(projectId, Number(id)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteAgent(projectId, Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agents', projectId] });
      toast('Agent deleted', 'success');
      navigate(`${base}/agents`);
    },
    onError: () => toast('Failed to delete agent', 'error'),
  });

  const handleDelete = async () => {
    if (await confirm(`Delete agent "${agent?.name}"? This cannot be undone.`)) {
      deleteMut.mutate();
    }
  };

  const [copied, setCopied] = useState(false);
  const copyPath = () => {
    if (agent?.disk_path) {
      navigator.clipboard.writeText(agent.disk_path);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) return <LoadingSpinner />;
  if (!agent) return <div className="empty-state">Agent not found.</div>;

  return (
    <div>
      <div className="page-header">
        <h2>{agent.name}</h2>
        <div className="flex items-center gap-2">
          <Link to={`${base}/agents/${agent.id}/edit`} className="btn btn-secondary">Edit</Link>
          <button className="btn btn-danger" onClick={handleDelete} disabled={deleteMut.isPending}>Delete</button>
        </div>
      </div>

      <div className="card" style={{ padding: '1.25rem' }}>
        <div className="detail-grid">
          <div className="detail-item">
            <label>Type</label>
            <p><span className={`badge badge-agent-${agent.agent_type}`}>{AGENT_TYPE_LABELS[agent.agent_type] || agent.agent_type}</span></p>
          </div>
          <div className="detail-item">
            <label>Status</label>
            <p><span className={`badge badge-agent-status-${agent.status || 'unknown'}`}>{AGENT_STATUS_LABELS[(agent.status || 'unknown') as AgentStatus]}</span></p>
          </div>
          <div className="detail-item">
            <label>Device</label>
            <p>{agent.device_name ? <Link to={`${base}/devices/${agent.device_id}`}>{agent.device_name}</Link> : '—'}</p>
          </div>
          <div className="detail-item">
            <label>Device OS</label>
            <p>{agent.device_os || '—'}</p>
          </div>
          <div className="detail-item">
            <label>Check-in Schedule</label>
            <p style={{ whiteSpace: 'pre-wrap' }}>{agent.checkin_schedule || '—'}</p>
          </div>
          <div className="detail-item">
            <label>Version</label>
            <p>{agent.version || '—'}</p>
          </div>
          <div className="detail-item">
            <label>Disk Path</label>
            <p>
              {agent.disk_path ? (
                <span className="agent-disk-path-detail">
                  <code>{agent.disk_path}</code>
                  <button className="agent-copy-btn" onClick={copyPath} title="Copy path">
                    {copied ? <Check size={13} /> : <Copy size={13} />}
                  </button>
                </span>
              ) : '—'}
            </p>
          </div>
        </div>

        {agent.notes && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Notes</label>
            {agent.notes.includes('<') ? (
              <div
                className="overview-rich-content"
                style={{ marginTop: '0.25rem' }}
                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(agent.notes) }}
              />
            ) : (
              <p style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>{agent.notes}</p>
            )}
          </div>
        )}

        {agent.config && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Configuration</label>
            <pre className="agent-config-block">{agent.config}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
