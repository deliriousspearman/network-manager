import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ColourPicker } from '../ui/ColourPicker';
import { AGENT_STATUSES, AGENT_STATUS_LABELS, type AgentStatus, type AgentWithDevice, type AgentConnection, type LabelPlacementV, type LabelPlacementH } from 'shared/types';
import { useProject } from '../../contexts/ProjectContext';
import { fetchActivityLogsPaged } from '../../api/activityLogs';
import { fetchOutputsForDevice } from '../../api/commandOutputs';

function statusBadgeClass(status: string): string {
  return `badge-agent-status-${status}`;
}

const LINE_STYLE_OPTIONS = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

const EDGE_WIDTH_OPTIONS = [
  { value: '1', label: 'Hairline' },
  { value: '2', label: 'Normal' },
  { value: '3', label: 'Medium' },
  { value: '4', label: 'Thick' },
  { value: '6', label: 'Heavy' },
];

export interface AgentEdgeData {
  connection: AgentConnection;
  sourceName: string;
  targetName: string;
}

export type AgentSelected =
  | { type: 'agent'; agent: AgentWithDevice }
  | { type: 'edge'; data: AgentEdgeData }
  | {
      type: 'image';
      imageId: number;
      label: string | null;
      labelPlacementV: LabelPlacementV;
      labelPlacementH: LabelPlacementH;
    };

export type AgentImagePatch = Partial<{
  label: string;
  label_placement_v: LabelPlacementV;
  label_placement_h: LabelPlacementH;
}>;

export type AgentEdgePatch = Partial<{
  label: string | null;
  edge_color: string | null;
  edge_width: number | null;
  label_color: string | null;
  label_bg_color: string | null;
  source_port: string | null;
  target_port: string | null;
  /** dash pattern: 'solid' | 'dashed' | 'dotted' */
  dashKey: string;
}>;

interface Props {
  selected: AgentSelected;
  onClose: () => void;
  projectBase: string;
  locked?: boolean;
  onEdgeUpdate?: (patch: AgentEdgePatch) => void;
  onDeleteEdge?: (connectionId: number) => void;
  onAgentStatusChange?: (agentId: number, status: AgentStatus) => void;
  onImageUpdate?: (imageId: number, patch: AgentImagePatch) => void;
}

function AgentDetails({ agent, projectBase, locked, onAgentStatusChange }: {
  agent: AgentWithDevice;
  projectBase: string;
  locked: boolean;
  onAgentStatusChange?: (agentId: number, status: AgentStatus) => void;
}) {
  return (
    <>
      <div className="props-section props-status-row">
        <span className={`badge badge-agent-${agent.agent_type}`}>{agent.agent_type}</span>
        {agent.status && (
          <span className={`badge ${statusBadgeClass(agent.status)}`}>
            <span className={`status-dot status-dot-agent-${agent.status}`} aria-hidden="true" />
            {agent.status}
          </span>
        )}
      </div>

      <div className="props-section">
        <div className="props-label">Status</div>
        <select
          value={agent.status ?? 'unknown'}
          onChange={e => onAgentStatusChange?.(agent.id, e.target.value as AgentStatus)}
          disabled={locked || !onAgentStatusChange}
        >
          {AGENT_STATUSES.map(s => (
            <option key={s} value={s}>{AGENT_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      {agent.device_id != null && agent.device_name && (
        <div className="props-section">
          <div className="props-label">Linked Device</div>
          <Link
            to={`${projectBase}/devices/${agent.device_id}`}
            className="btn btn-outline props-link-btn"
          >
            <span className="props-link-btn-label">{agent.device_name}</span>
            <ExternalLink size={14} />
          </Link>
        </div>
      )}

      {agent.version && (
        <div className="props-section">
          <div className="props-label">Version</div>
          <div>{agent.version}</div>
        </div>
      )}

      {agent.checkin_schedule && (
        <div className="props-section">
          <div className="props-label">Check-in</div>
          <div className="props-notes">{agent.checkin_schedule}</div>
        </div>
      )}

      {agent.disk_path && (
        <div className="props-section">
          <div className="props-label">Disk Path</div>
          <div className="props-mono">{agent.disk_path}</div>
        </div>
      )}

      {agent.notes && (
        <div className="props-section">
          <div className="props-label">Notes</div>
          <div className="props-notes">{agent.notes}</div>
        </div>
      )}

      <AgentActivitySection agent={agent} projectBase={projectBase} />

      {agent.device_id != null && (
        <AgentRecentCommandsSection deviceId={agent.device_id} projectBase={projectBase} />
      )}
    </>
  );
}

function AgentActivitySection({ agent, projectBase }: { agent: AgentWithDevice; projectBase: string }) {
  const { projectId } = useProject();
  const { data, isLoading } = useQuery({
    queryKey: ['agent-activity', projectId, agent.id],
    queryFn: () => fetchActivityLogsPaged(projectId, {
      resource_type: 'agent',
      resource_id: agent.id,
      limit: 5,
    }),
  });
  const items = data?.items ?? [];

  return (
    <div className="props-section">
      <div className="props-label">Activity</div>
      {isLoading ? (
        <div className="props-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="props-muted">No recent activity.</div>
      ) : (
        <ul className="props-section-list">
          {items.map(log => (
            <li key={log.id}>
              <span className="props-section-list-main">{log.action}</span>
              <span className="props-section-list-meta">{new Date(log.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to={`${projectBase}/logs?resource_type=agent`} className="props-section-list-link">
        View all logs
      </Link>
    </div>
  );
}

function AgentRecentCommandsSection({ deviceId, projectBase }: { deviceId: number; projectBase: string }) {
  const { projectId } = useProject();
  const { data, isLoading } = useQuery({
    queryKey: ['agent-device-commands', projectId, deviceId],
    queryFn: () => fetchOutputsForDevice(projectId, deviceId),
  });
  const items = (data ?? []).slice(0, 5);

  return (
    <div className="props-section">
      <div className="props-label">Recent Commands</div>
      {isLoading ? (
        <div className="props-muted">Loading…</div>
      ) : items.length === 0 ? (
        <div className="props-muted">No command captures yet.</div>
      ) : (
        <ul className="props-section-list">
          {items.map(o => (
            <li key={o.id}>
              <span className="props-section-list-main">{o.title || o.command_type}</span>
              <span className="props-section-list-meta">{new Date(o.captured_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      <Link to={`${projectBase}/devices/${deviceId}?tab=commands`} className="props-section-list-link">
        View all commands
      </Link>
    </div>
  );
}

function EdgeDetails({ data, locked, onEdgeUpdate, onDeleteEdge }: {
  data: AgentEdgeData;
  locked: boolean;
  onEdgeUpdate?: (patch: AgentEdgePatch) => void;
  onDeleteEdge?: (connectionId: number) => void;
}) {
  const conn = data.connection;
  const initialDash = (conn.connection_type || 'link').split(':')[1] || 'solid';

  // Local debounced state for text inputs
  const [label, setLabel] = useState(conn.label ?? '');
  const [sourcePort, setSourcePort] = useState(conn.source_port ?? '');
  const [targetPort, setTargetPort] = useState(conn.target_port ?? '');
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const portTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // If the selected connection changes externally, sync inputs
  useEffect(() => { setLabel(conn.label ?? ''); }, [conn.id, conn.label]);
  useEffect(() => { setSourcePort(conn.source_port ?? ''); }, [conn.id, conn.source_port]);
  useEffect(() => { setTargetPort(conn.target_port ?? ''); }, [conn.id, conn.target_port]);

  const debouncedLabel = (value: string) => {
    setLabel(value);
    if (labelTimer.current) clearTimeout(labelTimer.current);
    labelTimer.current = setTimeout(() => onEdgeUpdate?.({ label: value || null }), 500);
  };

  const debouncedPort = (which: 'source_port' | 'target_port', value: string) => {
    if (which === 'source_port') setSourcePort(value); else setTargetPort(value);
    if (portTimer.current) clearTimeout(portTimer.current);
    portTimer.current = setTimeout(() => onEdgeUpdate?.({ [which]: value || null } as AgentEdgePatch), 500);
  };

  return (
    <>
      <div className="props-section">
        <div className="props-label">Source</div>
        <div>{data.sourceName}</div>
      </div>

      <div className="props-section">
        <div className="props-label">Target</div>
        <div>{data.targetName}</div>
      </div>

      <div className="props-section">
        <div className="props-label">Source Port</div>
        <input
          type="text"
          value={sourcePort}
          onChange={e => debouncedPort('source_port', e.target.value)}
          placeholder="e.g. 8080, agent-port"
          readOnly={locked}
        />
      </div>

      <div className="props-section">
        <div className="props-label">Target Port</div>
        <input
          type="text"
          value={targetPort}
          onChange={e => debouncedPort('target_port', e.target.value)}
          placeholder="e.g. 9100, exporter"
          readOnly={locked}
        />
      </div>

      <div className="props-section">
        <div className="props-label">Line Style</div>
        <select
          value={initialDash}
          onChange={e => onEdgeUpdate?.({ dashKey: e.target.value })}
          disabled={locked}
        >
          {LINE_STYLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <ColourPicker
        label="Line Colour"
        value={conn.edge_color || undefined}
        onChange={v => onEdgeUpdate?.({ edge_color: v })}
        disabled={locked}
      />

      <div className="props-section">
        <div className="props-label">Line Width</div>
        <select
          value={String(conn.edge_width ?? 1)}
          onChange={e => onEdgeUpdate?.({ edge_width: parseInt(e.target.value) || null })}
          disabled={locked}
        >
          {EDGE_WIDTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="props-section">
        <div className="props-label">Label</div>
        <input
          type="text"
          value={label}
          onChange={e => debouncedLabel(e.target.value)}
          placeholder="Optional label..."
          readOnly={locked}
        />
      </div>

      <ColourPicker
        label="Label Text Colour"
        value={conn.label_color || undefined}
        onChange={v => onEdgeUpdate?.({ label_color: v })}
        disabled={locked}
      />

      <ColourPicker
        label="Label Background"
        value={conn.label_bg_color || undefined}
        onChange={v => onEdgeUpdate?.({ label_bg_color: v })}
        disabled={locked}
      />

      {conn.created_at && (
        <div className="props-section">
          <div className="props-label">Created</div>
          <div>{new Date(conn.created_at).toLocaleDateString()}</div>
        </div>
      )}

      {onDeleteEdge && (
        <div className="props-section">
          <button
            className="btn btn-danger"
            style={{ width: '100%' }}
            onClick={() => onDeleteEdge(conn.id)}
            disabled={locked}
          >
            Delete connection
          </button>
        </div>
      )}
    </>
  );
}

const PLACEMENT_V_OPTIONS: { value: LabelPlacementV; label: string }[] = [
  { value: 'above', label: 'Above' },
  { value: 'middle', label: 'Middle' },
  { value: 'below', label: 'Below' },
];

const PLACEMENT_H_OPTIONS: { value: LabelPlacementH; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'middle', label: 'Middle' },
  { value: 'right', label: 'Right' },
];

function ImageDetails({ imageId, initialLabel, initialPlacementV, initialPlacementH, onImageUpdate, locked }: {
  imageId: number;
  initialLabel: string;
  initialPlacementV: LabelPlacementV;
  initialPlacementH: LabelPlacementH;
  onImageUpdate?: Props['onImageUpdate'];
  locked: boolean;
}) {
  const [label, setLabel] = useState(initialLabel);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setLabel(initialLabel); }, [imageId, initialLabel]);

  const handleChange = (value: string) => {
    setLabel(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onImageUpdate?.(imageId, { label: value }), 500);
  };

  return (
    <div className="props-section">
      <div className="props-label">Caption</div>
      <input
        type="text"
        value={label}
        onChange={e => handleChange(e.target.value)}
        placeholder="Caption text"
        readOnly={locked}
      />

      <div className="props-label" style={{ marginTop: '0.75rem' }}>Vertical placement</div>
      <div role="group" aria-label="Vertical caption placement" style={{ display: 'flex', gap: '0.25rem' }}>
        {PLACEMENT_V_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`btn btn-sm${initialPlacementV === opt.value ? ' btn-primary' : ' btn-secondary'}`}
            disabled={locked}
            onClick={() => onImageUpdate?.(imageId, { label_placement_v: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="props-label" style={{ marginTop: '0.5rem' }}>Horizontal placement</div>
      <div role="group" aria-label="Horizontal caption placement" style={{ display: 'flex', gap: '0.25rem' }}>
        {PLACEMENT_H_OPTIONS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`btn btn-sm${initialPlacementH === opt.value ? ' btn-primary' : ' btn-secondary'}`}
            disabled={locked}
            onClick={() => onImageUpdate?.(imageId, { label_placement_h: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AgentPropertiesPanel({ selected, onClose, projectBase, locked = false, onEdgeUpdate, onDeleteEdge, onAgentStatusChange, onImageUpdate }: Props) {
  const title = selected.type === 'agent'
    ? selected.agent.name
    : selected.type === 'image'
    ? (selected.label || 'Image')
    : 'Connection';

  return (
    <div className="properties-panel">
      <div className="properties-panel-header">
        <h3>{title}</h3>
        <button className="properties-panel-close" onClick={onClose} title="Close" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="properties-panel-body">
        {selected.type === 'agent' && (
          <AgentDetails agent={selected.agent} projectBase={projectBase} locked={locked} onAgentStatusChange={onAgentStatusChange} />
        )}
        {selected.type === 'edge' && (
          <EdgeDetails data={selected.data} locked={locked} onEdgeUpdate={onEdgeUpdate} onDeleteEdge={onDeleteEdge} />
        )}
        {selected.type === 'image' && (
          <ImageDetails
            key={selected.imageId}
            imageId={selected.imageId}
            initialLabel={selected.label || ''}
            initialPlacementV={selected.labelPlacementV}
            initialPlacementH={selected.labelPlacementH}
            onImageUpdate={onImageUpdate}
            locked={locked}
          />
        )}
      </div>
    </div>
  );
}
