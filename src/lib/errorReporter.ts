import { showGlobalToast } from '@/ui/Toast';

const TOAST_COOLDOWN_MS = 30_000;
const MAX_LENGTH = 1_200;

let lastToastAt = 0;

/** Strip the personal bits (emails, tokens, query strings) before logging. */
export function redact(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(bearer|token|key|secret)\s*[:=]\s*\S+/gi, '$1=[redacted]')
    .replace(/([?&][^=\s]+)=[^&\s]*/g, '$1=[redacted]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]')
    .slice(0, MAX_LENGTH);
}

export function isBenignError(value: string): boolean {
  return /ResizeObserver loop (completed with undelivered notifications|limit exceeded)/i.test(
    value,
  );
}

function describe(reason: unknown): string {
  if (reason instanceof Error) {
    const name = reason.name || 'Error';
    return `${name}: ${reason.message}${reason.stack ? `\n${reason.stack}` : ''}`;
  }
  if (typeof reason === 'string') return reason;
  try {
    return JSON.stringify(reason) ?? String(reason);
  } catch {
    return String(reason);
  }
}

function report(source: string, reason: unknown): void {
  try {
    const text = describe(reason);
    if (isBenignError(text)) return;

    console.error(`[personalOS] ${source}: ${redact(text)}`);

    const now = Date.now();
    if (now - lastToastAt < TOAST_COOLDOWN_MS) return;
    lastToastAt = now;
    try {
      showGlobalToast('Something went wrong');
    } catch {
      // The toast host may not exist during a very early failure.
    }
  } catch {
    // Global handlers must never throw.
  }
}

/** Console-only reporting plus one throttled toast; returns an unsubscribe. */
export function installGlobalErrorHandlers(): () => void {
  const onError = (event: ErrorEvent): void => {
    report('Uncaught error', event.error ?? event.message);
  };
  const onRejection = (event: PromiseRejectionEvent): void => {
    report('Unhandled rejection', event.reason);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
