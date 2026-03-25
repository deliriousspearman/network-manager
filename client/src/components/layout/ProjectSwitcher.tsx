import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Search, Check } from 'lucide-react';
import type { Project } from 'shared/types.js';

interface Props {
  projects: Project[];
  currentSlug: string;
  onSwitch: (slug: string) => void;
}

export default function ProjectSwitcher({ projects, currentSlug, onSwitch }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch('');
      // Small delay to let the input render before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const current = projects.find(p => p.slug === currentSlug);
  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="project-switcher" ref={ref}>
      {open ? (
        <div className="project-switcher-trigger open">
          <Search size={14} className="project-switcher-search-icon" />
          <input
            ref={inputRef}
            className="project-switcher-input"
            type="text"
            placeholder="Select"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setOpen(false);
            }}
          />
          <ChevronUp size={16} className="project-switcher-chevron" onClick={() => setOpen(false)} />
        </div>
      ) : (
        <button
          className="project-switcher-trigger"
          onClick={() => setOpen(true)}
        >
          <span className="project-switcher-name">{current?.name || 'Select Project'}</span>
          <ChevronDown size={16} className="project-switcher-chevron" />
        </button>
      )}

      {open && (
        <div className="project-switcher-dropdown">
          <div className="project-switcher-list">
            {filtered.map(p => (
              <button
                key={p.id}
                className={`project-switcher-item${p.slug === currentSlug ? ' active' : ''}`}
                onClick={() => {
                  onSwitch(p.slug);
                  setOpen(false);
                }}
              >
                <span className="project-switcher-check">
                  {p.slug === currentSlug && <Check size={14} />}
                </span>
                <span>{p.name}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="project-switcher-empty">No projects found</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
