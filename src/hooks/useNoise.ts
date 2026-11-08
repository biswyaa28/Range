import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { noise, type NoiseSnapshot, type NoiseType } from '@/engines';
import { useStore } from '@/store';

export interface NoiseController extends NoiseSnapshot {
  ensureContext: () => AudioContext | null;
  toggle: (type: NoiseType) => boolean;
  start: (type: NoiseType) => boolean;
  stop: (type: NoiseType) => void;
  stopAll: () => void;
  setVolume: (type: NoiseType, value: number) => void;
  setMaster: (value: number) => void;
  setSleep: (minutes: number) => void;
  cancelSleep: () => void;
  chime: (times?: number) => void;
  sleepLeftMs: number;
}

/** Subscribes to the shared audio singleton and drives its sleep countdown. */
export function useNoise(): NoiseController {
  const volumes = useStore((s) => s.settings.sound);
  const snapshot = useSyncExternalStore(
    noise.subscribe,
    noise.getSnapshot,
    noise.getSnapshot,
  );

  useEffect(() => {
    noise.setVolumes({ white: volumes.white, pink: volumes.pink, brown: volumes.brown });
    noise.setMaster(volumes.master);
  }, [volumes.white, volumes.pink, volumes.brown, volumes.master]);

  useEffect(() => {
    if (!snapshot.sleepEndMs) return;
    noise.tickSleep();
    const timer = window.setInterval(() => noise.tickSleep(), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot.sleepEndMs]);

  const ensureContext = useCallback(() => noise.ensureContext(), []);
  const toggle = useCallback((type: NoiseType) => noise.toggle(type), []);
  const start = useCallback((type: NoiseType) => noise.startChannel(type), []);
  const stop = useCallback((type: NoiseType) => noise.stopChannel(type), []);
  const stopAll = useCallback(() => noise.stopAll(), []);
  const setVolume = useCallback(
    (type: NoiseType, value: number) => noise.setVolume(type, value),
    [],
  );
  const setMaster = useCallback((value: number) => noise.setMaster(value), []);
  const setSleep = useCallback((minutes: number) => noise.setSleep(minutes), []);
  const cancelSleep = useCallback(() => noise.cancelSleep(), []);
  const chime = useCallback((times = 1) => noise.chime(times), []);

  return useMemo(
    () => ({
      ...snapshot,
      sleepLeftMs: snapshot.sleepEndMs
        ? Math.max(0, snapshot.sleepEndMs - Date.now())
        : 0,
      ensureContext,
      toggle,
      start,
      stop,
      stopAll,
      setVolume,
      setMaster,
      setSleep,
      cancelSleep,
      chime,
    }),
    [
      snapshot,
      ensureContext,
      toggle,
      start,
      stop,
      stopAll,
      setVolume,
      setMaster,
      setSleep,
      cancelSleep,
      chime,
    ],
  );
}
