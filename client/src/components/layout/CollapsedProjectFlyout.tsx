import { useState, useRef, useEffect } from 'react';
import { Search, Check } from 'lucide-react';
import type { Project } from 'shared/types.js';

interface Props {
  projects: Project[];
  currentSlug: string;
  onSwitch: (slug: string) => void;
  onClose: () => void;
}

export default function CollapsedProjectFlyout({ projects, currentSlug, onSwitch, onClose }: Props) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="collapsed-project-flyout" ref={ref}>
      <div className="collapsed-project-flyout-search">
        <Search size={14} style={{ flexShrink: 0, color: 'var(--color-text-secondary)' }} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') onClose();
          }}
        />
      </div>
      <div className="project-switcher-list">
        {filtered.map(p => (
          <button
            key={p.id}
            className={`project-switcher-item${p.slug === currentSlug ? ' active' : ''}`}
            onClick={() => {
              onSwitch(p.slug);
              onClose();
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
  );
}
