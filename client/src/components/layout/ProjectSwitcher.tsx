import { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronUp, Search, Loader2 } from 'lucide-react';
import type { Project } from 'shared/types.js';
import { projectImageUrl, projectInitials } from '../../utils/projectAvatar';

interface Props {
  projects: Project[];
  currentSlug: string;
  onSwitch: (slug: string) => void;
  pendingSlug?: string | null;
}

export default function ProjectSwitcher({ projects, currentSlug, onSwitch, pendingSlug }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (pendingSlug) return;
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, pendingSlug]);

  useEffect(() => {
    if (open && pendingSlug && pendingSlug === currentSlug) {
      setOpen(false);
    }
  }, [open, pendingSlug, currentSlug]);

  useEffect(() => {
    if (open) {
      setSearch('');
      // Small delay to let the input render before focusing
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const current = projects.find(p => p.slug === currentSlug);
  const currentImg = projectImageUrl(current);
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
          <span className="project-switcher-trigger-main">
            {currentImg && (
              <>
                <img className="project-switcher-current-avatar" src={currentImg} alt="" />
                <span className="project-switcher-trigger-divider" aria-hidden="true" />
              </>
            )}
            <span className="project-switcher-name">{current?.name || 'Select Project'}</span>
          </span>
          <ChevronDown size={16} className="project-switcher-chevron" />
        </button>
      )}

      {open && (
        <div className="project-switcher-dropdown">
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
                      setOpen(false);
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
      )}
    </div>
  );
}
