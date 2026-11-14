import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobalErrorHandlers } from '@/lib/errorReporter';
import { showGlobalToast } from '@/ui/Toast';

vi.mock('@/ui/Toast', () => ({ showGlobalToast: vi.fn() }));

function rejection(reason: unknown): Event {
  const event = new Event('unhandledrejection') as PromiseRejectionEvent;
  Object.defineProperty(event, 'reason', { value: reason });
  return event;
}

describe('global error handling', () => {
  let uninstall: () => void;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(showGlobalToast).mockClear();
    uninstall = installGlobalErrorHandlers();
  });

  afterEach(() => {
    uninstall();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('logs a redacted message and shows one throttled toast', () => {
    window.dispatchEvent(
      rejection(new Error('Failed for biswyaa@example.com?token=abc123')),
    );
    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = String(vi.mocked(console.error).mock.calls[0]?.[0]);
    expect(logged).toContain('[email]');
    expect(logged).not.toContain('biswyaa@example.com');
    expect(showGlobalToast).toHaveBeenCalledWith('Something went wrong');

    window.dispatchEvent(new ErrorEvent('error', { message: 'second failure' }));
    expect(console.error).toHaveBeenCalledTimes(2);
    expect(showGlobalToast).toHaveBeenCalledTimes(1);
  });

  it('ignores benign ResizeObserver noise', () => {
    window.dispatchEvent(
      new ErrorEvent('error', {
        message: 'ResizeObserver loop completed with undelivered notifications.',
      }),
    );
    expect(console.error).not.toHaveBeenCalled();
    expect(showGlobalToast).not.toHaveBeenCalled();
  });

  it('reports again after the cooldown', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2030, 0, 1, 12));
    window.dispatchEvent(rejection('first'));
    vi.setSystemTime(new Date(2030, 0, 1, 12, 1));
    window.dispatchEvent(rejection('second'));
    expect(showGlobalToast).toHaveBeenCalledTimes(2);
  });
});
