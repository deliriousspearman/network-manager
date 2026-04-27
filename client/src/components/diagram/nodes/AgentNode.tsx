import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { truncateLabel } from './truncateLabel';

const STATUS_COLORS: Record<string, string> = {
  active: '#22c55e',
  inactive: '#94a3b8',
  error: '#ef4444',
  unknown: '#eab308',
};

function AgentNode({ data }: NodeProps) {
  const d = data as {
    label: string;
    agentType: string;
    iconUrl?: string;
    deviceName?: string | null;
    status?: string | null;
    hideHandles?: boolean;
  };

  const statusColor = d.status ? STATUS_COLORS[d.status] || STATUS_COLORS.unknown : null;

  return (
    <div className={`agent-node${d.hideHandles ? ' hide-handles' : ''}`}>
      {statusColor && (
        <div
          className="agent-node-status"
          title={`Status: ${d.status}`}
          style={{ background: statusColor }}
          aria-label={`Status: ${d.status}`}
        />
      )}
      <div className="agent-node-icon">
        {d.iconUrl
          ? <img src={d.iconUrl} alt={d.agentType} width={48} height={48} style={{ objectFit: 'contain' }} draggable={false} />
          : <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem' }}>🤖</div>
        }
      </div>
      <div className="agent-node-label" title={d.label}>{truncateLabel(d.label)}</div>
      {d.deviceName && <div className="agent-node-sub" title={`on ${d.deviceName}`}>on {truncateLabel(d.deviceName)}</div>}

      {/* Top: left, center, right */}
      <Handle id="top-l-t" type="target" position={Position.Top} style={{ left: '25%' }} />
      <Handle id="top-l-s" type="source" position={Position.Top} style={{ left: '25%' }} />
      <Handle id="top-c-t" type="target" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="top-c-s" type="source" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="top-r-t" type="target" position={Position.Top} style={{ left: '75%' }} />
      <Handle id="top-r-s" type="source" position={Position.Top} style={{ left: '75%' }} />
      {/* Bottom: left, center, right */}
      <Handle id="bot-l-t" type="target" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="bot-l-s" type="source" position={Position.Bottom} style={{ left: '25%' }} />
      <Handle id="bot-c-t" type="target" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="bot-c-s" type="source" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="bot-r-t" type="target" position={Position.Bottom} style={{ left: '75%' }} />
      <Handle id="bot-r-s" type="source" position={Position.Bottom} style={{ left: '75%' }} />
      {/* Left: top, center, bottom */}
      <Handle id="lft-t-t" type="target" position={Position.Left} style={{ top: '25%' }} />
      <Handle id="lft-t-s" type="source" position={Position.Left} style={{ top: '25%' }} />
      <Handle id="lft-c-t" type="target" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="lft-c-s" type="source" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="lft-b-t" type="target" position={Position.Left} style={{ top: '75%' }} />
      <Handle id="lft-b-s" type="source" position={Position.Left} style={{ top: '75%' }} />
      {/* Right: top, center, bottom */}
      <Handle id="rgt-t-t" type="target" position={Position.Right} style={{ top: '25%' }} />
      <Handle id="rgt-t-s" type="source" position={Position.Right} style={{ top: '25%' }} />
      <Handle id="rgt-c-t" type="target" position={Position.Right} style={{ top: '50%' }} />
      <Handle id="rgt-c-s" type="source" position={Position.Right} style={{ top: '50%' }} />
      <Handle id="rgt-b-t" type="target" position={Position.Right} style={{ top: '75%' }} />
      <Handle id="rgt-b-s" type="source" position={Position.Right} style={{ top: '75%' }} />
    </div>
  );
}

export default memo(AgentNode);
