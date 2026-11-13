import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings, ThemePreference } from '@/domain/settings';
import {
  ONBOARDING_STEP_COUNT,
  ONBOARDING_STEPS,
  GOAL_OPTIONS,
  NOISE_OPTIONS,
  ROLE_OPTIONS,
  THEME_OPTIONS,
  TIMETABLE_OPTIONS,
  focusStyleOptions,
  goalLabel,
  focusHint,
  onboardingDraft,
  onboardingSave,
  onboardingStep,
  onboardingStepIndex,
  roleProfileLabel,
  validateOnboardingStep,
} from '@/domain/onboarding';
import type { OnboardingDraft, OnboardingStepId } from '@/domain/onboarding';
import { patchSettings } from '@/domain/settings';
import { ACCENTS } from '@/domain/color';
import { defaultClock, mondayIndex } from '@/domain/dates';
import { aiKeyStore, applySettings, settingsStore, store } from '@/store';
import { Haptics } from '@/engines/haptics';
import { ImportTimetableModal } from '@/features/plan/ImportTimetableModal';
import { BlockModal } from '@/features/plan/BlockModal';
import { HOME_CARDS } from '@/features/home/cards/registry';
import { Switch } from '@/ui/Switch';
import './Onboarding.css';

export interface OnboardingProps {
  open: boolean;
  onClose: () => void;
}

const APPEARANCE_STEP = onboardingStepIndex('appearance');

const RadioCards = <T extends string,>({
  group,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  group: string;
  options: ReadonlyArray<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) => {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const move = (delta: number): void => {
    const index = options.findIndex((option) => option.value === value);
    const from = index < 0 ? 0 : index;
    const next = (from + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    buttons.current[next]?.focus();
  };

  return (
    <div className="cards" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(element) => {
            buttons.current[index] = element;
          }}
          type="button"
          className="rc"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          data-k={group}
          data-v={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              move(-(index + 1));
            } else if (event.key === 'End') {
              event.preventDefault();
              move(options.length - index);
            }
          }}
        >
          {option.label}
          {option.hint ? <small>{option.hint}</small> : null}
        </button>
      ))}
    </div>
  );
};

const Chips = <T extends string,>({
  group,
  options,
  selected,
  onToggle,
  ariaLabel,
  errorId,
}: {
  group: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  selected: readonly T[];
  onToggle: (value: T) => void;
  ariaLabel: string;
  errorId?: string;
}) => (
  <div className="chips" role="group" aria-label={ariaLabel} aria-describedby={errorId}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className="chp"
        aria-pressed={selected.includes(option.value)}
        data-k={group}
        data-v={option.value}
        onClick={() => onToggle(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

export const Onboarding: React.FC<OnboardingProps> = ({ open, onClose }) => {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [step, setStep] = useState(0);
  const [back, setBack] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const stepRef = useRef<HTMLDivElement | null>(null);
  const accentRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const firstRunRef = useRef(true);
  const wasOnboardedRef = useRef(true);

  const current = onboardingStep(step);
  const stepId: OnboardingStepId = current.id;

  useEffect(() => {
    if (!open) return;
    const settings = settingsStore.get();
    setDraft(onboardingDraft(settings));
    setStep(0);
    setBack(false);
    setError(null);
    setImportOpen(false);
    setBlockOpen(false);
    firstRunRef.current = !store.get().profile.onboarded;
    wasOnboardedRef.current = store.get().profile.onboarded;
  }, [open]);

  // Only the appearance step previews the draft globally; leaving restores the
  // saved settings, and closing after a save restores the new values.
  const draftTheme = draft?.theme;
  const draftAccent = draft?.accentColor;
  const draftAccentCustom = draft?.accentCustom;
  useEffect(() => {
    if (!open || step !== APPEARANCE_STEP) return;
    if (!draftTheme || !draftAccent || !draftAccentCustom) return;
    const saved: Settings = settingsStore.get();
    applySettings(
      patchSettings(saved, {
        theme: draftTheme,
        accentColor: draftAccent,
        accentCustom: draftAccentCustom,
      }),
    );
    return () => {
      applySettings(settingsStore.get());
    };
  }, [open, step, draftTheme, draftAccent, draftAccentCustom]);

  // Lock page scroll behind the wizard.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus to the step itself so screen readers announce the heading.
  useEffect(() => {
    if (!open || !draft || importOpen || blockOpen) return;
    const timer = window.setTimeout(() => {
      const box = overlayRef.current?.querySelector<HTMLElement>('.onb-box');
      if (box) box.scrollTop = 0;
      stepRef.current?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, draft, step, importOpen, blockOpen]);

  const closeSkipping = useCallback(() => {
    if (firstRunRef.current) {
      store.set((state) => {
        state.profile.onboarded = true;
      });
    }
    onClose();
  }, [onClose]);

  const closeWizard = useCallback(() => {
    if (wasOnboardedRef.current) onClose();
    else closeSkipping();
  }, [closeSkipping, onClose]);

  // Escape closes; Tab is trapped. Nested plan modals keep their own keys.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (importOpen || blockOpen) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeWizard();
        return;
      }
      if (event.key !== 'Tab') return;
      const overlay = overlayRef.current;
      if (!overlay) return;
      const focusables = Array.from(
        overlay.querySelectorAll<HTMLElement>(
          'button, input, select, a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute('disabled') && element.offsetParent !== null);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, importOpen, blockOpen, closeWizard]);

  if (!open || !draft) return null;

  const update = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]): void => {
    setDraft((entry) => (entry ? { ...entry, [key]: value } : entry));
    setError(null);
  };

  const go = (next: number, isBack = false): void => {
    setStep(Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, next)));
    setBack(isBack);
    setError(null);
  };

  const finish = (): void => {
    const save = onboardingSave(draft, settingsStore.get());
    settingsStore.set({
      ...save.settings,
      onboarding: {
        ...save.settings.onboarding,
        completedAt: defaultClock.nowISO(),
      },
    });

    // The setup wizard collects the key but never stores it in Settings.
    if (save.aiKey) void aiKeyStore.setKey(save.aiKey);

    store.set((state) => {
      Object.assign(state.profile, save.profile);
      state.settings.theme = save.legacyTheme;
      state.settings.pomodoro.work = save.pomodoro.work;
      state.settings.pomodoro.break = save.pomodoro.break;
      state.layout.order = save.layout.order;
      state.layout.hidden = save.layout.hidden;
      for (const id of save.layout.order) {
        if (state.layout.size[id]) continue;
        const card = HOME_CARDS.find((entry) => entry.id === id);
        if (card) state.layout.size[id] = card.defaultSize;
      }
    });

    Haptics.success();
    onClose();
  };

  const advance = (): void => {
    const problem = validateOnboardingStep(stepId, draft);
    if (problem) {
      setError(problem);
      Haptics.warning();
      return;
    }
    if (step === ONBOARDING_STEP_COUNT - 1) {
      finish();
      return;
    }
    go(step + 1);
    Haptics.tap();
  };

  const skip = (): void => {
    if (step === ONBOARDING_STEP_COUNT - 1) return;
    go(step + 1);
    Haptics.tap();
  };

  const chooseTimetable = (value: OnboardingDraft['timetable']): void => {
    update('timetable', value);
    if (value === 'upload') setImportOpen(true);
    if (value === 'manual') setBlockOpen(true);
  };

  const renderIdentity = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <label className="lb" htmlFor="onb-name">
        Your name
      </label>
      <input
        id="onb-name"
        className="in"
        type="text"
        value={draft.name}
        maxLength={40}
        autoComplete="given-name"
        placeholder="e.g. Ada"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'onb-error' : undefined}
        onChange={(event) => update('name', event.target.value)}
      />
      <p className="lb">You are</p>
      <RadioCards
        group="role"
        ariaLabel="Your role"
        options={ROLE_OPTIONS}
        value={draft.role}
        onChange={(role) => update('role', role)}
      />
    </>
  );

  const renderGoals = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <Chips
        group="goal"
        ariaLabel="Your goals"
        options={GOAL_OPTIONS}
        selected={draft.goals}
        errorId={error ? 'onb-error' : undefined}
        onToggle={(goal) => update('goals', toggle(draft.goals, goal))}
      />
      <p className="onb-note">
        {draft.goals.length === 0
          ? 'Nothing picked yet.'
          : `${draft.goals.length} selected · ${draft.goals.map(goalLabel).join(', ')}`}
      </p>
    </>
  );

  const renderRhythm = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <div className="two">
        <div>
          <label className="lb" htmlFor="onb-wake">
            Wake up
          </label>
          <input
            id="onb-wake"
            className="in"
            type="time"
            value={draft.wake}
            onChange={(event) => update('wake', event.target.value)}
          />
        </div>
        <div>
          <label className="lb" htmlFor="onb-sleep">
            Sleep
          </label>
          <input
            id="onb-sleep"
            className="in"
            type="time"
            value={draft.sleep}
            onChange={(event) => update('sleep', event.target.value)}
          />
        </div>
        <div>
          <label className="lb" htmlFor="onb-peak-start">
            Peak focus starts
          </label>
          <input
            id="onb-peak-start"
            className="in"
            type="time"
            value={draft.peakStart}
            onChange={(event) => update('peakStart', event.target.value)}
          />
        </div>
        <div>
          <label className="lb" htmlFor="onb-peak-end">
            Peak focus ends
          </label>
          <input
            id="onb-peak-end"
            className="in"
            type="time"
            value={draft.peakEnd}
            onChange={(event) => update('peakEnd', event.target.value)}
          />
        </div>
      </div>
      <p className="onb-note">Home and Calendar shade this window as your focus time.</p>
    </>
  );

  const renderTimetable = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <RadioCards
        group="timetable"
        ariaLabel="College timetable"
        options={TIMETABLE_OPTIONS}
        value={draft.timetable}
        onChange={chooseTimetable}
      />
      <p className="onb-note">
        {draft.timetable === 'upload'
          ? 'Upload CSV or JSON — you can fix any row before it lands.'
          : draft.timetable === 'manual'
            ? 'Add classes one by one with day, time and category.'
            : 'You can import a timetable any time from Plan.'}
      </p>
    </>
  );

  const renderAppearance = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <div className="onb-preview" aria-hidden="true">
        <span className="onb-preview-dot" />
        <span className="onb-preview-title">Good morning</span>
        <span className="onb-preview-pill">Primary</span>
      </div>
      <p className="lb" id="onb-theme-label">
        Theme
      </p>
      <RadioCards
        group="theme"
        ariaLabel="Theme"
        options={THEME_OPTIONS}
        value={draft.theme}
        onChange={(theme: ThemePreference) => update('theme', theme)}
      />
      <p className="lb" id="onb-accent-label">
        Accent colour
      </p>
      <div className="swatches onb-swatches" role="radiogroup" aria-labelledby="onb-accent-label">
        {ACCENTS.map((accent, index) => (
          <button
            key={accent.id}
            ref={(element) => {
              accentRefs.current[index] = element;
            }}
            type="button"
            className={`swatch${draft.accentColor === accent.id ? ' on' : ''}`}
            role="radio"
            aria-checked={draft.accentColor === accent.id}
            aria-label={accent.label}
            title={accent.label}
            tabIndex={draft.accentColor === accent.id ? 0 : -1}
            data-k="accent"
            data-v={accent.id}
            style={
              {
                '--sw': accent.hex ?? 'linear-gradient(135deg,#fff 50%,#000 50%)',
              } as React.CSSProperties
            }
            onClick={() => update('accentColor', accent.id as OnboardingDraft['accentColor'])}
            onKeyDown={(event) => {
              if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(event.key)) {
                return;
              }
              event.preventDefault();
              const delta =
                event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
              const from = Math.max(
                0,
                ACCENTS.findIndex((entry) => entry.id === draft.accentColor),
              );
              const next = (from + delta + ACCENTS.length) % ACCENTS.length;
              const selected = ACCENTS[next];
              if (!selected) return;
              update('accentColor', selected.id as OnboardingDraft['accentColor']);
              accentRefs.current[next]?.focus();
            }}
          />
        ))}
        <label className={`swatch custom${draft.accentColor === 'custom' ? ' on' : ''}`}>
          <input
            id="onb-accent-custom"
            type="color"
            aria-label="Custom accent colour"
            value={draft.accentCustom}
            onChange={(event) => {
              update('accentCustom', event.target.value);
              update('accentColor', 'custom');
            }}
          />
        </label>
      </div>
    </>
  );

  const renderWidgets = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <div className="onb-widgets" role="group" aria-label="Home cards">
        {HOME_CARDS.map((card) => {
          const on = draft.widgets.includes(card.id);
          return (
            <button
              key={card.id}
              type="button"
              className={`onb-widget${on ? ' is-on' : ''}`}
              aria-pressed={on}
              data-k="widget"
              data-v={card.id}
              onClick={() => {
                if (on && draft.widgets.length === 1) {
                  setError('Keep at least one card on Home.');
                  return;
                }
                update('widgets', toggle(draft.widgets, card.id));
              }}
            >
              <span>{card.title}</span>
              <small>{on ? 'Shown' : 'Hidden'}</small>
            </button>
          );
        })}
      </div>
      <p className="onb-note">
        {draft.widgets.length} of {HOME_CARDS.length} shown.
      </p>
    </>
  );

  const renderFocus = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <p className="lb" id="onb-focus-label">
        Focus style
      </p>
      <RadioCards
        group="focusStyle"
        ariaLabel="Focus style"
        options={focusStyleOptions()}
        value={draft.focusStyle}
        onChange={(style) => update('focusStyle', style)}
      />
      <p className="lb" id="onb-noise-label">
        Background noise
      </p>
      <Chips
        group="noise"
        ariaLabel="Background noise"
        options={NOISE_OPTIONS}
        selected={[draft.noise]}
        onToggle={(noise) => update('noise', noise)}
      />
      <p className="onb-note">You can fine-tune these later in Settings and Focus.</p>
    </>
  );

  const renderAI = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <label className="lb" htmlFor="onb-ai-key">
        API key (optional)
      </label>
      <input
        id="onb-ai-key"
        className="in"
        type="password"
        value={draft.aiApiKey}
        maxLength={256}
        autoComplete="off"
        spellCheck={false}
        placeholder="sk-…"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'onb-error' : undefined}
        onChange={(event) => update('aiApiKey', event.target.value)}
      />
      <p className="onb-note">Stored only on this device. Leave blank to stay fully local.</p>
      <div className="onb-toggle">
        <span>
          Let AI read my notes
          <small>Used for context in suggestions. Off by default.</small>
        </span>
        <Switch
          checked={draft.aiCanReadNotes}
          onChange={(checked) => update('aiCanReadNotes', checked)}
          aria-label="Let AI read your notes"
        />
      </div>
    </>
  );

  const renderSummary = (): React.ReactNode => (
    <>
      <p className="sub">{current.subtitle}</p>
      <dl className="onb-summary">
        <dt>Name</dt>
        <dd>{draft.name.trim() || '—'}</dd>
        <dt>You are</dt>
        <dd>{roleProfileLabel(draft.role)}</dd>
        <dt>Goals</dt>
        <dd>{draft.goals.length > 0 ? draft.goals.map(goalLabel).join(', ') : '—'}</dd>
        <dt>Day</dt>
        <dd>{`${draft.wake} – ${draft.sleep}`}</dd>
        <dt>Peak focus</dt>
        <dd>{`${draft.peakStart} – ${draft.peakEnd}`}</dd>
        <dt>Timetable</dt>
        <dd>
          {TIMETABLE_OPTIONS.find((option) => option.value === draft.timetable)?.label ?? 'Later'}
        </dd>
        <dt>Theme</dt>
        <dd>
          {THEME_OPTIONS.find((option) => option.value === draft.theme)?.label ?? 'Auto'} ·{' '}
          {ACCENTS.find((accent) => accent.id === draft.accentColor)?.label ?? 'Mono'}
        </dd>
        <dt>Home cards</dt>
        <dd>{draft.widgets.length} shown</dd>
        <dt>Focus</dt>
        <dd>
          {focusStyleOptions().find((option) => option.value === draft.focusStyle)?.label ??
            'Pomodoro'}{' '}
          · {focusHint(draft.focusStyle)} · noise {draft.noise}
        </dd>
        <dt>AI</dt>
        <dd>
          {draft.aiApiKey.trim() ? 'Key added' : 'Local only'}
          {draft.aiCanReadNotes ? ' · notes allowed' : ''}
        </dd>
      </dl>
    </>
  );

  const renderStep = (): React.ReactNode => {
    switch (stepId) {
      case 'identity':
        return renderIdentity();
      case 'goals':
        return renderGoals();
      case 'rhythm':
        return renderRhythm();
      case 'timetable':
        return renderTimetable();
      case 'appearance':
        return renderAppearance();
      case 'widgets':
        return renderWidgets();
      case 'focus':
        return renderFocus();
      case 'ai':
        return renderAI();
      case 'summary':
      default:
        return renderSummary();
    }
  };

  const last = step === ONBOARDING_STEP_COUNT - 1;

  return (
    <div
      className="onb"
      style={{ zIndex: 90 }}
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label="Personalize Personal OS"
    >
      <div className="onb-box">
        <div className="onb-top">
          <div
            className="onb-bar"
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={ONBOARDING_STEP_COUNT}
            aria-valuenow={step + 1}
            aria-valuetext={`Step ${step + 1} of ${ONBOARDING_STEP_COUNT}: ${current.label}`}
          >
            <i
              style={
                {
                  '--p': (step + 1) / ONBOARDING_STEP_COUNT,
                } as React.CSSProperties
              }
            />
          </div>
          <span className="onb-count hint mono">
            {step + 1} / {ONBOARDING_STEP_COUNT}
          </span>
          <button type="button" className="gb" data-nav="close" onClick={closeWizard}>
            {wasOnboardedRef.current ? 'Close' : 'Skip setup'}
          </button>
        </div>

        <div
          className="onb-body"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
              if (event.target.type === 'color') return;
              event.preventDefault();
              advance();
            }
          }}
        >
          <div className="onb-steplabels" aria-hidden="true">
            {ONBOARDING_STEPS.map((entry, index) => (
              <span
                key={entry.id}
                className={`onb-steplabel${index <= step ? ' is-done' : ''}${
                  index === step ? ' is-current' : ''
                }`}
              />
            ))}
          </div>
          <div
            className={`onb-step${back ? ' back' : ''}`}
            role="group"
            aria-labelledby="onb-title"
            tabIndex={-1}
            ref={stepRef}
          >
            <h2 id="onb-title">{current.title}</h2>
            {renderStep()}
          </div>
          {error ? (
            <p className="onb-error form-err" id="onb-error" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <div className="onb-nav">
          <button
            type="button"
            className="gb"
            data-nav="back"
            style={{ visibility: step === 0 ? 'hidden' : 'visible' }}
            onClick={() => go(step - 1, true)}
          >
            Back
          </button>
          <span className="sp" />
          {!last && (
            <button type="button" className="gb" data-nav="skip" onClick={skip}>
              Skip
            </button>
          )}
          <button type="button" className="pb" data-nav="next" onClick={advance}>
            {last ? 'Finish setup' : 'Next'}
          </button>
        </div>
      </div>

      <ImportTimetableModal open={importOpen} onClose={() => setImportOpen(false)} />
      <BlockModal
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        block={null}
        defaultDay={mondayIndex()}
        defaultRepeat="weekly"
      />
    </div>
  );
};
