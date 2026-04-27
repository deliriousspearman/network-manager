import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Tag, ChevronDown, X } from 'lucide-react';
import { fetchDeviceTags } from '../../api/devices';
import { queryKeys } from '../../api/queryKeys';

interface Props {
  projectId: number;
  selected: string[];
  onChange: (next: string[]) => void;
}

export default function TagFilterPopover({ projectId, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data: tags = [] } = useQuery({
    queryKey: queryKeys.devices.tags(projectId),
    queryFn: () => fetchDeviceTags(projectId),
    staleTime: 60_000,
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(t => t.toLowerCase().includes(q));
  }, [tags, search]);

  function toggle(tag: string) {
    if (selected.includes(tag)) onChange(selected.filter(t => t !== tag));
    else onChange([...selected, tag]);
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className={`btn btn-secondary btn-sm${selected.length > 0 ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Filter by tag"
        style={{ height: '32px' }}
      >
        <Tag size={13} /> Tags
        {selected.length > 0 && (
          <span
            className="badge"
            style={{
              marginLeft: '0.35rem',
              padding: '0.05rem 0.4rem',
              fontSize: '0.7rem',
              background: 'var(--color-accent)',
              color: '#fff',
            }}
          >
            {selected.length}
          </span>
        )}
        <ChevronDown size={12} style={{ marginLeft: '0.2rem' }} />
      </button>
      {open && (
        <div
          className="context-menu"
          style={{
            right: 'auto',
            left: 0,
            top: 'calc(100% + 4px)',
            minWidth: 220,
            maxHeight: 360,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {tags.length > 8 && (
            <div style={{ padding: '0.4rem 0.5rem 0.2rem' }}>
              <input
                type="search"
                className="list-search-input"
                placeholder="Search tags…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
                style={{ width: '100%', height: '28px' }}
              />
            </div>
          )}
          <div className="context-menu-items" style={{ overflowY: 'auto', maxHeight: 280 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '0.5rem 0.6rem', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>
                {tags.length === 0 ? 'No tags yet.' : 'No tags match.'}
              </div>
            ) : (
              filtered.map(tag => {
                const checked = selected.includes(tag);
                return (
                  <label
                    key={tag}
                    className="context-menu-item"
                    style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer' }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(tag)}
                    />
                    <span className="tag-pill">{tag}</span>
                  </label>
                );
              })
            )}
          </div>
          {selected.length > 0 && (
            <button
              type="button"
              className="context-menu-item"
              onClick={clearAll}
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', borderTop: '1px solid var(--color-border)' }}
            >
              <X size={12} /> Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
