import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { pomodoro, type PomodoroSnapshot, type PomodoroSessionEnd } from '@/engines';
import { effectivePomodoroDurations } from '@/domain/focusPresets';
import { useStore } from '@/store';

export interface PomodoroController extends PomodoroSnapshot {
  start: () => void;
  pause: () => void;
  toggle: () => void;
  reset: () => void;
  skip: () => void;
  addMinutes: (minutes: number) => void;
  setHoldOnComplete: (hold: boolean) => void;
  onSessionComplete: (listener: (info: PomodoroSessionEnd) => void) => () => void;
}

/**
 * Subscribes to the shared Pomodoro singleton and keeps it in sync with
 * settings. The interval only asks the engine to apply elapsed wall time;
 * it never counts ticks, so throttling cannot skew the timer.
 */
export function usePomodoro(): PomodoroController {
  const focusStyle = useStore((s) => s.profile.focusStyle);
  const savedWork = useStore((s) => s.settings.pomodoro.work);
  const savedBreak = useStore((s) => s.settings.pomodoro.break);
  const { work, break: breakMin } = effectivePomodoroDurations(focusStyle, {
    work: savedWork,
    break: savedBreak,
  });
  const snapshot = useSyncExternalStore(
    pomodoro.subscribe,
    pomodoro.getSnapshot,
    pomodoro.getSnapshot,
  );

  useEffect(() => {
    pomodoro.setDurations(work, breakMin);
  }, [work, breakMin]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      pomodoro.tick();
    }, 250);
    return () => window.clearInterval(timer);
  }, []);

  const start = useCallback(() => pomodoro.start(), []);
  const pause = useCallback(() => pomodoro.pause(), []);
  const toggle = useCallback(() => pomodoro.toggle(), []);
  const reset = useCallback(() => pomodoro.reset(), []);
  const skip = useCallback(() => pomodoro.skip(), []);
  const addMinutes = useCallback((minutes: number) => pomodoro.addMinutes(minutes), []);
  const setHoldOnComplete = useCallback(
    (hold: boolean) => pomodoro.setHoldOnComplete(hold),
    [],
  );
  const onSessionComplete = useCallback(
    (listener: (info: PomodoroSessionEnd) => void) => pomodoro.onSessionComplete(listener),
    [],
  );

  return useMemo(
    () => ({
      ...snapshot,
      start,
      pause,
      toggle,
      reset,
      skip,
      addMinutes,
      setHoldOnComplete,
      onSessionComplete,
    }),
    [
      snapshot,
      start,
      pause,
      toggle,
      reset,
      skip,
      addMinutes,
      setHoldOnComplete,
      onSessionComplete,
    ],
  );
}
