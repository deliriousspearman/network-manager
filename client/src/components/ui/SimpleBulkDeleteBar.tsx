import { Trash2, X } from 'lucide-react';

interface Props {
  count: number;
  noun: string;
  pluralNoun?: string;
  onDelete: () => void;
  onClose: () => void;
  pending?: boolean;
}

export default function SimpleBulkDeleteBar({ count, noun, pluralNoun, onDelete, onClose, pending = false }: Props) {
  const label = count === 1 ? noun : (pluralNoun ?? `${noun}s`);
  return (
    <div className="bulk-action-bar">
      <span className="bulk-action-count">{count} selected</span>
      <div className="bulk-action-spacer" />
      <button className="btn btn-danger btn-sm" onClick={onDelete} disabled={pending || count === 0}>
        <Trash2 size={13} /> Delete {count > 0 ? `${count} ${label}` : label}
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onClose} title="Exit select mode">
        <X size={13} /> Done
      </button>
    </div>
  );
}
