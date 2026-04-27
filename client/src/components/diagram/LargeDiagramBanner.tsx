import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const DISMISS_KEY = 'diagram-large-banner-dismissed';

export default function LargeDiagramBanner({ nodeCount }: { nodeCount: number }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === 'true');

  useEffect(() => {
    if (dismissed) sessionStorage.setItem(DISMISS_KEY, 'true');
  }, [dismissed]);

  if (dismissed || nodeCount <= 500) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 8,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        background: 'var(--color-warning-bg, #fef3c7)',
        color: 'var(--color-warning-text, #92400e)',
        border: '1px solid var(--color-warning-border, #fbbf24)',
        borderRadius: 6,
        padding: '0.5rem 0.75rem',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        maxWidth: '90%',
      }}
    >
      <span>
        Large diagram ({nodeCount} nodes) — use filter/search to focus. Performance mode on.
      </span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
        }}
        aria-label="Dismiss banner"
      >
        <X size={14} />
      </button>
    </div>
  );
}
