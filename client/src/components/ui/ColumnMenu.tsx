import { GripVertical } from 'lucide-react';
import type { ColumnDefBase } from '../../hooks/useColumnPrefs';

interface ColumnMenuProps<T extends ColumnDefBase> {
  columns: T[];
  order: string[];
  visible: Set<string>;
  position: { x: number; y: number };
  dragOver: string | null;
  menuRef: React.MutableRefObject<HTMLDivElement | null>;
  onToggle: (key: string) => void;
  onReset: () => void;
  onDragStart: (key: string) => void;
  onDragOver: (e: React.DragEvent, key: string) => void;
  onDrop: (key: string) => void;
  onDragEnd: () => void;
}

export default function ColumnMenu<T extends ColumnDefBase>({
  columns, order, visible, position, dragOver, menuRef,
  onToggle, onReset, onDragStart, onDragOver, onDrop, onDragEnd,
}: ColumnMenuProps<T>) {
  const colMap = new Map(columns.map(c => [c.key, c]));
  return (
    <div ref={menuRef} className="column-menu" style={{ top: position.y, left: position.x }}>
      <div className="column-menu-title">Toggle Columns</div>
      {order.map(key => {
        const col = colMap.get(key);
        if (!col) return null;
        return (
          <label
            key={col.key}
            className={`column-menu-item${col.alwaysVisible ? ' column-menu-item-disabled' : ''}${dragOver === col.key ? ' column-menu-item-dragover' : ''}`}
            draggable
            onDragStart={() => onDragStart(col.key)}
            onDragOver={(e) => onDragOver(e, col.key)}
            onDrop={() => onDrop(col.key)}
            onDragEnd={onDragEnd}
          >
            <span className="column-menu-drag" aria-hidden="true"><GripVertical size={12} /></span>
            <input
              type="checkbox"
              checked={visible.has(col.key)}
              disabled={col.alwaysVisible}
              onChange={() => onToggle(col.key)}
            />
            {col.label}
          </label>
        );
      })}
      <div className="column-menu-divider" />
      <button className="column-menu-reset" onClick={onReset}>Reset to Default</button>
    </div>
  );
}
