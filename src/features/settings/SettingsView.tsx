import React, { useCallback, useRef, useState } from 'react';
import { useMediaQuery } from '@/hooks';
import { useStore, store, liveArray } from '@/store';
import type { HapticsConfig, ThemeMode } from '@/domain/types';
import { defaultState } from '@/domain/types';
import { ACCENTS, resolveAccent } from '@/domain/color';
import { defaultClock, todayISO } from '@/domain/dates';
import { buildDemoData } from '@/domain/demo';
import { recomputeDayStats } from '@/domain/stats';
import {
  CLEAR_CONFIRM_PHRASE,
  exportFilename,
  isClearConfirmation,
  validateBackupText,
} from '@/domain/backup';
import { Haptics } from '@/engines/haptics';
import { fileSaver } from '@/platform';
import { Card } from '@/ui/Card';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/Toast';
import packageJson from '../../../package.json';
import './SettingsView.css';

export interface SettingsViewProps {
  onOpenOnboarding?: () => void;
  onOpenShortcuts?: () => void;
}

const HAPTIC_LEVELS: Array<{ value: HapticsConfig['level']; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
];

type BackupData = Record<string, unknown>;

function countList(data: BackupData | null, key: string): number {
  const value = data ? data[key] : undefined;
  return Array.isArray(value) ? value.length : 0;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenOnboarding,
  onOpenShortcuts,
}) => {
  const state = useStore();
  const toast = useToast();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');

  const { profile, settings } = state;
  const isDark = settings.theme === 'dark' || (settings.theme === 'auto' && systemDark);
  const applied = resolveAccent(profile.accent, profile.customAccent, isDark);
  const haptics = profile.haptics;

  const blocks = liveArray(state.blocks);
  const tasks = liveArray(state.tasks);
  const notes = liveArray(state.notes);
  const deadlines = liveArray(state.deadlines);
  const trackedDays = Object.keys(state.dayStats).length;

  const updateHaptics = (patch: Partial<HapticsConfig>): void => {
    store.set((current) => {
      current.profile.haptics = { ...current.profile.haptics, ...patch };
    });
  };

  const handleThemeChange = (theme: ThemeMode): void => {
    store.set((current) => {
      current.settings.theme = theme;
    });
    Haptics.select();
  };

  const handleAccentChange = (accentId: string): void => {
    store.set((current) => {
      current.profile.accent = accentId;
    });
    Haptics.select();
  };

  const handleCustomAccent = (value: string): void => {
    store.set((current) => {
      current.profile.accent = 'custom';
      current.profile.customAccent = value;
    });
  };

  const handleNameChange = (value: string): void => {
    store.set((current) => {
      current.profile.name = value.slice(0, 40);
    });
  };

  const handleExport = async (): Promise<void> => {
    try {
      const json = JSON.stringify(store.exportAll(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      await fileSaver.saveFile(blob, exportFilename(todayISO()));
      Haptics.success();
      toast.showToast('Backup file downloaded');
    } catch {
      Haptics.error();
      toast.showToast('Export failed. Try again.');
    }
  };

  const handleDemoLoad = (): void => {
    const current = store.get();
    const demo = buildDemoData(defaultClock, undefined, current.settings.theme);
    // Demo data must never sign the user out of their own setup.
    demo.profile = { ...current.profile };
    demo.settings.seeded = true;
    demo.settings.theme = current.settings.theme;
    store.importAll(demo);
    store.set((next) => {
      recomputeDayStats(next.dayStats, next.blocks, todayISO());
    });
    Haptics.success();
    toast.showToast('Demo data loaded — explore away');
  };

  const handleDemoRemove = (): void => {
    const current = store.get();
    const fresh = defaultState();
    fresh.profile = { ...current.profile };
    fresh.settings = { ...current.settings, seeded: false };
    fresh.clearedAt = defaultClock.nowISO();
    store.importAll(fresh);
    Haptics.warning();
    toast.showToast('Demo data removed');
  };

  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = validateBackupText(String(reader.result ?? ''));
      if (!result.ok) {
        Haptics.error();
        toast.showToast(result.error);
        return;
      }
      setPendingImport(result.data);
    };
    reader.onerror = () => {
      Haptics.error();
      toast.showToast('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const closeImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  const confirmImport = (): void => {
    if (!pendingImport) return;
    store.importAll(pendingImport);
    setPendingImport(null);
    Haptics.success();
    toast.showToast('Backup imported');
  };

  const closeClear = useCallback(() => {
    setClearOpen(false);
    setClearText('');
  }, []);

  const confirmClear = (): void => {
    if (!isClearConfirmation(clearText)) return;
    store.importAll(defaultState());
    store.set((current) => {
      current.clearedAt = defaultClock.nowISO();
    });
    setClearOpen(false);
    setClearText('');
    Haptics.warning();
    toast.showToast('All data cleared — fresh start');
  };

  return (
    <div className="view-content settings-view">
      <div className="view-head">
        <h1>Settings</h1>
        <div className="rule" />
      </div>

      <div className="settings-grid">
        <Card className="settings-card">
          <div className="settings-card-head">
            <h2>Appearance</h2>
          </div>

          <div className="set-stack">
            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Theme</div>
                <div className="hint">Auto follows your device light / dark setting.</div>
              </div>
              <Segmented<ThemeMode>
                value={settings.theme}
                onChange={handleThemeChange}
                options={[
                  { value: 'auto', label: 'Auto' },
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                ]}
                aria-label="Theme"
              />
            </div>

            <div className="set-block">
              <div className="set-cell">
                <div className="set-name">Accent color</div>
                <div className="hint">Used for focus rings, active states and highlights.</div>
              </div>
              <div className="swatches" role="radiogroup" aria-label="Accent color">
                {ACCENTS.map((accent) => (
                  <button
                    key={accent.id}
                    type="button"
                    className={`swatch${profile.accent === accent.id ? ' on' : ''}`}
                    role="radio"
                    aria-checked={profile.accent === accent.id}
                    aria-label={accent.label}
                    title={accent.label}
                    data-accent={accent.id}
                    style={
                      {
                        '--sw': accent.hex ?? 'linear-gradient(135deg,#fff 50%,#000 50%)',
                      } as React.CSSProperties
                    }
                    onClick={() => handleAccentChange(accent.id)}
                  />
                ))}
                <label
                  className={`swatch custom${profile.accent === 'custom' ? ' on' : ''}`}
                  title="Custom color"
                >
                  <input
                    type="color"
                    id="accent-custom"
                    aria-label="Custom accent color"
                    value={profile.customAccent || '#8B7BFF'}
                    onChange={(event) => handleCustomAccent(event.target.value)}
                  />
                </label>
              </div>
              <div className="set-preview" data-accent-preview>
                <span className="hint">Preview</span>
                <a
                  href="#"
                  style={{ color: applied.accentText }}
                  onClick={(event) => event.preventDefault()}
                >
                  a link
                </a>
                <span
                  className="set-preview-pill"
                  style={{ background: applied.accent, color: applied.onAccent }}
                >
                  Primary
                </span>
              </div>
            </div>

            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Personalize</div>
                <div className="hint">Re-run setup: name, schedule, focus style, layout preset.</div>
              </div>
              <Button
                variant="secondary"
                data-action="personalize"
                onClick={() => onOpenOnboarding?.()}
              >
                Personalize
              </Button>
            </div>

            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Haptic feedback</div>
                <div className="hint">
                  Vibration on taps, toggles and completions (Android); a subtle pulse elsewhere.
                </div>
              </div>
              <Switch
                checked={haptics.on}
                onChange={(checked) => updateHaptics({ on: checked })}
                aria-label="Haptic feedback"
              />
            </div>

            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Haptic intensity</div>
                <div className="hint">How strong the vibrations feel.</div>
              </div>
              <div className="chips" role="group" aria-label="Haptic intensity">
                {HAPTIC_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    type="button"
                    className="chp"
                    aria-pressed={haptics.level === level.value}
                    data-haptic-level={level.value}
                    onClick={() => {
                      updateHaptics({ level: level.value });
                      Haptics.select();
                    }}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Sound feedback</div>
                <div className="hint">A soft click plays alongside haptics.</div>
              </div>
              <Switch
                checked={haptics.sound}
                onChange={(checked) => updateHaptics({ sound: checked })}
                aria-label="Sound feedback"
              />
            </div>
          </div>
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <h2>Profile</h2>
          </div>
          <div className="set-stack">
            <div className="set-block">
              <label className="hint" htmlFor="pref-name">
                Name shown in your Home greeting
              </label>
              <input
                id="pref-name"
                className="settings-input"
                type="text"
                maxLength={40}
                placeholder="there"
                value={profile.name}
                onChange={(event) => handleNameChange(event.target.value)}
              />
            </div>
            <div className="set-row">
              <div className="set-cell">
                <div className="set-name">Setup answers</div>
                <div className="hint">
                  {profile.role || 'No role yet'} · {profile.level || 'No level'} ·{' '}
                  {profile.field || 'No field'} · {profile.studyHours} h/day
                </div>
              </div>
              <Button
                variant="secondary"
                data-action="personalize-profile"
                onClick={() => onOpenOnboarding?.()}
              >
                Personalize
              </Button>
            </div>
          </div>
        </Card>

        <Card className="settings-card settings-data">
          <div className="settings-card-head">
            <h2>Data</h2>
            <div className="counts" data-data-counts>
              <span className="chip">{blocks.length} blocks</span>
              <span className="chip">{tasks.length} tasks</span>
              <span className="chip">{notes.length} notes</span>
              <span className="chip">{deadlines.length} deadlines</span>
              <span className="chip">{trackedDays} days tracked</span>
            </div>
          </div>

          <div className="set-row settings-data-actions">
            <Button variant="secondary" data-action="export-data" onClick={() => void handleExport()}>
              <Icon name="download" size={16} />
              Export JSON
            </Button>
            <Button
              variant="secondary"
              data-action="import-data-pick"
              onClick={() => importInputRef.current?.click()}
            >
              <Icon name="upload" size={16} />
              Import JSON
            </Button>
            <input
              ref={importInputRef}
              id="imp-file"
              type="file"
              accept=".json,application/json"
              style={{ display: 'none' }}
              onChange={handleFilePicked}
              aria-label="Import backup file"
            />
          </div>

          <div className="set-row settings-data-actions">
            <Button variant="secondary" data-action="demo-load" onClick={handleDemoLoad}>
              Load demo data
            </Button>
            {settings.seeded && (
              <Button variant="secondary" data-action="demo-remove" onClick={handleDemoRemove}>
                Remove demo data
              </Button>
            )}
            <Button
              variant="secondary"
              className="settings-clear-btn"
              data-action="clear-data"
              onClick={() => setClearOpen(true)}
            >
              Clear all data
            </Button>
          </div>

          <p className="hint settings-data-hint">
            Demo data replaces everything with a populated sample week. Import accepts a JSON file
            previously exported from here.
          </p>
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <h2>Shortcuts</h2>
          </div>
          <div className="set-row">
            <div className="set-cell">
              <div className="set-name">Keyboard cheat sheet</div>
              <div className="hint">Every chord, key and calendar shortcut in one place.</div>
            </div>
            <Button
              variant="secondary"
              data-action="open-shortcuts"
              onClick={() => onOpenShortcuts?.()}
            >
              <Icon name="keys" size={16} />
              Open cheat sheet
            </Button>
          </div>
        </Card>

        <Card className="settings-card">
          <div className="settings-card-head">
            <h2>About</h2>
          </div>
          <p className="hint settings-about">
            Personal OS v{packageJson.version}. 100% local — your data lives in this browser and
            never leaves the device unless you export it.
          </p>
          <p className="hint settings-about">
            Storage key: <span className="mono">personalOS_v1</span>. Press 1–9 to jump between
            sections; Ctrl/Cmd K searches.
          </p>
        </Card>
      </div>

      <Modal open={pendingImport !== null} onClose={closeImport} title="Import backup">
        <p className="hint">
          This replaces your current data with the chosen backup. Export first if you want a
          rollback point.
        </p>
        <div className="counts">
          <span className="chip">{countList(pendingImport, 'blocks')} blocks</span>
          <span className="chip">{countList(pendingImport, 'tasks')} tasks</span>
          <span className="chip">{countList(pendingImport, 'notes')} notes</span>
          <span className="chip">{countList(pendingImport, 'deadlines')} deadlines</span>
        </div>
        <div className="row end">
          <Button variant="ghost" onClick={closeImport}>
            Cancel
          </Button>
          <Button variant="primary" data-action="import-confirm" onClick={confirmImport}>
            Import backup
          </Button>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={closeClear} title="Clear all data">
        <p className="hint">
          This permanently removes every block, task, note, deadline and day of history. It cannot
          be undone.
        </p>
        <div className="field">
          <label htmlFor="clear-confirm-input">
            Type <span className="mono">{CLEAR_CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            id="clear-confirm-input"
            className="settings-input"
            type="text"
            autoComplete="off"
            value={clearText}
            onChange={(event) => setClearText(event.target.value)}
          />
        </div>
        <div className="row end">
          <Button variant="ghost" onClick={closeClear}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-action="clear-confirm"
            disabled={!isClearConfirmation(clearText)}
            onClick={confirmClear}
          >
            Clear everything
          </Button>
        </div>
      </Modal>
    </div>
  );
};
