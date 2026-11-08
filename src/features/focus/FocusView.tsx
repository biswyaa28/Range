import React, { useState } from 'react';
import type { NoiseType } from '@/engines';
import { MAX_BREAK_MIN, MAX_WORK_MIN, MIN_BREAK_MIN, MIN_WORK_MIN } from '@/engines';
import { fmtMS, todayISO } from '@/domain/dates';
import { effectivePomodoroDurations } from '@/domain/focusPresets';
import { store, useStore } from '@/store';
import { Segmented } from '@/ui/Segmented';
import { Icon } from '@/ui/Icon';
import { useToast } from '@/ui/Toast';
import { useNoise, usePomodoro } from '@/hooks';
import { openFocusMode } from './focusModeBus';
import { PrompterPanel } from './PrompterPanel';

type FocusTab = 'pomodoro' | 'sounds' | 'prompter';

function rangeStyle(value: number): React.CSSProperties {
  const pct = Math.max(0, Math.min(100, value));
  return { '--fill': `${pct}%` } as React.CSSProperties;
}

const CHANNELS: Array<{ id: NoiseType; label: string }> = [
  { id: 'white', label: 'White' },
  { id: 'pink', label: 'Pink' },
  { id: 'brown', label: 'Brown' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const PomodoroPanel: React.FC = () => {
  const pomo = usePomodoro();
  const focusMinutes = useStore((s) => s.dayStats[todayISO()]?.focusMinutes ?? 0);
  const focusStyle = useStore((s) => s.profile.focusStyle);
  const saved = useStore((s) => s.settings.pomodoro);
  const { work, break: breakMin } = effectivePomodoroDurations(focusStyle, saved);
  const sessions = focusMinutes
    ? Math.round(focusMinutes / Math.max(1, pomo.workMin))
    : 0;
  const remaining = Math.max(0, pomo.remainingMs);
  const fraction = pomo.totalMs ? remaining / pomo.totalMs : 0;

  const bumpDuration = (key: 'work' | 'break', delta: number) => {
    store.set((state) => {
      const min = key === 'work' ? MIN_WORK_MIN : MIN_BREAK_MIN;
      const max = key === 'work' ? MAX_WORK_MIN : MAX_BREAK_MIN;
      // Lock in the preset baseline before applying the edit so the style
      // default cannot override the new pair on the next render.
      const current = effectivePomodoroDurations(
        state.profile.focusStyle,
        state.settings.pomodoro,
      );
      const next = { ...current, [key]: clamp(current[key] + delta, min, max) };
      state.settings.pomodoro.work = next.work;
      state.settings.pomodoro.break = next.break;
    });
  };

  return (
    <div className="focus-grid">
      <section className={`panel pomo-panel${pomo.mode === 'break' ? ' break-mode' : ''}`}>
        <div className="panel-head">
          <h2>Pomodoro</h2>
          <span className="chip" id="pomo-mode">
            {pomo.mode === 'work' ? 'Work' : 'Break'}
          </span>
        </div>
        <div className="pomo-wrap">
          <svg className="pomo-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle className="pomo-track" cx="110" cy="110" r="96" />
            <circle
              className="pomo-arc"
              cx="110"
              cy="110"
              r="96"
              style={{ strokeDashoffset: 603.2 * (1 - fraction) }}
            />
          </svg>
          <div className="pomo-center">
            <div className="pomo-time" id="pomo-time">
              {fmtMS(remaining)}
            </div>
            <div className="pomo-sub" id="pomo-sub">
              {pomo.running
                ? pomo.mode === 'work'
                  ? 'Focus in progress'
                  : 'Break running'
                : 'Ready'}
            </div>
          </div>
        </div>
        <div className="row center">
          <button
            type="button"
            className={`btn big ${pomo.running ? 'yellow' : 'green'}`}
            id="pomo-start-btn"
            onClick={pomo.toggle}
          >
            {pomo.running ? 'Pause' : 'Start'}
          </button>
          <button type="button" className="btn" onClick={pomo.reset}>
            Reset
          </button>
          <button type="button" className="btn" onClick={pomo.skip}>
            Skip
          </button>
          <button type="button" className="btn blue" onClick={openFocusMode}>
            <Icon name="bolt" size={15} />
            Enter focus mode
          </button>
        </div>
        <div className="pomo-durs">
          <div className="dur">
            <span>Work</span>
            <span className="stepper">
              <button
                type="button"
                onClick={() => bumpDuration('work', -5)}
                aria-label="Less work minutes"
              >
                −
              </button>
              <span id="pomo-work-v">{work}</span>
              <button
                type="button"
                onClick={() => bumpDuration('work', 5)}
                aria-label="More work minutes"
              >
                +
              </button>
            </span>
            <span>min</span>
          </div>
          <div className="dur">
            <span>Break</span>
            <span className="stepper">
              <button
                type="button"
                onClick={() => bumpDuration('break', -5)}
                aria-label="Less break minutes"
              >
                −
              </button>
              <span id="pomo-break-v">{breakMin}</span>
              <button
                type="button"
                onClick={() => bumpDuration('break', 5)}
                aria-label="More break minutes"
              >
                +
              </button>
            </span>
            <span>min</span>
          </div>
        </div>
        <div className="pomo-stats">
          Today: <b id="pomo-focus-today">{focusMinutes}</b> min focus · ≈
          <b id="pomo-sessions">{sessions}</b> sessions
        </div>
      </section>

      <section className="panel sound-panel">
        <div className="panel-head">
          <h2>Sound machine</h2>
          <span className="chip">
            <Icon name="speaker" size={13} /> Web Audio · no files
          </span>
        </div>
        <SoundsControls />
      </section>
    </div>
  );
};

const SoundsControls: React.FC = () => {
  const noise = useNoise();
  const toast = useToast();
  const profileNoise = useStore((s) => s.profile.noise);
  const sound = useStore((s) => s.settings.sound);

  const toggle = (type: NoiseType) => {
    if (!noise.available) {
      toast.showToast('Audio is not available in this browser');
      return;
    }
    noise.toggle(type);
  };

  const persistVolume = (type: NoiseType, value: number) => {
    noise.setVolume(type, value);
    store.set((state) => {
      state.settings.sound[type] = value;
    });
  };

  const persistMaster = (value: number) => {
    noise.setMaster(value);
    store.set((state) => {
      state.settings.sound.master = value;
    });
  };

  return (
    <>
      {CHANNELS.map((channel) => (
        <div className="channel" key={channel.id}>
          <button
            type="button"
            className={`noise-btn${noise.channels[channel.id] ? ' on' : ''}${
              profileNoise === channel.id ? ' def' : ''
            }`}
            onClick={() => toggle(channel.id)}
            aria-pressed={noise.channels[channel.id]}
          >
            <span className="nb-row">
              <span className="nb-name">{channel.label}</span>
              <span className="nb-state">{noise.channels[channel.id] ? 'On' : 'Off'}</span>
            </span>
            <span className="eq" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
          </button>
          <input
            type="range"
            min={0}
            max={100}
            value={sound[channel.id]}
            style={rangeStyle(sound[channel.id])}
            aria-label={`${channel.label.toLowerCase()} noise volume`}
            onPointerDown={() => {
              if (noise.available && !noise.channels[channel.id]) noise.start(channel.id);
            }}
            onChange={(event) => persistVolume(channel.id, Number(event.target.value))}
          />
          <span className="vol">{sound[channel.id]}</span>
        </div>
      ))}
      <div className="channel">
        <span className="dur" style={{ fontWeight: 800 }}>
          Master
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={sound.master}
          style={rangeStyle(sound.master)}
          aria-label="Master volume"
          onChange={(event) => persistMaster(Number(event.target.value))}
        />
        <span className="vol">{sound.master}</span>
      </div>
      <div className="sleep-row">
        <span className="lbl">Sleep timer</span>
        {[15, 30, 60].map((minutes) => (
          <button
            key={minutes}
            type="button"
            className={`btn sm sleep-btn${noise.sleepMin === minutes ? ' active' : ''}`}
            onClick={() => noise.setSleep(minutes)}
          >
            {minutes} min
          </button>
        ))}
        <button
          type="button"
          className={`btn sm sleep-btn${noise.sleepMin ? '' : ' yellow'}`}
          onClick={() => noise.cancelSleep()}
        >
          Off
        </button>
        {noise.sleepEndMs > 0 && (
          <span className="sleep-left">{fmtMS(noise.sleepLeftMs)}</span>
        )}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>
        Noise is synthesized live in your browser — white, pink (Paul Kellet filter) and
        brown (leaky integrator). Nothing is downloaded, and audio only starts after you
        click.
      </p>
    </>
  );
};

export const FocusView: React.FC = () => {
  const [tab, setTab] = useState<FocusTab>('pomodoro');

  return (
    <div className="view-content">
      <div className="view-head">
        <h1 id="focus-start" tabIndex={-1}>
          Focus
        </h1>
        <div className="rule" />
        <p className="hint" style={{ marginTop: 12 }}>
          A quiet timer, live noise and a teleprompter — all local, all offline.
        </p>
      </div>
      <div style={{ marginBottom: 18 }}>
        <Segmented<FocusTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'pomodoro', label: 'Pomodoro' },
            { value: 'sounds', label: 'Sounds' },
            { value: 'prompter', label: 'Prompter' },
          ]}
          aria-label="Focus panels"
        />
      </div>
      {tab === 'pomodoro' && <PomodoroPanel />}
      {tab === 'sounds' && (
        <section className="panel sound-panel">
          <div className="panel-head">
            <h2>Sound machine</h2>
            <span className="chip">
              <Icon name="speaker" size={13} /> Web Audio · no files
            </span>
          </div>
          <SoundsControls />
        </section>
      )}
      {tab === 'prompter' && <PrompterPanel />}
    </div>
  );
};
