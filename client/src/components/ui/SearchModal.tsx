import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../../contexts/ProjectContext';
import { globalSearch, type SearchResult } from '../../api/search';
import { useFocusTrap } from '../../hooks/useFocusTrap';

const TYPE_ICONS: Record<string, string> = {
  device: 'D',
  subnet: 'S',
  credential: 'C',
  agent: 'A',
};

const TYPE_LABELS: Record<string, string> = {
  device: 'Device',
  subnet: 'Subnet',
  credential: 'Credential',
  agent: 'Agent',
};

const TYPE_COLORS: Record<string, string> = {
  device: 'var(--color-primary, #3b82f6)',
  subnet: '#22c55e',
  credential: '#f59e0b',
  agent: '#8b5cf6',
};

export default function SearchModal() {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut: Cmd/Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!open) return null;

  return createPortal(
    <div className="search-modal-overlay" onClick={() => setOpen(false)}>
      <SearchModalInner onClose={() => setOpen(false)} />
    </div>,
    document.body,
  );
}

function SearchModalInner({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { projectId, project } = useProject();
  const base = `/p/${project.slug}`;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const trapRef = useFocusTrap<HTMLDivElement>();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await globalSearch(projectId, query);
        setResults(data);
        setActiveIdx(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, projectId]);

  const navigateToResult = useCallback((result: SearchResult) => {
    onClose();
    switch (result.type) {
      case 'device': navigate(`${base}/devices/${result.id}`); break;
      case 'subnet': navigate(`${base}/subnets/${result.id}`); break;
      case 'credential': navigate(`${base}/credentials`); break;
      case 'agent': navigate(`${base}/agents/${result.id}`); break;
    }
  }, [navigate, base, onClose]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      navigateToResult(results[activeIdx]);
    }
  }, [results, activeIdx, navigateToResult, onClose]);

  return (
    <div className="search-modal" ref={trapRef} onClick={e => e.stopPropagation()} onKeyDown={onKeyDown}>
      <div className="search-modal-input-row">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search devices, subnets, credentials, agents..."
          className="search-modal-input"
        />
        <kbd className="search-modal-kbd">Esc</kbd>
      </div>
      <div className="search-modal-results">
        {loading && query.length >= 2 && (
          <div className="search-modal-empty">Searching...</div>
        )}
        {!loading && query.length >= 2 && results.length === 0 && (
          <div className="search-modal-empty">No results found.</div>
        )}
        {query.length < 2 && (
          <div className="search-modal-empty">Type at least 2 characters to search.</div>
        )}
        {results.map((r, i) => (
          <button
            key={`${r.type}-${r.id}`}
            className={`search-modal-item${i === activeIdx ? ' active' : ''}`}
            onClick={() => navigateToResult(r)}
            onMouseEnter={() => setActiveIdx(i)}
          >
            <span className="search-modal-type-badge" style={{ backgroundColor: TYPE_COLORS[r.type] }}>
              {TYPE_ICONS[r.type]}
            </span>
            <span className="search-modal-item-content">
              <span className="search-modal-item-name">{r.name}</span>
              <span className="search-modal-item-detail">{r.detail}</span>
            </span>
            <span className="search-modal-item-type">{TYPE_LABELS[r.type]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
