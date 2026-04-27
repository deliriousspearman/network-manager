import { useState, useRef, useEffect } from 'react';
import { Search, Loader2 } from 'lucide-react';
import type { Project } from 'shared/types.js';
import { projectImageUrl, projectInitials } from '../../utils/projectAvatar';

interface Props {
  projects: Project[];
  currentSlug: string;
  onSwitch: (slug: string) => void;
  onClose: () => void;
  pendingSlug?: string | null;
}

export default function CollapsedProjectFlyout({ projects, currentSlug, onSwitch, onClose, pendingSlug }: Props) {
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (pendingSlug) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, pendingSlug]);

  useEffect(() => {
    if (pendingSlug && pendingSlug === currentSlug) {
      onClose();
    }
  }, [pendingSlug, currentSlug, onClose]);

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="collapsed-project-flyout" ref={ref}>
      <div className="collapsed-project-flyout-search">
        <Search size={14} className="collapsed-project-flyout-search-icon" />
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
        {filtered.map(p => {
          const isPending = pendingSlug === p.slug && p.slug !== currentSlug;
          const disabled = !!pendingSlug;
          const imgSrc = projectImageUrl(p);
          return (
            <button
              key={p.id}
              className={`project-switcher-item${p.slug === currentSlug ? ' active' : ''}`}
              aria-current={p.slug === currentSlug ? 'page' : undefined}
              disabled={disabled}
              onClick={() => {
                if (p.slug === currentSlug) {
                  onClose();
                  return;
                }
                onSwitch(p.slug);
              }}
            >
              <span className="project-avatar-sm" aria-hidden="true">
                {isPending
                  ? <Loader2 size={18} className="spin" />
                  : imgSrc ? <img src={imgSrc} alt="" /> : <span>{projectInitials(p)}</span>}
              </span>
              <span>{p.name}</span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="project-switcher-empty">No projects found</div>
        )}
      </div>
    </div>
  );
}
