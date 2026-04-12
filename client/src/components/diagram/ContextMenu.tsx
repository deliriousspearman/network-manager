export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ position, items, onClose }: Props) {
  return (
    <div
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={e => e.preventDefault()}
    >
      <div className="context-menu-items">
        {items.map((item, i) => (
          <button
            key={i}
            className={`context-menu-item${item.danger ? ' danger' : ''}`}
            onClick={() => { item.onClick(); onClose(); }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
