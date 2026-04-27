import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface Props {
  open?: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  closeOnOverlayClick?: boolean;
}

/**
 * Shared modal scaffolding: portal + overlay + focus trap + Escape to close +
 * optional overlay-click to close. Reuses the existing `.confirm-overlay` /
 * `.confirm-dialog` CSS so styling stays consistent with ConfirmDialog.
 *
 * Pass `title` to render the standard title bar; otherwise children render
 * flush. The dialog container stops click propagation so overlay-click-to-close
 * works without custom wiring in consumers.
 */
export default function Modal({
  open = true,
  onClose,
  title,
  children,
  className,
  style,
  closeOnOverlayClick = true,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-overlay"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={className ? `confirm-dialog ${className}` : 'confirm-dialog'}
        ref={trapRef}
        style={style}
        onClick={e => e.stopPropagation()}
      >
        {title !== undefined && <div className="confirm-dialog-title">{title}</div>}
        {children}
      </div>
    </div>,
    document.body
  );
}
