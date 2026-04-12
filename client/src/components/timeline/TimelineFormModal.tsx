import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import type { TimelineEntry, TimelineCategory } from 'shared/types';
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABELS } from 'shared/types';

interface Props {
  entry?: TimelineEntry | null;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description?: string;
    event_date?: string;
    category?: TimelineCategory;
    updated_at?: string;
  }) => void;
  isPending: boolean;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function TimelineFormModal({ entry, onClose, onSave, isPending }: Props) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [eventDate, setEventDate] = useState(entry?.event_date?.slice(0, 10) ?? todayStr());
  const [category, setCategory] = useState<TimelineCategory>(entry?.category ?? 'general');
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onSave({
      title: trimmed,
      description: description.trim() || undefined,
      event_date: eventDate || undefined,
      category,
      ...(entry ? { updated_at: entry.updated_at } : {}),
    });
  }

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-dialog timeline-form-dialog"
        ref={trapRef}
        onClick={e => e.stopPropagation()}
      >
        <div className="confirm-dialog-title">
          {entry ? 'Edit Entry' : 'Add Timeline Entry'}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </div>
          <div className="timeline-form-row">
            <div className="form-group">
              <label>Date</label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Category</label>
              <select value={category} onChange={e => setCategory(e.target.value as TimelineCategory)}>
                {TIMELINE_CATEGORIES.map(c => (
                  <option key={c} value={c}>{TIMELINE_CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Optional details..."
            />
          </div>
          <div className="confirm-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isPending || !title.trim()}>
              {isPending ? 'Saving...' : entry ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
