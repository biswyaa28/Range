import { useEffect } from 'react';
import { ensureDayStats } from '@/domain/stats';
import { todayISO } from '@/domain/dates';
import { store } from '@/store';
import { useToast } from '@/ui/Toast';
import { useNoise, usePomodoro } from '@/hooks';
import { Haptics, noise, pomodoro } from '@/engines';

/**
 * Wires the headless engines to app concerns once per app shell:
 * settings sync, day-stat logging, toast/chime feedback and a user-gesture
 * audio context when the timer starts.
 */
export function useFocusRuntime(): void {
  const toast = useToast();
  // Subscribing here also keeps the timer ticking on every route.
  usePomodoro();
  useNoise();

  useEffect(() => {
    pomodoro.setCallbacks({
      onStart: () => {
        noise.ensureContext();
      },
      onSessionEnd: (info) => {
        if (info.mode === 'work') {
          store.set((state) => {
            const day = ensureDayStats(state.dayStats, todayISO());
            day.focusMinutes += info.minutes;
          });
          toast.showToast('Focus session complete — take a break');
          Haptics.success();
          noise.chime(3);
        } else {
          toast.showToast('Break over — back to work');
          Haptics.tap();
          noise.chime(1);
        }
      },
    });
    return () => {
      pomodoro.setCallbacks({});
    };
  }, [toast]);
}
