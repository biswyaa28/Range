import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/ui/Toast';

const TestComponent: React.FC<{ onUndo?: () => void }> = ({ onUndo }) => {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast.showToast('Item deleted', onUndo ? 'Undo' : undefined, onUndo, 5000)
      }
    >
      Trigger toast
    </button>
  );
};

describe('Toast component', () => {
  it('renders a toast and invokes the undo action', () => {
    const handleUndo = vi.fn();
    render(
      <ToastProvider>
        <TestComponent onUndo={handleUndo} />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Trigger toast'));
    expect(screen.getByText('Item deleted')).toBeDefined();

    const undoBtn = screen.getByText('Undo');
    expect(undoBtn).toBeDefined();

    fireEvent.click(undoBtn);
    expect(handleUndo).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Item deleted')).toBeNull();
  });

  it('automatically dismisses after duration', () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Trigger toast'));
    expect(screen.getByText('Item deleted')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(5100);
    });

    expect(screen.queryByText('Item deleted')).toBeNull();
    vi.useRealTimers();
  });

  it('allows immediate manual dismissal via the close button', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText('Trigger toast'));
    expect(screen.getByText('Item deleted')).toBeDefined();

    const dismissBtn = screen.getByLabelText('Dismiss notification');
    fireEvent.click(dismissBtn);
    expect(screen.queryByText('Item deleted')).toBeNull();
  });
});
