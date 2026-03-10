import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

type ConfirmFn = (message: string, title?: string) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export function useConfirmDialog(): ConfirmFn {
  const fn = useContext(ConfirmDialogContext);
  if (!fn) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  return fn;
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; title: string } | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((message, title = 'Confirm') => {
    return new Promise<boolean>(resolve => {
      resolveRef.current = resolve;
      setState({ message, title });
    });
  }, []);

  const handleClose = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, handleClose]);

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {state && createPortal(
        <div className="confirm-overlay" onClick={() => handleClose(false)}>
          <div className="confirm-dialog" onClick={e => e.stopPropagation()}>
            <div className="confirm-dialog-title">{state.title}</div>
            <div className="confirm-dialog-message">{state.message}</div>
            <div className="confirm-dialog-actions">
              <button className="btn btn-secondary" onClick={() => handleClose(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={() => handleClose(true)} autoFocus>Confirm</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </ConfirmDialogContext.Provider>
  );
}
