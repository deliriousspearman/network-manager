import { Pencil, Trash2 } from 'lucide-react';
import type { TimelineEntry } from 'shared/types';
import { TIMELINE_CATEGORY_LABELS } from 'shared/types';

interface Props {
  entries: TimelineEntry[];
  timezone: string;
  onEdit: (entry: TimelineEntry) => void;
  onDelete: (entry: TimelineEntry) => void;
  selectMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (id: number) => void;
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

function yearOf(ts: string): number {
  return new Date(ts + (ts.includes('T') ? '' : 'T00:00:00') + 'Z').getUTCFullYear();
}

export default function TimelineList({ entries, timezone, onEdit, onDelete, selectMode, selectedIds, onToggleSelect }: Props) {
  // Entries arrive pre-sorted from the server (event_date DESC). Group them
  // into year buckets so the timeline reads as a visual "history book" rather
  // than an undifferentiated list — scanning a 3-year project is much easier
  // when 2026 vs 2025 vs 2024 are visually separated.
  const groups: { year: number; entries: TimelineEntry[] }[] = [];
  let currentYear: number | null = null;
  for (const e of entries) {
    const y = yearOf(e.event_date);
    if (y !== currentYear) {
      groups.push({ year: y, entries: [] });
      currentYear = y;
    }
    groups[groups.length - 1].entries.push(e);
  }

  return (
    <div className="timeline-container">
      {groups.map(group => (
        <div key={group.year} className="timeline-group">
          <div className="timeline-group-header">
            <span className="timeline-group-year">{group.year}</span>
            <span className="timeline-group-count">
              {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="timeline-list">
            {group.entries.map(entry => {
              const isSelected = selectedIds?.has(entry.id) ?? false;
              const cardClasses = ['timeline-card', 'card', isSelected ? 'row-selected' : ''].filter(Boolean).join(' ');
              return (
                <div key={entry.id} className="timeline-item" data-entry-id={entry.id}>
                  <div className="timeline-dot" data-category={entry.category} />
                  <div
                    className={cardClasses}
                    onClick={selectMode ? () => onToggleSelect?.(entry.id) : undefined}
                    style={selectMode ? { cursor: 'pointer' } : undefined}
                  >
                    <div className="timeline-card-header">
                      {selectMode && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${entry.title}`}
                          checked={isSelected}
                          onChange={() => onToggleSelect?.(entry.id)}
                          onClick={e => e.stopPropagation()}
                          style={{ marginRight: '0.5rem' }}
                        />
                      )}
                      <span className="timeline-date">{formatDate(entry.event_date, timezone)}</span>
                      <span className={`badge badge-timeline-${entry.category}`}>
                        {TIMELINE_CATEGORY_LABELS[entry.category] ?? entry.category}
                      </span>
                      {!selectMode && (
                        <div className="timeline-actions">
                          <button onClick={() => onEdit(entry)} title="Edit entry" aria-label="Edit entry">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => onDelete(entry)} className="timeline-delete-btn" title="Delete entry" aria-label="Delete entry">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                    <h3 className="timeline-card-title">{entry.title}</h3>
                    {entry.description && (
                      <p className="timeline-card-desc">{entry.description}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
