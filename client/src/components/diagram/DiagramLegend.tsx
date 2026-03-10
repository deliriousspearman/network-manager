import { useState, useEffect } from 'react';
import { Pencil, Check, Trash2, Plus } from 'lucide-react';
import type { LegendItem } from 'shared/types';

interface DiagramLegendProps {
  items: LegendItem[];
  onUpdate: (items: LegendItem[]) => void;
}

export default function DiagramLegend({ items, onUpdate }: DiagramLegendProps) {
  const [editing, setEditing] = useState(false);
  const [localItems, setLocalItems] = useState<LegendItem[]>(items);

  useEffect(() => {
    if (!editing) setLocalItems(items);
  }, [items, editing]);

  function handleSave() {
    const cleaned = localItems.filter(i => i.label.trim());
    onUpdate(cleaned);
    setEditing(false);
  }

  function handleAdd() {
    setLocalItems([...localItems, { icon: '', label: '' }]);
  }

  function handleRemove(index: number) {
    setLocalItems(localItems.filter((_, i) => i !== index));
  }

  function handleChange(index: number, field: keyof LegendItem, value: string) {
    setLocalItems(localItems.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  return (
    <div className="diagram-legend">
      <div className="diagram-legend-header">
        <h4>Legend</h4>
        {editing ? (
          <button className="diagram-legend-btn" onClick={handleSave} title="Save">
            <Check size={14} />
          </button>
        ) : (
          <button className="diagram-legend-btn" onClick={() => setEditing(true)} title="Edit">
            <Pencil size={14} />
          </button>
        )}
      </div>

      {editing ? (
        <>
          {localItems.map((item, i) => (
            <div key={i} className="diagram-legend-item">
              <input
                type="text"
                value={item.icon}
                onChange={e => handleChange(i, 'icon', e.target.value)}
                placeholder="🔒"
                className="diagram-legend-icon-input"
              />
              <input
                type="text"
                value={item.label}
                onChange={e => handleChange(i, 'label', e.target.value)}
                placeholder="Label"
              />
              <button className="diagram-legend-btn" onClick={() => handleRemove(i)} title="Remove">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
          <button className="diagram-legend-add" onClick={handleAdd}>
            <Plus size={13} /> Add item
          </button>
        </>
      ) : (
        <>
          {items.length === 0 ? (
            <div className="diagram-legend-empty">No items</div>
          ) : (
            items.map((item, i) => (
              <div key={i} className="diagram-legend-item">
                <span className="diagram-legend-icon">{item.icon}</span>
                <span className="diagram-legend-label">{item.label}</span>
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}
