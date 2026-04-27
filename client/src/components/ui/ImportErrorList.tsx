import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface Props {
  // Pre-formatted human-readable lines (server returns "Row 5: ..." style strings).
  errors: string[];
  // Optional title — defaults to a generic count-based one.
  title?: string;
  // Maximum visible height before scrolling. Default sized so ~10 lines fit
  // without clipping the dialog action buttons.
  maxHeight?: number;
}

// Scrollable error list with a copy-to-clipboard button. Used by CSV import
// modals, backup restore, etc. — anywhere the server returns a per-row error
// list that's worth surfacing in full instead of clamping at the first 10.
export default function ImportErrorList({ errors, title, maxHeight = 200 }: Props) {
  const [copied, setCopied] = useState(false);
  if (errors.length === 0) return null;

  const heading = title ?? `${errors.length} ${errors.length === 1 ? 'error' : 'errors'}`;

  const copyAll = async () => {
    const text = errors.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); }
      finally { document.body.removeChild(ta); }
    }
  };

  return (
    <div
      style={{
        textAlign: 'left',
        marginTop: '0.75rem',
        border: '1px solid var(--color-border)',
        borderRadius: '6px',
        background: 'var(--color-bg)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.4rem 0.6rem',
          borderBottom: '1px solid var(--color-border)',
          fontSize: '0.8rem',
          fontWeight: 500,
          color: 'var(--color-danger)',
        }}
      >
        <span>{heading}</span>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={copyAll}
          style={{ padding: '0.15rem 0.5rem', fontSize: '0.75rem' }}
        >
          {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <ul
        style={{
          margin: 0,
          padding: '0.4rem 0.8rem 0.4rem 1.5rem',
          maxHeight,
          overflowY: 'auto',
          fontSize: '0.78rem',
          fontFamily: 'monospace',
          color: 'var(--color-text-secondary)',
        }}
      >
        {errors.map((e, i) => <li key={i} style={{ marginBottom: '0.15rem' }}>{e}</li>)}
      </ul>
    </div>
  );
}
