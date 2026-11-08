import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { store, useStore } from '@/store';
import { useToast } from '@/ui/Toast';
import { Icon } from '@/ui/Icon';

export const PROMPTER_SAMPLE =
  'Opening remarks — demo script\n\n' +
  'Good morning, everyone.\n\n' +
  'Three years ago I set out to answer one question: what would it feel like if my calendar, my notes, and my deadlines all lived in one place — and actually talked to each other?\n\n' +
  'Today, that question ships as a single file.\n\n' +
  'No accounts. No servers. No sync spinner. Everything you just saw runs on this machine, offline, in one HTML document.\n\n' +
  'Open it tomorrow, and it remembers. Close it for a month, and it waits.\n\n' +
  'Your data is yours. Your attention is yours.\n\n' +
  'Thank you.';

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

interface ReadingOverlayProps {
  text: string;
  initialSize: number;
  initialSpeed: number;
  onClose: () => void;
  onSize: (size: number) => void;
  onSpeed: (speed: number) => void;
}

const ReadingOverlay: React.FC<ReadingOverlayProps> = ({
  text,
  initialSize,
  initialSpeed,
  onClose,
  onSize,
  onSpeed,
}) => {
  const [playing, setPlaying] = useState(false);
  const [size, setSize] = useState(initialSize);
  const [speed, setSpeed] = useState(initialSpeed);
  const [mirror, setMirror] = useState(false);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const playBtnRef = useRef<HTMLButtonElement | null>(null);
  const offsetRef = useRef(0);
  const lastRef = useRef(0);
  const rafRef = useRef(0);

  const live = useRef({ playing, size, speed, mirror });
  live.current = { playing, size, speed, mirror };

  const close = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (document.fullscreenElement) {
      try {
        document.exitFullscreen().catch(() => {});
      } catch {
        // ignore
      }
    }
    onClose();
  }, [onClose]);

  useEffect(() => {
    try {
      const request = document.documentElement.requestFullscreen;
      if (request) request.call(document.documentElement).catch(() => {});
    } catch {
      // fullscreen is a progressive enhancement; the fixed overlay is the fallback
    }
    offsetRef.current = 0;
    lastRef.current = performance.now();
    const loop = (now: number) => {
      rafRef.current = requestAnimationFrame(loop);
      const stage = stageRef.current;
      const node = textRef.current;
      if (!stage || !node) return;
      const current = live.current;
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      if (current.playing) {
        offsetRef.current += (current.speed * current.size * dt) / 10;
        if (offsetRef.current > node.offsetHeight + stage.offsetHeight) {
          offsetRef.current = 0;
        }
      }
      const base = stage.offsetHeight * 0.8;
      node.style.transform = `translate(-50%, ${base - offsetRef.current}px)`;
    };
    rafRef.current = requestAnimationFrame(loop);
    const focusTimer = window.setTimeout(() => playBtnRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(focusTimer);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const bumpSize = useCallback(
    (delta: number) => {
      const next = Math.max(24, Math.min(96, size + delta));
      setSize(next);
      onSize(next);
    },
    [size, onSize],
  );

  const bumpSpeed = useCallback(
    (delta: number) => {
      const next = Math.max(1, Math.min(10, speed + delta));
      setSpeed(next);
      onSpeed(next);
    },
    [speed, onSpeed],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // Typing fields own their keys; prompter buttons do not.
      if (target?.closest?.('input, textarea, select')) return;
      const key = event.key;
      if (key === ' ') {
        event.preventDefault();
        setPlaying((value) => !value);
      } else if (key === '+' || key === '=') {
        event.preventDefault();
        bumpSize(8);
      } else if (key === '-' || key === '_') {
        event.preventDefault();
        bumpSize(-8);
      } else if (key === 'ArrowRight') {
        event.preventDefault();
        bumpSpeed(1);
      } else if (key === 'ArrowLeft') {
        event.preventDefault();
        bumpSpeed(-1);
      } else if (key === 'm' || key === 'M') {
        event.preventDefault();
        setMirror((value) => !value);
      } else if (key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [bumpSize, bumpSpeed, close]);

  return (
    <div className="pr-overlay" role="dialog" aria-modal="true" aria-label="Prompter reading mode">
      <div className="pr-hint">SPACE PLAY/PAUSE · +/− SIZE · ←→ SPEED · M MIRROR · ESC EXIT</div>
      <div className={`pr-stage${mirror ? ' mirror' : ''}`} ref={stageRef}>
        <div className="pr-mark left" aria-hidden="true" />
        <div className="pr-mark right" aria-hidden="true" />
        <div
          className="pr-text"
          ref={textRef}
          style={{ fontSize: `${size}px` }}
        >
          {text || <span className="pr-empty">PASTE A SCRIPT FIRST — EXIT AND WRITE ONE</span>}
        </div>
      </div>
      <div className="pr-controls">
        <button
          ref={playBtnRef}
          type="button"
          className={`pr-btn play${playing ? ' playing' : ''}`}
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? 'Pause scrolling' : 'Play scrolling'}
        >
          <Icon name={playing ? 'pause' : 'play'} />
        </button>
        <div className="pr-group">
          <button type="button" className="pr-btn" onClick={() => bumpSize(-8)} aria-label="Smaller text">
            A−
          </button>
          <span>{size} px</span>
          <button type="button" className="pr-btn" onClick={() => bumpSize(8)} aria-label="Larger text">
            A+
          </button>
        </div>
        <div className="pr-group">
          <button type="button" className="pr-btn" onClick={() => bumpSpeed(-1)} aria-label="Slower">
            S−
          </button>
          <span>Speed {speed}</span>
          <button type="button" className="pr-btn" onClick={() => bumpSpeed(1)} aria-label="Faster">
            S+
          </button>
        </div>
        <button
          type="button"
          className={`pr-btn${mirror ? ' on' : ''}`}
          onClick={() => setMirror((value) => !value)}
          aria-label="Mirror flip"
          aria-pressed={mirror}
        >
          <Icon name="mirror" />
        </button>
        <button type="button" className="pr-btn exit" onClick={close} aria-label="Exit reading mode">
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
};

export const PrompterPanel: React.FC = () => {
  const saved = useStore((s) => s.settings.prompter);
  const toast = useToast();
  const [text, setText] = useState(saved.text);
  const [reading, setReading] = useState(false);
  const [size, setSize] = useState(saved.size || 48);
  const [speed, setSpeed] = useState(saved.speed || 3);

  const words = useMemo(() => wordCount(text), [text]);

  const save = (next: { text?: string; size?: number; speed?: number }) => {
    store.set((state) => {
      if (typeof next.text === 'string') state.settings.prompter.text = next.text;
      if (typeof next.size === 'number') state.settings.prompter.size = next.size;
      if (typeof next.speed === 'number') state.settings.prompter.speed = next.speed;
    });
  };

  const openReading = () => {
    save({ text, size, speed });
    setReading(true);
  };

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Script</h2>
          <span className="chip">{words} words</span>
        </div>
        <textarea
          className="p-textarea"
          value={text}
          placeholder="Paste or type your script here…"
          aria-label="Prompter script"
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            save({ text: next });
          }}
        />
        <div className="row">
          <button type="button" className="btn green big" onClick={openReading}>
            <Icon name="play" size={16} />
            Open reading mode
          </button>
          <button
            type="button"
            className="btn yellow"
            onClick={() => {
              setText(PROMPTER_SAMPLE);
              save({ text: PROMPTER_SAMPLE });
              toast.showToast('Sample script loaded');
            }}
          >
            Sample text
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setText('');
              save({ text: '' });
            }}
          >
            Clear
          </button>
        </div>
      </section>
      {reading && (
        <ReadingOverlay
          text={text}
          initialSize={size}
          initialSpeed={speed}
          onClose={() => setReading(false)}
          onSize={(next) => {
            setSize(next);
            save({ size: next });
          }}
          onSpeed={(next) => {
            setSpeed(next);
            save({ speed: next });
          }}
        />
      )}
    </>
  );
};
