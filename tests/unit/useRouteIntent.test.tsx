import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, act } from '@testing-library/react';
import { sendIntent, useRouteIntent } from '@/hooks/useRouteIntent';

const Receiver: React.FC<{ name: string; onIntent: (detail: string) => void }> = ({
  name,
  onIntent,
}) => {
  useRouteIntent(name, onIntent);
  return null;
};

describe('useRouteIntent', () => {
  it('delivers an intent to a view that is already mounted', () => {
    const onIntent = vi.fn();
    render(<Receiver name="personalos:edit-task" onIntent={onIntent} />);

    act(() => sendIntent('personalos:edit-task', 't-1'));

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith('t-1');
  });

  it('delivers an intent sent before the view mounted', () => {
    const onIntent = vi.fn();

    act(() => sendIntent('personalos:edit-task', 't-2'));
    expect(onIntent).not.toHaveBeenCalled();

    render(<Receiver name="personalos:edit-task" onIntent={onIntent} />);

    expect(onIntent).toHaveBeenCalledTimes(1);
    expect(onIntent).toHaveBeenCalledWith('t-2');
  });

  it('delivers a parked intent only once', () => {
    const onIntent = vi.fn();

    act(() => sendIntent('personalos:edit-task', 't-3'));
    render(<Receiver name="personalos:edit-task" onIntent={onIntent} />);
    expect(onIntent).toHaveBeenCalledTimes(1);

    act(() => sendIntent('personalos:edit-task', 't-4'));
    expect(onIntent).toHaveBeenCalledTimes(2);
    expect(onIntent).toHaveBeenLastCalledWith('t-4');
  });

  it('does not deliver an intent meant for another view', () => {
    const onIntent = vi.fn();

    act(() => sendIntent('personalos:edit-task', 't-5'));
    render(<Receiver name="personalos:open-note" onIntent={onIntent} />);

    expect(onIntent).not.toHaveBeenCalled();
  });
});
