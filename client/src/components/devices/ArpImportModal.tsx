import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  onClose: () => void;
  onSubmit: (text: string) => void;
  isPending: boolean;
}

export default function ArpImportModal({ onClose, onSubmit, isPending }: Props) {
  const [text, setText] = useState('');
  const trapRef = useFocusTrap();

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return createPortal(
    <div className="confirm-overlay" onClick={onClose}>
      <div
        className="confirm-dialog"
        ref={trapRef}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 600, width: '90vw' }}
      >
        <div className="confirm-dialog-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Import from ARP Output</span>
          <button className="btn btn-secondary btn-sm" onClick={onClose} style={{ padding: '0.15rem 0.5rem' }}>&times;</button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
          Paste the output of <code style={{ background: 'var(--color-hover-row)', padding: '0.1rem 0.35rem', borderRadius: '3px' }}>arp -avn</code> below.
          Devices will be matched by IP or MAC address.
        </p>

        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          rows={10}
          placeholder={'? (192.168.1.1) at aa:bb:cc:dd:ee:ff [ether] on eth0\n? (192.168.1.254) at 11:22:33:44:55:66 [ether] on eth0'}
          style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.8rem' }}
          autoFocus
        />

        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!text.trim() || isPending}
          >
            {isPending ? 'Analyzing...' : 'Analyze'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
