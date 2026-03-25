import type { NodeProps } from '@xyflow/react';

export default function ImageNode({ data }: NodeProps) {
  const d = data as {
    imageUrl: string;
    width: number;
    height: number;
    label: string | null;
    onDelete?: () => void;
  };

  return (
    <div className="image-node" style={{ width: d.width, height: d.height }}>
      <img
        src={d.imageUrl}
        alt={d.label || 'Diagram image'}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
        draggable={false}
      />
      {d.label && <div className="image-node-label">{d.label}</div>}
    </div>
  );
}
