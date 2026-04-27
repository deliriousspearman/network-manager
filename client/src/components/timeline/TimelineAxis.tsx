import { useMemo, useRef, useState, useEffect } from 'react';
import type { TimelineSummaryItem } from '../../api/timeline';
import type { TimelineCategory } from 'shared/types';
import { TIMELINE_CATEGORIES, TIMELINE_CATEGORY_LABELS } from 'shared/types';

interface Props {
  items: TimelineSummaryItem[];
  timezone: string;
  onItemClick?: (id: number) => void;
}

const CATEGORY_COLORS: Record<string, string> = {
  decision: '#8b5cf6',
  change: '#3b82f6',
  incident: '#ef4444',
  milestone: '#22c55e',
  note: '#f59e0b',
  general: '#64748b',
};

function toDate(raw: string): Date {
  return new Date(raw + (raw.includes('T') ? '' : 'T00:00:00') + 'Z');
}

// Pick 5–8 tick marks for the axis, snapped to year boundaries when the range
// is long, to months when it's short. Returns the tick positions as a
// fraction 0..1 along with their label text.
function computeTicks(min: Date, max: Date): { pos: number; label: string }[] {
  const span = max.getTime() - min.getTime();
  if (span <= 0) return [];
  const days = span / (1000 * 60 * 60 * 24);
  const ticks: { pos: number; label: string }[] = [];
  const push = (d: Date, label: string) => {
    const pos = (d.getTime() - min.getTime()) / span;
    if (pos >= 0 && pos <= 1) ticks.push({ pos, label });
  };

  if (days > 365 * 2) {
    // Year ticks
    const startYear = min.getUTCFullYear();
    const endYear = max.getUTCFullYear();
    for (let y = startYear; y <= endYear; y++) {
      push(new Date(Date.UTC(y, 0, 1)), String(y));
    }
  } else if (days > 60) {
    // Quarterly or monthly
    const step = days > 365 ? 3 : 1;
    const cursor = new Date(Date.UTC(min.getUTCFullYear(), min.getUTCMonth(), 1));
    while (cursor <= max) {
      push(new Date(cursor), cursor.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }));
      cursor.setUTCMonth(cursor.getUTCMonth() + step);
    }
  } else {
    // Weekly
    const cursor = new Date(min);
    cursor.setUTCHours(0, 0, 0, 0);
    while (cursor <= max) {
      push(new Date(cursor), cursor.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }));
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  return ticks;
}

export default function TimelineAxis({ items, timezone, onItemClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ item: TimelineSummaryItem; x: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const { min, max, dots, ticks } = useMemo(() => {
    if (items.length === 0) return { min: null, max: null, dots: [], ticks: [] };
    const dates = items.map(i => toDate(i.event_date));
    let minD = new Date(Math.min(...dates.map(d => d.getTime())));
    let maxD = new Date(Math.max(...dates.map(d => d.getTime())));
    // Ensure non-zero span — if all events share a date, pad by ±7 days so
    // the single dot sits centered under a sensible label.
    if (minD.getTime() === maxD.getTime()) {
      minD = new Date(minD.getTime() - 7 * 24 * 60 * 60 * 1000);
      maxD = new Date(maxD.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
    const span = maxD.getTime() - minD.getTime();
    const dots = items.map((item, i) => ({
      ...item,
      pos: (dates[i].getTime() - minD.getTime()) / span,
    }));
    return { min: minD, max: maxD, dots, ticks: computeTicks(minD, maxD) };
  }, [items]);

  if (items.length === 0 || !min || !max) return null;

  return (
    <div className="timeline-axis" ref={containerRef}>
      <div className="timeline-axis-track">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="timeline-axis-tick"
            style={{ left: `${t.pos * 100}%` }}
          >
            <span className="timeline-axis-tick-label">{t.label}</span>
          </div>
        ))}
        {dots.map(d => (
          <button
            key={d.id}
            type="button"
            className="timeline-axis-dot"
            style={{
              left: `${d.pos * 100}%`,
              background: CATEGORY_COLORS[d.category] ?? CATEGORY_COLORS.general,
            }}
            onMouseEnter={() => setHover({ item: d, x: d.pos * width })}
            onMouseLeave={() => setHover(null)}
            onClick={() => onItemClick?.(d.id)}
            aria-label={`${d.title} (${new Date(d.event_date).toLocaleDateString(undefined, { timeZone: timezone })})`}
          />
        ))}
      </div>
      {hover && (
        <div
          className="timeline-axis-tooltip"
          style={{ left: Math.min(Math.max(hover.x, 80), width - 80) }}
        >
          <div className="timeline-axis-tooltip-title">{hover.item.title}</div>
          <div className="timeline-axis-tooltip-date">
            {toDate(hover.item.event_date).toLocaleDateString(undefined, {
              timeZone: timezone, year: 'numeric', month: 'short', day: 'numeric',
            })}
          </div>
        </div>
      )}
      <div className="timeline-axis-legend" aria-hidden="true">
        {TIMELINE_CATEGORIES.map(c => (
          <span key={c} className="timeline-axis-legend-item">
            <span
              className="timeline-axis-legend-swatch"
              style={{ background: CATEGORY_COLORS[c] ?? CATEGORY_COLORS.general }}
            />
            {TIMELINE_CATEGORY_LABELS[c as TimelineCategory]}
          </span>
        ))}
      </div>
    </div>
  );
}
