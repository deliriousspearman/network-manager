import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';

type InputFn = (prompt: string, defaultValue?: string, title?: string) => Promise<string | null>;

const InputDialogContext = createContext<InputFn | null>(null);

export function useInputDialog(): InputFn {
  const fn = useContext(InputDialogContext);
  if (!fn) throw new Error('useInputDialog must be used within InputDialogProvider');
  return fn;
}

export function InputDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ prompt: string; title: string; defaultValue: string } | null>(null);
  const [value, setValue] = useState('');
  const resolveRef = useRef<((value: string | null) => void) | null>(null);

  const inputDialog = useCallback<InputFn>((prompt, defaultValue = '', title = 'Input') => {
    return new Promise<string | null>(resolve => {
      resolveRef.current = resolve;
      setValue(defaultValue);
      setState({ prompt, title, defaultValue });
    });
  }, []);

  const handleClose = useCallback((result: string | null) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState(null);
    setValue('');
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state, handleClose]);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (trimmed) handleClose(trimmed);
  }, [value, handleClose]);

  return (
    <InputDialogContext.Provider value={inputDialog}>
      {children}
      {state && createPortal(
        <div className="confirm-overlay" onClick={() => handleClose(null)}>
          <InputDialogInner
            state={state}
            value={value}
            onChange={setValue}
            onSubmit={handleSubmit}
            onClose={() => handleClose(null)}
          />
        </div>,
        document.body
      )}
    </InputDialogContext.Provider>
  );
}

function InputDialogInner({ state, value, onChange, onSubmit, onClose }: {
  state: { prompt: string; title: string };
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  return (
    <div className="confirm-dialog" ref={trapRef} onClick={e => e.stopPropagation()}>
      <div className="confirm-dialog-title">{state.title}</div>
      <div className="confirm-dialog-message">
        <div className="form-group">
          <input
            type="text"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSubmit(); }}
            placeholder={state.prompt}
          />
        </div>
      </div>
      <div className="confirm-dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={onSubmit} disabled={!value.trim()}>Confirm</button>
      </div>
    </div>
  );
}
