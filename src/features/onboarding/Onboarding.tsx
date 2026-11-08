import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { Profile, Task, TaskPriority } from '@/domain/types';
import type { OnboardingTaskDue } from '@/domain/onboarding';
import { ONBOARDING_STEP_COUNT, onboardingTaskDue } from '@/domain/onboarding';
import type { BentoPresetName } from '@/domain/bentoLayout';
import { applyBentoPreset, isBentoPresetName } from '@/domain/bentoLayout';
import { FOCUS_MIN } from '@/domain/focusPresets';
import { ACCENTS, resolveAccent } from '@/domain/color';
import { mondayIndex } from '@/domain/dates';
import { store, stampNewRecord } from '@/store';
import { Haptics } from '@/engines/haptics';
import { ImportTimetableModal } from '@/features/plan/ImportTimetableModal';
import { BlockModal } from '@/features/plan/BlockModal';
import { HOME_CARD_SPECS } from '@/features/home/cards/registry';
import './Onboarding.css';

export interface OnboardingProps {
  open: boolean;
  onClose: () => void;
}

interface OnboardingDraft {
  name: string;
  greeting: string;
  role: string;
  level: string;
  field: string;
  wake: string;
  sleep: string;
  bestTime: string;
  studyHours: number;
  weeklyGoal: string;
  focusStyle: string;
  noise: string;
  preset: string;
  accent: string;
}

interface FirstTaskDraft {
  title: string;
  due: OnboardingTaskDue;
  prio: TaskPriority;
}

const ROLES = [
  'School student',
  'College student',
  'Working professional',
  'Self-learner',
];

const LEVELS = ['1st year', '2nd year', '3rd year', '4th year', 'Postgraduate', 'Other'];

const FIELDS = [
  'Computer Science',
  'Engineering - other',
  'Commerce',
  'Arts',
  'Science',
  'Medicine',
  'Design',
  'Law',
  'Other',
];

const BEST_TIMES = ['Morning', 'Afternoon', 'Evening', 'Late night'];

const GOALS = [
  'Finish assignments',
  'Exam prep',
  'Build projects',
  'Skill learning',
  'Stay consistent',
];

const FOCUS_STYLES: Array<{ value: string; label: string; hint: string }> = [
  { value: 'pomodoro', label: 'Pomodoro', hint: '25 / 5' },
  { value: 'deep', label: 'Deep work', hint: '50 / 10' },
  { value: 'long', label: 'Long', hint: '90 / 20' },
  { value: 'custom', label: 'Custom', hint: 'Your own' },
];

const NOISES: Array<{ value: string; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'white', label: 'White' },
  { value: 'pink', label: 'Pink' },
  { value: 'brown', label: 'Brown' },
];

const PRESETS: Array<{ value: BentoPresetName; label: string; hint: string }> = [
  { value: 'minimal', label: 'Minimal', hint: 'Just the essentials' },
  { value: 'balanced', label: 'Balanced', hint: 'A bit of everything' },
  { value: 'everything', label: 'Everything', hint: 'All cards on' },
];

const DUE_OPTIONS: Array<{ value: OnboardingTaskDue; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'No date' },
];

const PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'med', label: 'Medium' },
  { value: 'high', label: 'High' },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`);

function draftFromProfile(profile: Profile): OnboardingDraft {
  return {
    name: profile.name,
    greeting: profile.greeting === 'hey' ? 'hey' : 'auto',
    role: profile.role,
    level: profile.level,
    field: profile.field,
    wake: profile.wake || '07:00',
    sleep: profile.sleep || '23:00',
    bestTime: profile.bestTime,
    studyHours: Math.max(1, Math.min(8, Number(profile.studyHours) || 3)),
    weeklyGoal: profile.weeklyGoal,
    focusStyle: profile.focusStyle || 'pomodoro',
    noise: profile.noise || 'none',
    preset: isBentoPresetName(profile.preset) ? profile.preset : 'balanced',
    accent: profile.accent || 'mono',
  };
}

function applyAccentTokens(accentId: string, customAccent: string): void {
  if (typeof document === 'undefined') return;
  const isDark = document.documentElement.dataset.theme === 'dark';
  const applied = resolveAccent(accentId, customAccent, isDark);
  const style = document.documentElement.style;
  style.setProperty('--accent', applied.accent);
  style.setProperty('--accent-text', applied.accentText);
  style.setProperty('--on-accent', applied.onAccent);
  style.setProperty('--focus', applied.focus);
}

const RadioCards: React.FC<{
  name: string;
  options: Array<{ value: string; label: string; hint?: string }>;
  value: string;
  onChange: (value: string) => void;
}> = ({ name, options, value, onChange }) => (
  <div className="cards" role="radiogroup" aria-label={name}>
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className="rc"
        role="radio"
        aria-checked={value === option.value}
        data-k={name}
        data-v={option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
        {option.hint ? <small>{option.hint}</small> : null}
      </button>
    ))}
  </div>
);

const Chips: React.FC<{
  name: string;
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}> = ({ name, options, value, onChange }) => (
  <div className="chips">
    {options.map((option) => (
      <button
        key={option.value}
        type="button"
        className="chp"
        aria-pressed={value === option.value}
        data-k={name}
        data-v={option.value}
        onClick={() => onChange(option.value)}
      >
        {option.label}
      </button>
    ))}
  </div>
);

const Select: React.FC<{
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  options: readonly string[];
  onChange: (value: string) => void;
}> = ({ id, label, value, placeholder, options, onChange }) => (
  <>
    <label className="lb" htmlFor={id}>
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </>
);

export const Onboarding: React.FC<OnboardingProps> = ({ open, onClose }) => {
  const [draft, setDraft] = useState<OnboardingDraft | null>(null);
  const [step, setStep] = useState(0);
  const [back, setBack] = useState(false);
  const [task, setTask] = useState<FirstTaskDraft>({
    title: '',
    due: 'today',
    prio: 'med',
  });
  const [importOpen, setImportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const overlayRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const firstRunRef = useRef(true);
  const wasOnboardedRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    const profile = store.get().profile;
    setDraft(draftFromProfile(profile));
    setStep(0);
    setBack(false);
    setTask({ title: '', due: 'today', prio: 'med' });
    setImportOpen(false);
    setBlockOpen(false);
    firstRunRef.current = !profile.onboarded;
    wasOnboardedRef.current = profile.onboarded;
  }, [open]);

  // Live accent preview while the accent step is on screen; restore after.
  const draftAccent = draft?.accent;
  useEffect(() => {
    if (!open || !draftAccent) return;
    applyAccentTokens(draftAccent, store.get().profile.customAccent);
    return () => {
      const profile = store.get().profile;
      applyAccentTokens(profile.accent, profile.customAccent);
    };
  }, [open, draftAccent]);

  // Lock page scroll behind the wizard.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Move focus into each step.
  useEffect(() => {
    if (!open || !draft || importOpen || blockOpen) return;
    const timer = window.setTimeout(() => {
      bodyRef.current
        ?.querySelector<HTMLElement>('input, select, button')
        ?.focus({ preventScroll: true });
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open, draft, step, importOpen, blockOpen]);

  const closeSkipping = useCallback(() => {
    store.set((state) => {
      state.profile.onboarded = true;
    });
    onClose();
  }, [onClose]);

  const closeWizard = useCallback(() => {
    if (firstRunRef.current) closeSkipping();
    else onClose();
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

  const updateDraft = <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ): void => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const go = (next: number, isBack = false): void => {
    setStep(Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, next)));
    setBack(isBack);
  };

  const finish = (): void => {
    const title = task.title.trim();
    const due = onboardingTaskDue(task.due);
    const accent = draft.accent;
    const quickProfile: Partial<Profile> = {
      name: draft.name.trim(),
      greeting: draft.greeting === 'hey' ? 'hey' : 'auto',
      role: draft.role,
      level: draft.level,
      field: draft.field,
      wake: draft.wake,
      sleep: draft.sleep,
      bestTime: draft.bestTime,
      studyHours: draft.studyHours,
      weeklyGoal: draft.weeklyGoal,
      focusStyle: draft.focusStyle,
      noise: draft.noise,
      preset: draft.preset,
      accent,
      onboarded: true,
    };

    store.set((state) => {
      Object.assign(state.profile, quickProfile);
      const focus = FOCUS_MIN[draft.focusStyle];
      if (focus) {
        state.settings.pomodoro.work = focus[0];
        state.settings.pomodoro.break = focus[1];
      }
      if (title) {
        const created = stampNewRecord<Partial<Task>>(
          {
            title: title.slice(0, 120),
            due,
            priority: task.prio,
            done: false,
            category: '',
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Task;
        state.tasks.unshift(created);
      }
      const preset = isBentoPresetName(draft.preset) ? draft.preset : 'balanced';
      const layout = applyBentoPreset(preset, HOME_CARD_SPECS, ['calendar', 'timeline']);
      state.layout.order = layout.order;
      state.layout.size = { ...layout.size };
      state.layout.hidden = layout.hidden;
    });

    Haptics.success();
    onClose();
  };

  const renderStep = (): React.ReactNode => {
    switch (step) {
      case 0:
        return (
          <>
            <h2>What should I call you?</h2>
            <p className="sub">Used for your greeting on Home.</p>
            <label className="lb" htmlFor="onb-name">
              Name
            </label>
            <input
              className="in"
              id="onb-name"
              maxLength={40}
              autoComplete="given-name"
              value={draft.name}
              data-k="name"
              onChange={(event) => updateDraft('name', event.target.value)}
            />
            <label className="lb">Greeting style</label>
            <RadioCards
              name="greeting"
              value={draft.greeting}
              onChange={(value) => updateDraft('greeting', value)}
              options={[
                { value: 'hey', label: 'Hey' },
                { value: 'auto', label: 'Good morning / afternoon / evening' },
              ]}
            />
          </>
        );

      case 1:
        return (
          <>
            <h2>You are</h2>
            <p className="sub">Helps tailor suggestions.</p>
            <RadioCards
              name="role"
              value={draft.role}
              onChange={(value) => updateDraft('role', value)}
              options={ROLES.map((role) => ({ value: role, label: role }))}
            />
          </>
        );

      case 2:
        return (
          <>
            <h2>Year or level</h2>
            <p className="sub">Pick the closest match.</p>
            <Select
              id="onb-level"
              label="Year / level"
              value={draft.level}
              placeholder="Choose…"
              options={LEVELS}
              onChange={(value) => updateDraft('level', value)}
            />
          </>
        );

      case 3:
        return (
          <>
            <h2>Field of study</h2>
            <p className="sub">What do you mostly work on?</p>
            <Select
              id="onb-field"
              label="Field"
              value={draft.field}
              placeholder="Choose…"
              options={FIELDS}
              onChange={(value) => updateDraft('field', value)}
            />
          </>
        );

      case 4:
        return (
          <>
            <h2>Your daily rhythm</h2>
            <p className="sub">Your Today timeline will show just these hours.</p>
            <div className="two">
              <div>
                <Select
                  id="onb-wake"
                  label="Wake time"
                  value={draft.wake}
                  options={HOURS}
                  onChange={(value) => updateDraft('wake', value)}
                />
              </div>
              <div>
                <Select
                  id="onb-sleep"
                  label="Sleep time"
                  value={draft.sleep}
                  options={HOURS}
                  onChange={(value) => updateDraft('sleep', value)}
                />
              </div>
            </div>
            <label className="lb">I focus best in</label>
            <Chips
              name="bestTime"
              value={draft.bestTime}
              onChange={(value) => updateDraft('bestTime', value)}
              options={BEST_TIMES.map((time) => ({ value: time, label: time }))}
            />
          </>
        );

      case 5:
        return (
          <>
            <h2>Study goal</h2>
            <p className="sub">Shown on your progress card.</p>
            <label className="lb" htmlFor="onb-study-hours">
              Hours per day
            </label>
            <select
              id="onb-study-hours"
              value={draft.studyHours}
              onChange={(event) => updateDraft('studyHours', Number(event.target.value))}
              aria-label="Hours per day"
            >
              {Array.from({ length: 8 }, (_, index) => {
                const hours = index + 1;
                return (
                  <option key={hours} value={hours}>
                    {hours === 8 ? '8+' : hours} h
                  </option>
                );
              })}
            </select>
            <label className="lb">This week I want to</label>
            <Chips
              name="weeklyGoal"
              value={draft.weeklyGoal}
              onChange={(value) => updateDraft('weeklyGoal', value)}
              options={GOALS.map((goal) => ({ value: goal, label: goal }))}
            />
          </>
        );

      case 6:
        return (
          <>
            <h2>Focus style</h2>
            <p className="sub">Sets your timer defaults.</p>
            <RadioCards
              name="focusStyle"
              value={draft.focusStyle}
              onChange={(value) => updateDraft('focusStyle', value)}
              options={FOCUS_STYLES}
            />
            <label className="lb">Ambient noise</label>
            <Chips
              name="noise"
              value={draft.noise}
              onChange={(value) => updateDraft('noise', value)}
              options={NOISES}
            />
          </>
        );

      case 7:
        return (
          <>
            <h2>College timetable</h2>
            <p className="sub">You can always do this later in Plan.</p>
            <div className="cards">
              <button type="button" className="rc" data-act="import" onClick={() => setImportOpen(true)}>
                Import JSON
                <small>Paste or upload a timetable</small>
              </button>
              <button type="button" className="rc" data-act="block" onClick={() => setBlockOpen(true)}>
                Add blocks manually
                <small>Open the block editor</small>
              </button>
              <button type="button" className="rc" data-act="next" onClick={() => go(step + 1)}>
                Skip for now
                <small>Nothing is added</small>
              </button>
            </div>
          </>
        );

      case 8:
        return (
          <>
            <h2>Home layout</h2>
            <p className="sub">Choose a starting point. You can change it later.</p>
            <RadioCards
              name="preset"
              value={draft.preset}
              onChange={(value) => updateDraft('preset', value)}
              options={PRESETS}
            />
          </>
        );

      case 9:
        return (
          <>
            <h2>Accent color</h2>
            <p className="sub">Applies live across the app.</p>
            <div className="swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((accent) => {
                const selected = draft.accent === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    className={`swatch${selected ? ' on' : ''}`}
                    role="radio"
                    aria-checked={selected}
                    aria-label={accent.label}
                    title={accent.label}
                    data-k="accent"
                    data-v={accent.id}
                    style={
                      {
                        '--sw': accent.hex ?? 'linear-gradient(135deg,#fff 50%,#000 50%)',
                      } as React.CSSProperties
                    }
                    onClick={() => updateDraft('accent', accent.id)}
                  />
                );
              })}
            </div>
            <p className="sub" style={{ marginTop: 16, marginBottom: 0 }}>
              Preview:{' '}
              <a href="#" style={{ color: 'var(--accent-text)' }} onClick={(event) => event.preventDefault()}>
                a link
              </a>{' '}
              ·{' '}
              <span
                style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: 99,
                  background: 'var(--accent)',
                  color: 'var(--on-accent)',
                  fontSize: 12,
                }}
              >
                Primary
              </span>
            </p>
          </>
        );

      case 10:
        return (
          <>
            <h2>Your first task</h2>
            <p className="sub">Optional. Creates a real task.</p>
            <label className="lb" htmlFor="onb-task">
              Task
            </label>
            <input
              className="in"
              id="onb-task"
              maxLength={120}
              value={task.title}
              onChange={(event) => setTask((current) => ({ ...current, title: event.target.value }))}
            />
            <label className="lb" htmlFor="onb-task-due">
              Due
            </label>
            <select
              id="onb-task-due"
              value={task.due}
              onChange={(event) =>
                setTask((current) => ({
                  ...current,
                  due: event.target.value as OnboardingTaskDue,
                }))
              }
              aria-label="Due"
            >
              {DUE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <label className="lb">Priority</label>
            <div className="chips">
              {PRIORITIES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className="chp"
                  aria-pressed={task.prio === option.value}
                  onClick={() => setTask((current) => ({ ...current, prio: option.value }))}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </>
        );

      default:
        return (
          <>
            <h2>You’re all set</h2>
            <p className="sub">Here’s what I saved.</p>
            <dl>
              <dt>Name</dt>
              <dd>{draft.name || '—'}</dd>
              <dt>You are</dt>
              <dd>{draft.role || '—'}</dd>
              <dt>Level · field</dt>
              <dd>{`${draft.level || '—'} · ${draft.field || '—'}`}</dd>
              <dt>Day</dt>
              <dd>{`${draft.wake} – ${draft.sleep}`}</dd>
              <dt>Daily goal</dt>
              <dd>{draft.studyHours} h</dd>
              <dt>Focus</dt>
              <dd>{`${draft.focusStyle}, noise ${draft.noise}`}</dd>
              <dt>Layout</dt>
              <dd>{draft.preset}</dd>
            </dl>
          </>
        );
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

        <div className="onb-body" ref={bodyRef} onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            if (last) finish();
            else go(step + 1);
          }
        }}>
          <div
            className={`onb-step${back ? ' back' : ''}`}
            role="group"
            aria-label={`Step ${step + 1} of ${ONBOARDING_STEP_COUNT}`}
          >
            {renderStep()}
          </div>
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
            <button type="button" className="gb" data-nav="skip" onClick={() => go(step + 1)}>
              Skip
            </button>
          )}
          <button
            type="button"
            className="pb"
            data-nav="next"
            onClick={() => (last ? finish() : go(step + 1))}
          >
            {last ? 'Open my dashboard' : 'Next'}
          </button>
        </div>
      </div>

      <ImportTimetableModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />
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
