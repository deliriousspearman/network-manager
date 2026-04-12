import { Pencil, Trash2 } from 'lucide-react';
import type { TimelineEntry } from 'shared/types';
import { TIMELINE_CATEGORY_LABELS } from 'shared/types';

interface Props {
  entries: TimelineEntry[];
  timezone: string;
  onEdit: (entry: TimelineEntry) => void;
  onDelete: (entry: TimelineEntry) => void;
}

function formatDate(ts: string, timezone: string): string {
  const date = new Date(ts + (ts.includes('T') ? '' : 'T00:00:00') + 'Z');
  return date.toLocaleDateString(undefined, {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function TimelineList({ entries, timezone, onEdit, onDelete }: Props) {
  return (
    <div className="timeline-container">
      <div className="timeline-list">
        {entries.map(entry => (
          <div key={entry.id} className="timeline-item">
            <div className="timeline-dot" data-category={entry.category} />
            <div className="timeline-card card">
              <div className="timeline-card-header">
                <span className={`badge badge-timeline-${entry.category}`}>
                  {TIMELINE_CATEGORY_LABELS[entry.category] ?? entry.category}
                </span>
                <span className="timeline-date">{formatDate(entry.event_date, timezone)}</span>
                <div className="timeline-actions">
                  <button onClick={() => onEdit(entry)} title="Edit entry">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => onDelete(entry)} className="timeline-delete-btn" title="Delete entry">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <h3 className="timeline-card-title">{entry.title}</h3>
              {entry.description && (
                <p className="timeline-card-desc">{entry.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
