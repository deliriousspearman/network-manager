import { memo, useState, useRef, useEffect, useCallback } from 'react';
import type { NodeProps } from '@xyflow/react';

function AnnotationNode({ data }: NodeProps) {
  const d = data as {
    text: string;
    fontSize: number;
    color: string | null;
    onTextChange?: (text: string) => void;
    onDelete?: () => void;
  };
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setText(d.text); }, [d.text]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const trimmed = text.trim();
    if (!trimmed) {
      d.onDelete?.();
      return;
    }
    if (trimmed !== d.text) {
      d.onTextChange?.(trimmed);
    }
  }, [text, d]);

  const style: React.CSSProperties = {
    fontSize: d.fontSize || 14,
    color: d.color || 'var(--color-text)',
  };

  if (editing) {
    return (
      <div className="annotation-node editing" style={style}>
        <textarea
          ref={inputRef}
          className="annotation-input"
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') { setText(d.text); setEditing(false); }
          }}
          style={{ fontSize: d.fontSize || 14 }}
        />
      </div>
    );
  }

  return (
    <div
      className="annotation-node"
      style={style}
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
    >
      {d.text}
    </div>
  );
}

export default memo(AnnotationNode);
