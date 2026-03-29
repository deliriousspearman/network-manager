import { NodeResizer, type NodeProps } from '@xyflow/react';

export default function ImageNode({ data, selected }: NodeProps) {
  const d = data as {
    imageUrl: string;
    label: string | null;
  };

  return (
    <>
      <NodeResizer
        minWidth={40}
        minHeight={40}
        isVisible={selected}
        lineStyle={{ borderColor: 'var(--color-primary)', borderWidth: 1 }}
        handleStyle={{ width: 8, height: 8, borderRadius: 2, backgroundColor: 'var(--color-primary)', border: 'none' }}
      />
      <div className="image-node" style={{ width: '100%', height: '100%' }}>
        <img
          src={d.imageUrl}
          alt={d.label || 'Diagram image'}
          style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          draggable={false}
        />
        {d.label && <div className="image-node-label">{d.label}</div>}
      </div>
    </>
  );
}
