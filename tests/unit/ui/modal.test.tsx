import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '@/ui/Modal';
import { Button } from '@/ui/Button';

describe('Modal component', () => {
  it('renders content when open and supports close', () => {
    const handleClose = vi.fn();
    const { rerender } = render(
      <Modal open={false} onClose={handleClose} title="Test dialog">
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.queryByText('Modal body content')).toBeNull();

    rerender(
      <Modal open={true} onClose={handleClose} title="Test dialog">
        <p>Modal body content</p>
      </Modal>,
    );

    expect(screen.getByText('Modal body content')).toBeDefined();
    expect(screen.getByRole('dialog')).toBeDefined();
  });

  it('closes on Escape key press', () => {
    const handleClose = vi.fn();
    render(
      <Modal open={true} onClose={handleClose} title="Test dialog">
        <p>Body</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('traps focus inside the modal with Tab navigation', () => {
    render(
      <Modal open={true} onClose={() => {}} title="Test dialog">
        <button type="button">First action</button>
        <button type="button">Second action</button>
      </Modal>,
    );

    const closeBtn = screen.getByLabelText('Close dialog');
    const firstBtn = screen.getByText('First action');
    const secondBtn = screen.getByText('Second action');

    // Simulate tab cycle on last element
    secondBtn.focus();
    fireEvent.keyDown(secondBtn, { key: 'Tab', shiftKey: false });
    expect(document.activeElement).toBe(closeBtn);

    // Simulate shift+tab on first element
    closeBtn.focus();
    fireEvent.keyDown(closeBtn, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(secondBtn);

    firstBtn.focus();
    expect(document.activeElement).toBe(firstBtn);
  });

  it('returns focus to trigger element when closed', () => {
    const Wrapper = () => {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <Button onClick={() => setOpen(true)}>Open trigger</Button>
          <Modal open={open} onClose={() => setOpen(false)} title="Test dialog">
            <p>Content</p>
          </Modal>
        </div>
      );
    };

    render(<Wrapper />);
    const trigger = screen.getByText('Open trigger');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeDefined();

    // Close via Esc
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
