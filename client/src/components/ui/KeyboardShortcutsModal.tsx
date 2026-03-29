import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

const SHORTCUTS = [
  { keys: 'Ctrl + Z', action: 'Undo (diagram)' },
  { keys: 'Ctrl + Shift + Z', action: 'Redo (diagram)' },
  { keys: 'Delete / Backspace', action: 'Remove selected element (diagram)' },
  { keys: 'Ctrl + A', action: 'Select all (diagram)' },
  { keys: '?', action: 'Show keyboard shortcuts' },
];

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only trigger on '?' when not in an input/textarea
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape' && open) setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="confirm-overlay" onClick={() => setOpen(false)}>
      <div className="confirm-dialog" onClick={e => e.stopPropagation()} style={{ minWidth: 360 }}>
        <div className="confirm-dialog-title">Keyboard Shortcuts</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <tbody>
            {SHORTCUTS.map(s => (
              <tr key={s.keys}>
                <td style={{ padding: '0.4rem 0.5rem', whiteSpace: 'nowrap' }}>
                  <kbd style={{
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 4,
                    padding: '0.15rem 0.4rem',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                  }}>{s.keys}</kbd>
                </td>
                <td style={{ padding: '0.4rem 0.5rem', color: 'var(--color-text-secondary)' }}>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="confirm-dialog-actions">
          <button className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
