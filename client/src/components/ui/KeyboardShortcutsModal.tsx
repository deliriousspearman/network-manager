import { useEffect, useState } from 'react';
import Modal from './Modal';

type Shortcut = { keys: string; action: string };
type Section = { label: string; shortcuts: Shortcut[] };

const SECTIONS: Section[] = [
  {
    label: 'Global',
    shortcuts: [
      { keys: '?', action: 'Show keyboard shortcuts' },
      { keys: 'Ctrl / Cmd + K', action: 'Open global search' },
      { keys: 'Esc', action: 'Close open modal' },
    ],
  },
  {
    label: 'Diagram',
    shortcuts: [
      { keys: 'Ctrl + Z', action: 'Undo' },
      { keys: 'Ctrl + Shift + Z', action: 'Redo' },
      { keys: 'Delete / Backspace', action: 'Remove selected element' },
      { keys: 'Double-click annotation', action: 'Edit text' },
      { keys: 'Enter', action: 'Commit annotation edit' },
    ],
  },
  {
    label: 'Forms',
    shortcuts: [
      { keys: 'Ctrl / Cmd + Enter', action: 'Submit form' },
    ],
  },
  {
    label: 'Query',
    shortcuts: [
      { keys: 'Ctrl / Cmd + Enter', action: 'Run query' },
    ],
  },
];

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '?' && !['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Keyboard Shortcuts"
      style={{ minWidth: 420 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {SECTIONS.map(section => (
          <div key={section.label}>
            <div style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'var(--color-text-muted)',
              marginBottom: '0.35rem',
            }}>{section.label}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <tbody>
                {section.shortcuts.map(s => (
                  <tr key={s.keys}>
                    <td style={{ padding: '0.3rem 0.5rem 0.3rem 0', whiteSpace: 'nowrap' }}>
                      <kbd style={{
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 4,
                        padding: '0.15rem 0.4rem',
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                      }}>{s.keys}</kbd>
                    </td>
                    <td style={{ padding: '0.3rem 0.5rem', color: 'var(--color-text-secondary)' }}>{s.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <div className="confirm-dialog-actions">
        <button className="btn btn-secondary" onClick={() => setOpen(false)}>Close</button>
      </div>
    </Modal>
  );
}
