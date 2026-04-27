import { createContext, useContext, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

type ToastType = 'success' | 'error' | 'info';
interface ToastAction { label: string; onClick: () => void }
type ShowToast = (message: string, type?: ToastType, action?: ToastAction) => void;

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

const ToastContext = createContext<ShowToast | null>(null);

export function useToast(): ShowToast {
  const fn = useContext(ToastContext);
  if (!fn) throw new Error('useToast must be used within ToastProvider');
  return fn;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ShowToast>((message, type = 'info', action) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, action }]);
    // Toasts with an action stay visible longer so users have time to react.
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), action ? 8000 : 4000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {createPortal(
        toasts.length > 0 ? (
          <div
            className="toast-container"
            role="status"
            aria-live="polite"
            aria-atomic="false"
          >
            {toasts.map(t => (
              <div
                key={t.id}
                className={`toast toast-${t.type}`}
                role={t.type === 'error' ? 'alert' : undefined}
              >
                <span className="toast-message">{t.message}</span>
                {t.action && (
                  <button
                    type="button"
                    className="toast-action"
                    onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  >
                    {t.action.label}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null,
        document.body
      )}
    </ToastContext.Provider>
  );
}
