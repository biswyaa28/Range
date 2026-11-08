import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Block } from '@/domain/types';
import type { NoiseType } from '@/engines';
import { blockDoneOn, blocksForDate } from '@/domain/recurrence';
import { nowHM, todayISO } from '@/domain/dates';
import { fmtMS } from '@/domain/dates';
import { plural } from '@/domain/homeGreeting';
import { store, useStore } from '@/store';
import { Icon } from '@/ui/Icon';
import { useNoise, usePomodoro } from '@/hooks';
import { Haptics } from '@/engines';
import {
  closeFocusMode,
  isFocusModeOpen,
  subscribeFocusMode,
} from './focusModeBus';

function rangeStyle(value: number): React.CSSProperties {
  return { '--fill': `${Math.max(0, Math.min(100, value))}%` } as React.CSSProperties;
}

function defaultLabel(blocks: Block[]): string {
  const today = todayISO();
  const now = nowHM();
  const next = blocksForDate(blocks, today)
    .filter((block) => !blockDoneOn(block, today) && block.end > now)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return next[0]?.title || 'Deep work';
}

const CHANNELS: Array<{ id: NoiseType; label: string }> = [
  { id: 'white', label: 'White' },
  { id: 'pink', label: 'Pink' },
  { id: 'brown', label: 'Brown' },
];

interface DoneState {
  wasWork: boolean;
}

export const FocusMode: React.FC = () => {
  const open = useSyncExternalStore(subscribeFocusMode, isFocusModeOpen, isFocusModeOpen);
  const pomodoro = usePomodoro();
  const noise = useNoise();
  const sound = useStore((s) => s.settings.sound);
  const focusMinutes = useStore((s) => s.dayStats[todayISO()]?.focusMinutes ?? 0);

  const [label, setLabel] = useState('');
  const [done, setDone] = useState<DoneState | null>(null);
  const [idle, setIdle] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const labelRef = useRef<HTMLInputElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const idleTimer = useRef<number | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const wasFullscreenRef = useRef(false);
  const openRef = useRef(open);
  openRef.current = open;
  const doneRef = useRef<DoneState | null>(null);
  doneRef.current = done;

  const wake = useCallback(() => {
    setIdle(false);
    if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => {
      if (openRef.current && !doneRef.current) setIdle(true);
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
    },
    [],
  );

  // Enter: reset session-only state, request fullscreen, start preferred noise,
  // focus the primary action. Timer keeps running on exit.
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    setLabel(defaultLabel(store.get().blocks));
    setDone(null);
    pomodoro.setHoldOnComplete(true);
    Haptics.tap();
    const preferred = store.get().profile.noise;
    if (preferred && preferred !== 'none' && !noise.channels[preferred as NoiseType]) {
      noise.start(preferred as NoiseType);
    }
    try {
      const request = document.documentElement.requestFullscreen;
      if (request) {
        const result = request.call(document.documentElement);
        result?.catch?.(() => {});
      }
    } catch {
      // fixed overlay fallback
    }
    wasFullscreenRef.current = Boolean(document.fullscreenElement);
    wake();
    const timer = window.setTimeout(() => startRef.current?.focus({ preventScroll: true }), 50);
    return () => window.clearTimeout(timer);
    // Enter-only setup: changing engines must not reset the session label.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = useCallback(() => {
    pomodoro.setHoldOnComplete(false);
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen().catch(() => {});
      } catch {
        // ignore
      }
    }
    if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
    setIdle(false);
    closeFocusMode();
    const opener = openerRef.current;
    if (opener && opener.isConnected) {
      try {
        opener.focus({ preventScroll: true });
      } catch {
        // ignore
      }
    }
  }, [pomodoro]);

  // Session completion while Focus Mode is open shows the gentle done state.
  useEffect(() => {
    return pomodoro.onSessionComplete((info) => {
      if (!openRef.current) return;
      if (idleTimer.current != null) window.clearTimeout(idleTimer.current);
      setIdle(false);
      setDone({ wasWork: info.mode === 'work' });
      Haptics.tap();
    });
  }, [pomodoro]);

  // Fullscreen exits (including the Escape press native fullscreen swallows)
  // close the overlay too.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!openRef.current) return;
      if (wasFullscreenRef.current && !document.fullscreenElement) close();
      wasFullscreenRef.current = Boolean(document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [close]);

  const trap = useCallback((shift: boolean) => {
    const root = overlayRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button, input, select, a[href]'),
    ).filter((el) => !el.hasAttribute('disabled') && (el.offsetWidth > 0 || el.offsetHeight > 0));
    if (!focusables.length) return;
    const index = focusables.indexOf(document.activeElement as HTMLElement);
    const next = shift
      ? index <= 0
        ? focusables.length - 1
        : index - 1
      : index === focusables.length - 1
        ? 0
        : index + 1;
    focusables[next]?.focus({ preventScroll: true });
  }, []);

  // Keyboard while open: Esc exits, Tab stays inside, Space toggles.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Palette sits above Focus Mode and owns its own keys.
      if (document.querySelector('.pal')) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') return;
      wake();
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        trap(event.shiftKey);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select')) return;
      if (event.key === ' ') {
        if (target?.closest?.('button, [role="button"]')) return;
        event.preventDefault();
        event.stopPropagation();
        if (!doneRef.current) pomodoro.toggle();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, close, trap, wake, pomodoro]);

  // Minute-only aria-live announcements.
  const announcedMinute = Math.ceil(pomodoro.remainingMs / 60_000);
  const [live, setLive] = useState('');
  useEffect(() => {
    if (!open) return;
    if (done) return;
    setLive(
      pomodoro.mode === 'work'
        ? `${announcedMinute} min left in focus`
        : `${announcedMinute} min left in break`,
    );
  }, [announcedMinute, open, done, pomodoro.mode]);

  const startMode = (mode: 'work' | 'break') => {
    setDone(null);
    if (pomodoro.mode !== mode) pomodoro.skip();
    pomodoro.start();
    wake();
  };

  if (!open) return null;

  const remaining = Math.max(0, pomodoro.remainingMs);
  const total = Math.max(1, pomodoro.totalMs);
  const fraction = remaining / total;
  const activeTypes = CHANNELS.filter((channel) => noise.channels[channel.id]);
  const sleepLeft = noise.sleepEndMs
    ? Math.max(0, Math.ceil(noise.sleepLeftMs / 60_000))
    : 0;

  const cycleSleep = () => {
    const order = [15, 30, 60, 0];
    const current = order.indexOf(noise.sleepMin || 0);
    noise.setSleep(order[(current + 1) % order.length] ?? 0);
    wake();
  };

  return (
    <div
      ref={overlayRef}
      className={`fm${idle ? ' idle' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label="Focus mode"
      onPointerMove={wake}
      onPointerDown={wake}
      onWheel={wake}
      onTouchStart={wake}
    >
      <div className="fm-top fm-ui">
        <button type="button" className="fm-exit" onClick={close} data-fmact="exit">
          <Icon name="x" />
          Exit
        </button>
      </div>

      <div className="fm-main">
        <input
          ref={labelRef}
          className="fm-label"
          maxLength={60}
          value={label}
          aria-label="Session label"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setLabel(event.target.value)}
        />
        <div className="fm-ringwrap">
          <svg className="fm-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle className="fm-track" cx="110" cy="110" r="104" />
            <circle
              className="fm-arc"
              cx="110"
              cy="110"
              r="104"
              style={{ strokeDashoffset: 653.45 * (1 - fraction) }}
            />
          </svg>
          <div className="fm-center">
            <span className="fm-time" id="fm-time">
              {fmtMS(remaining)}
            </span>
            <span className="fm-mode" id="fm-mode">
              {pomodoro.mode === 'work' ? 'Focus' : 'Break'}
            </span>
          </div>
        </div>
        <div className="fm-acts fm-ui">
          <button
            ref={startRef}
            type="button"
            className="fm-btn primary"
            id="fm-start"
            data-fmact="start"
            onClick={() => {
              pomodoro.toggle();
              wake();
            }}
          >
            {pomodoro.running ? 'Pause' : 'Start'}
          </button>
          <button
            type="button"
            className="fm-btn"
            data-fmact="skip"
            onClick={() => {
              pomodoro.skip();
              wake();
            }}
          >
            Skip
          </button>
          <button
            type="button"
            className="fm-btn"
            data-fmact="plus5"
            onClick={() => {
              pomodoro.addMinutes(5);
              wake();
            }}
          >
            +5 min
          </button>
        </div>
      </div>

      <div className="fm-soundbar fm-ui">
        <div className="fm-sound">
          {CHANNELS.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`fm-chip${noise.channels[channel.id] ? ' on' : ''}`}
              data-fmnoise={channel.id}
              aria-pressed={noise.channels[channel.id]}
              onClick={() => {
                if (!noise.available) return;
                noise.toggle(channel.id);
                wake();
              }}
            >
              {channel.label}
            </button>
          ))}
          <label className="fm-volrow">
            <Icon name="speaker" />
            <input
              type="range"
              min={0}
              max={100}
              id="fm-master"
              value={sound.master}
              style={rangeStyle(sound.master)}
              aria-label="Master volume"
              onChange={(event) => {
                const value = Number(event.target.value);
                noise.setMaster(value);
                store.set((state) => {
                  state.settings.sound.master = value;
                });
              }}
            />
          </label>
          <button
            type="button"
            className={`fm-chip${noise.sleepEndMs ? ' on' : ''}`}
            data-fmact="sleep"
            onClick={cycleSleep}
          >
            {noise.sleepEndMs ? `Sleep · ${sleepLeft} min` : 'Sleep · off'}
          </button>
        </div>
        {activeTypes.length > 0 && (
          <div className="fm-vols" id="fm-vols">
            {activeTypes.map((channel) => (
              <label className="fm-volrow" key={channel.id}>
                <span>{channel.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={sound[channel.id]}
                  style={rangeStyle(sound[channel.id])}
                  data-fmvol={channel.id}
                  aria-label={`${channel.label.toLowerCase()} noise volume`}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    noise.setVolume(channel.id, value);
                    store.set((state) => {
                      state.settings.sound[channel.id] = value;
                    });
                  }}
                />
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="fm-done" hidden={!done}>
        <div>
          <h2 id="fm-done-title">{done?.wasWork ? 'Session complete' : 'Break over'}</h2>
          <p className="fm-done-sub" id="fm-done-sub">
            {done?.wasWork
              ? `${plural(focusMinutes, 'minute')} of focus logged today`
              : 'Ready for another session?'}
          </p>
          <div className="fm-acts">
            <button
              type="button"
              className="fm-btn primary"
              id="fm-next1"
              data-fmact="next1"
              onClick={() => startMode(done?.wasWork ? 'break' : 'work')}
            >
              {done?.wasWork
                ? `Next break · ${pomodoro.breakMin} min`
                : `Next session · ${pomodoro.workMin} min`}
            </button>
            <button
              type="button"
              className="fm-btn"
              id="fm-next2"
              data-fmact="next2"
              onClick={() => startMode(done?.wasWork ? 'work' : 'break')}
            >
              {done?.wasWork ? 'Next session' : 'Next break'}
            </button>
          </div>
        </div>
      </div>

      <span className="sr-only" id="fm-live" aria-live="polite">
        {live}
      </span>
    </div>
  );
};
