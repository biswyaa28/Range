import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Segmented } from '@/ui/Segmented';

describe('Segmented control', () => {
  const options = [
    { value: 'one', label: 'First' },
    { value: 'two', label: 'Second' },
    { value: 'three', label: 'Third' },
  ];

  it('renders options with correct active state', () => {
    render(<Segmented value="one" onChange={() => {}} options={options} />);
    const buttons = screen.getAllByRole('radio');
    expect(buttons).toHaveLength(3);
    expect(buttons[0]?.getAttribute('aria-checked')).toBe('true');
    expect(buttons[1]?.getAttribute('aria-checked')).toBe('false');
  });

  it('navigates with arrow keys', () => {
    const handleChange = vi.fn();
    const Wrapper = () => {
      const [val, setVal] = useState('one');
      return (
        <Segmented
          value={val}
          onChange={(v) => {
            setVal(v);
            handleChange(v);
          }}
          options={options}
        />
      );
    };

    render(<Wrapper />);
    const buttons = screen.getAllByRole('radio');
    buttons[0]?.focus();

    // ArrowRight moves to 'two'
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowRight' });
    expect(handleChange).toHaveBeenCalledWith('two');

    // ArrowLeft wraps around backwards to 'three'
    fireEvent.keyDown(buttons[0]!, { key: 'ArrowLeft' });
    expect(handleChange).toHaveBeenCalledWith('three');
  });
});
