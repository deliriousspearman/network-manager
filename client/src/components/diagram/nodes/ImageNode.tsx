import { memo } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import type { LabelPlacementV, LabelPlacementH } from 'shared/types';

function ImageNode({ data, selected }: NodeProps) {
  const d = data as {
    imageUrl: string;
    label: string | null;
    labelPlacementV?: LabelPlacementV;
    labelPlacementH?: LabelPlacementH;
    connectable?: boolean;
  };
  const placementV = d.labelPlacementV || 'below';
  const placementH = d.labelPlacementH || 'middle';

  return (
    <>
      <NodeResizer
        minWidth={40}
        minHeight={40}
        isVisible={selected}
        lineStyle={{ borderColor: 'var(--color-primary)', borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'var(--color-primary)', border: 'none' }}
      />
      <div className={`image-node${d.connectable === false ? ' hide-handles' : ''}`} style={{ width: '100%', height: '100%' }}>
        <img
          src={d.imageUrl}
          alt={d.label || 'Diagram image'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          draggable={false}
        />
        {d.label && (
          <div className="image-node-label" data-v={placementV} data-h={placementH}>
            {d.label}
          </div>
        )}
        {/* Top: left, center, right */}
        <Handle id="top-l-t" type="target" position={Position.Top} style={{ left: '25%' }} />
        <Handle id="top-l-s" type="source" position={Position.Top} style={{ left: '25%' }} />
        <Handle id="top-c-t" type="target" position={Position.Top} style={{ left: '50%' }} />
        <Handle id="top-c-s" type="source" position={Position.Top} style={{ left: '50%' }} />
        <Handle id="top-r-t" type="target" position={Position.Top} style={{ left: '75%' }} />
        <Handle id="top-r-s" type="source" position={Position.Top} style={{ left: '75%' }} />
        {/* Bottom */}
        <Handle id="bot-l-t" type="target" position={Position.Bottom} style={{ left: '25%' }} />
        <Handle id="bot-l-s" type="source" position={Position.Bottom} style={{ left: '25%' }} />
        <Handle id="bot-c-t" type="target" position={Position.Bottom} style={{ left: '50%' }} />
        <Handle id="bot-c-s" type="source" position={Position.Bottom} style={{ left: '50%' }} />
        <Handle id="bot-r-t" type="target" position={Position.Bottom} style={{ left: '75%' }} />
        <Handle id="bot-r-s" type="source" position={Position.Bottom} style={{ left: '75%' }} />
        {/* Left */}
        <Handle id="lft-t-t" type="target" position={Position.Left} style={{ top: '25%' }} />
        <Handle id="lft-t-s" type="source" position={Position.Left} style={{ top: '25%' }} />
        <Handle id="lft-c-t" type="target" position={Position.Left} style={{ top: '50%' }} />
        <Handle id="lft-c-s" type="source" position={Position.Left} style={{ top: '50%' }} />
        <Handle id="lft-b-t" type="target" position={Position.Left} style={{ top: '75%' }} />
        <Handle id="lft-b-s" type="source" position={Position.Left} style={{ top: '75%' }} />
        {/* Right */}
        <Handle id="rgt-t-t" type="target" position={Position.Right} style={{ top: '25%' }} />
        <Handle id="rgt-t-s" type="source" position={Position.Right} style={{ top: '25%' }} />
        <Handle id="rgt-c-t" type="target" position={Position.Right} style={{ top: '50%' }} />
        <Handle id="rgt-c-s" type="source" position={Position.Right} style={{ top: '50%' }} />
        <Handle id="rgt-b-t" type="target" position={Position.Right} style={{ top: '75%' }} />
        <Handle id="rgt-b-s" type="source" position={Position.Right} style={{ top: '75%' }} />
      </div>
    </>
  );
}

export default memo(ImageNode);
