import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CheatSheet } from '@/features/shortcuts/CheatSheet';
import { SHORTCUT_DEFINITIONS, SHORTCUT_GROUPS } from '@/hooks/useShortcuts';

describe('CheatSheet', () => {
  it('generates every shortcut group from the registry', () => {
    expect(SHORTCUT_GROUPS.map((group) => group.title)).toEqual([
      'Go',
      'Create',
      'Focus',
      'Plan calendar',
      'General',
    ]);
    expect(SHORTCUT_GROUPS.flatMap((group) => group.rows)).toHaveLength(
      SHORTCUT_DEFINITIONS.length,
    );
  });

  it('renders each group and keycap, and closes from the button', () => {
    const onClose = vi.fn();
    const { container } = render(<CheatSheet open onClose={onClose} />);

    expect(screen.getByText('Keyboard shortcuts')).toBeDefined();
    const headings = Array.from(container.querySelectorAll('.cs-grid h3')).map(
      (heading) => heading.textContent,
    );
    for (const group of SHORTCUT_GROUPS) {
      expect(headings).toContain(group.title);
    }
    expect(screen.getByText('Command palette')).toBeDefined();
    expect(screen.getByText('Ctrl')).toBeDefined();
    expect(screen.getByText('K')).toBeDefined();
    expect(screen.getByText('This cheat sheet')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders nothing when closed', () => {
    render(<CheatSheet open={false} onClose={() => {}} />);
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull();
  });
});
