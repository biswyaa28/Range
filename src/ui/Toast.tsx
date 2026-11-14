import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { Haptics } from '@/engines';
import './Toast.css';

export interface ToastItem {
  id: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (message: string, actionLabel?: string, onAction?: () => void, durationMs?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

// Non-React callers (the global error handlers) reach the mounted host here.
type GlobalToastListener = (message: string) => void;
const globalToastListeners = new Set<GlobalToastListener>();

export function showGlobalToast(message: string): void {
  for (const listener of globalToastListeners) listener(message);
}

function subscribeGlobalToast(listener: GlobalToastListener): () => void {
  globalToastListeners.add(listener);
  return () => {
    globalToastListeners.delete(listener);
  };
}

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, actionLabel?: string, onAction?: () => void, durationMs = 5000) => {
      const id = String(Date.now() + Math.random());
      const item: ToastItem = { id, message, actionLabel, onAction, durationMs };

      setToasts((prev) => [...prev, item]);

      if (durationMs > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, durationMs);
      }
    },
    [dismissToast],
  );

  useEffect(() => subscribeGlobalToast((message) => showToast(message)), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div className="toasts-container" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.message}</span>
            {t.actionLabel && t.onAction && (
              <button
                type="button"
                className="toast-action-btn"
                onClick={() => {
                  Haptics.tap();
                  t.onAction?.();
                  dismissToast(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

