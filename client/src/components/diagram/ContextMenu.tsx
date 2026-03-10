import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

const COLOUR_PRESETS = [
  '#3b82f6', '#8b5cf6', '#ef4444', '#f59e0b',
  '#10b981', '#ec4899', '#06b6d4', '#f97316',
  '#6366f1', '#84cc16',
];

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface Props {
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  onColourChange?: (colour: string | null) => void;
  currentColour?: string | null;
}

export default function ContextMenu({ position, items, onClose, onColourChange, currentColour }: Props) {
  const [showColours, setShowColours] = useState(false);

  return (
    <div
      className="context-menu"
      style={{ left: position.x, top: position.y }}
      onContextMenu={e => e.preventDefault()}
    >
      {!showColours ? (
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
          {onColourChange && (
            <button
              className="context-menu-item"
              onClick={() => setShowColours(true)}
            >
              Change Colour
            </button>
          )}
        </div>
      ) : (
        <div className="context-menu-colours">
          <div className="context-menu-colours-label">Border Colour</div>
          <div className="colour-swatches">
            {COLOUR_PRESETS.map(c => (
              <button
                key={c}
                className={`colour-swatch${currentColour === c ? ' active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => { onColourChange?.(c); onClose(); }}
                title={c}
              />
            ))}
            <button
              className="colour-swatch reset"
              onClick={() => { onColourChange?.(null); onClose(); }}
              title="Reset to default"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
