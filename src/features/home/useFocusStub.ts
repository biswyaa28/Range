import { useEffect, useState } from 'react';

/**
 * Local focus timer used by the Home focus card.
 *
 * TODO(focus-engine): replace this stub with the real headless focus engine
 * (src/engines) once it exists. The component only depends on this interface,
 * so the swap should not touch the card markup.
 */
export interface HomeFocusController {
  remainingMs: number;
  totalMs: number;
  running: boolean;
  mode: 'work' | 'break';
  toggle: () => void;
}

export function useFocusStub(workMinutes: number, breakMinutes: number): HomeFocusController {
  const workMs = Math.max(1, workMinutes) * 60_000;
  const breakMs = Math.max(1, breakMinutes) * 60_000;
  const [mode, setMode] = useState<'work' | 'break'>('work');
  const [running, setRunning] = useState(false);
  const [remainingMs, setRemainingMs] = useState(workMs);

  const totalMs = mode === 'work' ? workMs : breakMs;

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => {
      setRemainingMs((previous) => {
        const next = previous - 1000;
        if (next > 0) return next;
        setMode((current) => (current === 'work' ? 'break' : 'work'));
        return mode === 'work' ? breakMs : workMs;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [breakMs, mode, running, workMs]);

  useEffect(() => {
    if (!running) {
      setRemainingMs(mode === 'work' ? workMs : breakMs);
    }
  }, [breakMs, mode, running, workMs]);

  return {
    remainingMs: Math.max(0, remainingMs),
    totalMs,
    running,
    mode,
    toggle: () => setRunning((value) => !value),
  };
}
