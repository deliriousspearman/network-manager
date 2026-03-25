import { NodeResizer, Handle, Position, type NodeProps } from '@xyflow/react';

const BORDER_STYLE_MAP: Record<string, string> = { solid: 'solid', dashed: 'dashed', dotted: 'dotted' };
const BORDER_RADIUS_MAP: Record<string, string> = { square: '0px', small: '4px', rounded: '12px', pill: '24px' };
const BORDER_WIDTH_MAP: Record<string, string> = { thin: '1px', normal: '2px', thick: '3px' };

export default function SubnetGroupNode({ data, selected }: NodeProps) {
  const d = data as { label: string; cidr: string; borderColor?: string | null; bgColor?: string | null; labelColor?: string | null; favourite?: boolean; borderStyle?: string | null; borderRadius?: string | null; borderWidth?: string | null };

  const style: React.CSSProperties = {};
  if (d.borderColor) style.borderColor = d.borderColor;
  if (d.bgColor) style.backgroundColor = d.bgColor;
  if (d.borderStyle) style.borderStyle = BORDER_STYLE_MAP[d.borderStyle];
  if (d.borderRadius) style.borderRadius = BORDER_RADIUS_MAP[d.borderRadius];
  if (d.borderWidth) style.borderWidth = BORDER_WIDTH_MAP[d.borderWidth];
  const labelStyle: React.CSSProperties = d.labelColor ? { color: d.labelColor } : {};

  return (
    <div className="subnet-group-node" style={style}>
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={150}
        lineStyle={{ borderColor: 'var(--color-primary)', borderWidth: 1 }}
        handleStyle={{ width: 10, height: 10, borderRadius: 3, backgroundColor: 'var(--color-primary)', border: 'none' }}
      />
      <div className="subnet-label" style={labelStyle}>
        {d.favourite && <span style={{ marginRight: '0.3rem' }}>⭐</span>}
        {d.label} ({d.cidr})
      </div>
      {/* Connection handles for subnet-to-subnet edges */}
      <Handle id="subnet-top-t" type="target" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="subnet-top-s" type="source" position={Position.Top} style={{ left: '50%' }} />
      <Handle id="subnet-bot-t" type="target" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="subnet-bot-s" type="source" position={Position.Bottom} style={{ left: '50%' }} />
      <Handle id="subnet-lft-t" type="target" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="subnet-lft-s" type="source" position={Position.Left} style={{ top: '50%' }} />
      <Handle id="subnet-rgt-t" type="target" position={Position.Right} style={{ top: '50%' }} />
      <Handle id="subnet-rgt-s" type="source" position={Position.Right} style={{ top: '50%' }} />
    </div>
  );
}
