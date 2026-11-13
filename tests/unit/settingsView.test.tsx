import type { ComponentProps } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { defaultSettings } from '@/domain/settings';
import { hexToRGB, resolveAccent } from '@/domain/color';
import { todayISO } from '@/domain/dates';
import { aiKeyStore, settingsStore, store } from '@/store';
import { fileSaver } from '@/platform';
import { ToastProvider } from '@/ui/Toast';
import { SettingsView } from '@/features/settings/SettingsView';

// Sync configuration is build-time state; pin it so this suite does not depend
// on whether the developer's .env.local contains Firebase credentials.
vi.mock('@/sync/useSync', () => ({
  useSync: () => ({
    state: {
      configured: false,
      status: 'disabled',
      account: null,
      lastSyncedAt: null,
      pending: false,
      error: null,
    },
    signIn: vi.fn(),
    signOut: vi.fn(),
    syncNow: vi.fn(),
  }),
}));

function renderSettings(props: ComponentProps<typeof SettingsView> = {}) {
  return render(
    <ToastProvider>
      <SettingsView {...props} />
    </ToastProvider>,
  );
}

function colorMatches(value: string, hex: string): boolean {
  const [r, g, b] = hexToRGB(hex);
  const normalized = value.replace(/\s+/g, '').toLowerCase();
  return normalized === hex.toLowerCase() || normalized === `rgb(${r},${g},${b})`;
}

describe('SettingsView', () => {
  beforeEach(async () => {
    store.importAll(defaultState());
    settingsStore.reset();
    await aiKeyStore.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('changes theme and accent with a live contrast preview', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(store.get().settings.theme).toBe('light');

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    expect(store.get().settings.theme).toBe('dark');

    fireEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(store.get().profile.accent).toBe('blue');

    const preview = document.querySelector('[data-accent-preview]');
    expect(preview).not.toBeNull();
    const link = within(preview as HTMLElement).getByText('a link');
    const pill = within(preview as HTMLElement).getByText('Primary');
    const applied = resolveAccent('blue', store.get().profile.customAccent, true);
    expect(colorMatches(link.style.color, applied.accentText)).toBe(true);
    expect(colorMatches(pill.style.color, applied.onAccent)).toBe(true);
    expect(colorMatches(pill.style.background, applied.accent)).toBe(true);
  });

  it('applies a custom accent color live', () => {
    renderSettings();

    fireEvent.change(screen.getByLabelText('Custom accent color'), {
      target: { value: '#123456' },
    });

    expect(store.get().profile.accent).toBe('custom');
    expect(store.get().profile.customAccent).toBe('#123456');

    const applied = resolveAccent('custom', '#123456', false);
    const preview = document.querySelector('[data-accent-preview]');
    const pill = within(preview as HTMLElement).getByText('Primary');
    expect(colorMatches(pill.style.background, applied.accent)).toBe(true);
  });

  it('persists haptics toggles, intensity and sound', () => {
    renderSettings();

    const hapticsSwitch = screen.getByRole('switch', { name: 'Haptic feedback' });
    expect(hapticsSwitch.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(hapticsSwitch);
    expect(store.get().profile.haptics.on).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Strong' }));
    expect(store.get().profile.haptics.level).toBe('strong');

    const soundSwitch = screen.getByRole('switch', { name: 'Sound feedback' });
    expect(soundSwitch.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(soundSwitch);
    expect(store.get().profile.haptics.sound).toBe(true);

    expect(store.get().profile.haptics).toEqual({
      on: false,
      level: 'strong',
      sound: true,
    });
  });

  it('updates the name and caps it at 40 characters', () => {
    renderSettings();

    const input = screen.getByLabelText('Name shown in your Home greeting');
    fireEvent.change(input, { target: { value: 'Ada Lovelace' } });
    expect(store.get().profile.name).toBe('Ada Lovelace');

    fireEvent.change(input, { target: { value: 'x'.repeat(60) } });
    expect(store.get().profile.name).toHaveLength(40);
  });

  it('opens personalization and the shortcut cheat sheet from their buttons', () => {
    const onOpenOnboarding = vi.fn();
    const onOpenShortcuts = vi.fn();
    renderSettings({ onOpenOnboarding, onOpenShortcuts });

    fireEvent.click(document.querySelector('[data-action="personalize"]') as HTMLElement);
    expect(onOpenOnboarding).toHaveBeenCalledTimes(1);

    fireEvent.click(
      document.querySelector('[data-action="personalize-profile"]') as HTMLElement,
    );
    expect(onOpenOnboarding).toHaveBeenCalledTimes(2);

    fireEvent.click(
      document.querySelector('[data-action="open-shortcuts"]') as HTMLElement,
    );
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);
  });

  it('loads and removes demo data without replacing the profile', () => {
    store.set((state) => {
      state.profile.name = 'Ada';
      state.profile.onboarded = true;
    });
    renderSettings();

    fireEvent.click(document.querySelector('[data-action="demo-load"]') as HTMLElement);

    let state = store.get();
    expect(state.settings.seeded).toBe(true);
    expect(state.blocks.length).toBeGreaterThan(0);
    expect(state.tasks.length).toBeGreaterThan(0);
    expect(state.profile.name).toBe('Ada');
    expect(state.profile.onboarded).toBe(true);

    fireEvent.click(document.querySelector('[data-action="demo-remove"]') as HTMLElement);
    state = store.get();
    expect(state.settings.seeded).toBe(false);
    expect(state.blocks).toHaveLength(0);
    expect(state.tasks).toHaveLength(0);
    expect(state.profile.name).toBe('Ada');
    expect(state.profile.onboarded).toBe(true);
  });

  it('exports with the personal-os date filename', async () => {
    const saveSpy = vi.spyOn(fileSaver, 'saveFile').mockResolvedValue();
    renderSettings();

    fireEvent.click(document.querySelector('[data-action="export-data"]') as HTMLElement);

    await waitFor(() => expect(saveSpy).toHaveBeenCalledTimes(1));
    const call = saveSpy.mock.calls[0];
    expect(call?.[1]).toBe(`personal-os-${todayISO()}.json`);
    expect(call?.[0]).toBeInstanceOf(Blob);
    expect((call?.[0] as Blob).size).toBeGreaterThan(0);
  });

  it('validates and confirms an imported backup', async () => {
    renderSettings();

    const input = document.getElementById('imp-file') as HTMLInputElement;
    const file = new File(
      [
        JSON.stringify({
          tasks: [
            {
              id: 'imported-1',
              title: 'Imported task',
              due: null,
              priority: 'high',
              done: false,
              category: '',
              createdAt: '2026-04-10T00:00:00.000Z',
              updatedAt: '2026-04-10T00:00:00.000Z',
              deleted: false,
              deviceId: 'other',
            },
          ],
        }),
      ],
      'backup.json',
      { type: 'application/json' },
    );

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Import backup' })).not.toBeNull();
    });
    expect(screen.getByText('1 tasks')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Import backup' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Import backup' })).toBeNull();
    });
    const state = store.get();
    expect(state.tasks).toHaveLength(1);
    expect(state.tasks[0]?.title).toBe('Imported task');
    expect(state.profile.name).toBe('');
  });

  it('rejects a non-backup file without opening the confirm dialog', async () => {
    renderSettings();

    const input = document.getElementById('imp-file') as HTMLInputElement;
    const file = new File(['{"hello":"world"}'], 'not-a-backup.json', {
      type: 'application/json',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(
        screen.getByText(
          'Not a Personal OS backup — expected blocks, tasks, notes or deadlines.',
        ),
      ).not.toBeNull();
    });
    expect(screen.queryByRole('dialog', { name: 'Import backup' })).toBeNull();
  });

  it('requires the typed phrase before clearing every record', () => {
    store.set((state) => {
      state.profile.name = 'Ada';
      state.profile.onboarded = true;
      state.tasks = [
        {
          id: 'task-1',
          title: 'Keep me',
          due: null,
          priority: 'med',
          done: false,
          category: '',
          createdAt: '2026-04-10T00:00:00.000Z',
          updatedAt: '2026-04-10T00:00:00.000Z',
          deleted: false,
          deviceId: store.get().deviceId || 'dev',
        },
      ];
    });
    renderSettings();

    fireEvent.click(document.querySelector('[data-action="clear-data"]') as HTMLElement);
    const confirm = screen.getByRole('button', { name: 'Clear everything' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type clear to confirm/), {
      target: { value: 'nope' },
    });
    expect(confirm.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Type clear to confirm/), {
      target: { value: 'clear' },
    });
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);

    const state = store.get();
    expect(state.tasks).toHaveLength(0);
    expect(state.blocks).toHaveLength(0);
    expect(state.profile.name).toBe('');
    expect(state.profile.onboarded).toBe(false);
    expect(typeof state.clearedAt).toBe('string');
    expect((state.clearedAt ?? '').length).toBeGreaterThan(0);
  });

  it('filters the grouped list by search and reopens every section', () => {
    renderSettings();

    const search = screen.getByLabelText('Search settings');
    fireEvent.change(search, { target: { value: 'radius' } });

    expect(screen.getByRole('heading', { name: 'Appearance' })).not.toBeNull();
    expect(screen.getByRole('slider', { name: 'Corner radius' })).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Notifications' })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzz-not-a-setting' } });
    expect(screen.getByText('No settings found')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect((search as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('heading', { name: 'Notifications' })).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Data' })).not.toBeNull();
  });

  it('applies font, density, radius and motion to the document immediately', () => {
    renderSettings();

    fireEvent.click(screen.getByRole('radio', { name: 'Serif' }));
    expect(settingsStore.get().font).toBe('serif');
    expect(document.documentElement.dataset['font']).toBe('serif');

    fireEvent.click(screen.getByRole('radio', { name: 'Compact' }));
    expect(settingsStore.get().density).toBe('compact');
    expect(document.documentElement.dataset['density']).toBe('compact');
    expect(document.documentElement.style.getPropertyValue('--gap')).toBe('14px');

    fireEvent.change(screen.getByRole('slider', { name: 'Corner radius' }), {
      target: { value: '8' },
    });
    expect(settingsStore.get().cornerRadius).toBe(8);
    expect(document.documentElement.style.getPropertyValue('--r-card')).toBe('8px');

    fireEvent.click(screen.getByRole('radio', { name: 'Reduced' }));
    expect(settingsStore.get().animation).toBe('reduced');
    expect(document.documentElement.dataset['motion']).toBe('reduced');
    expect(document.documentElement.style.getPropertyValue('--dur-base')).toBe('160ms');
  });

  it('reorders and hides Home widgets through the settings store and legacy layout', () => {
    renderSettings();

    const before = settingsStore.get().homeWidgets.order.indexOf('focus');
    fireEvent.click(screen.getByRole('button', { name: 'Move Focus up' }));
    const after = settingsStore.get().homeWidgets.order.indexOf('focus');
    expect(after).toBe(before - 1);
    expect(store.get().layout.order).toEqual(settingsStore.get().homeWidgets.order);

    fireEvent.click(screen.getByRole('switch', { name: 'Show Calendar on Home' }));
    expect(settingsStore.get().homeWidgets.visible['calendar']).toBe(false);
    expect(store.get().layout.hidden).toContain('calendar');

    fireEvent.click(screen.getByRole('switch', { name: 'Show Calendar on Home' }));
    expect(settingsStore.get().homeWidgets.visible['calendar']).toBe(true);
    expect(store.get().layout.hidden).not.toContain('calendar');

    fireEvent.click(screen.getByRole('button', { name: 'Move Calendar up' }));
    expect(settingsStore.get().homeWidgets.order.indexOf('calendar')).toBe(
      store.get().layout.order.indexOf('calendar'),
    );
  });

  it('supports pointer drag reordering of Home widgets', () => {
    renderSettings();

    const handle = document.querySelector(
      '[data-widget-id="focus"] .settings-widget-grip',
    ) as HTMLElement;
    const target = document.querySelector('[data-widget-id="tasks"]') as HTMLElement;
    expect(handle).not.toBeNull();
    expect(target).not.toBeNull();

    const original = document.elementFromPoint;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => target,
    });

    try {
      const before = settingsStore.get().homeWidgets.order.indexOf('focus');
      fireEvent.pointerDown(handle, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 0,
        clientX: 10,
        clientY: 10,
      });
      fireEvent.pointerMove(handle, { pointerId: 1, clientX: 20, clientY: 100 });
      fireEvent.pointerUp(handle, { pointerId: 1 });
      expect(settingsStore.get().homeWidgets.order.indexOf('focus')).toBeGreaterThan(before);
    } finally {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: original,
      });
    }
  });

  it('updates notification, timetable and AI preferences', async () => {
    renderSettings();

    fireEvent.click(screen.getByRole('switch', { name: 'Deadline reminders' }));
    expect(settingsStore.get().notifications.deadlines).toBe(false);

    fireEvent.click(screen.getByRole('switch', { name: 'Quiet hours' }));
    expect(settingsStore.get().notifications.quietHours.enabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Quiet hours start'), {
      target: { value: '21:15' },
    });
    expect(settingsStore.get().notifications.quietHours.start).toBe('21:15');

    fireEvent.click(screen.getByRole('radio', { name: 'Sunday' }));
    expect(settingsStore.get().weekStart).toBe(0);
    expect(document.documentElement.dataset['weekStart']).toBe('0');

    fireEvent.change(screen.getByLabelText('Class block color'), {
      target: { value: '#123456' },
    });
    expect(settingsStore.get().timetableColors['class']).toBe('#123456');
    expect(document.documentElement.style.getPropertyValue('--block-class')).toBe('#123456');

    fireEvent.click(screen.getByRole('switch', { name: 'AI assistance' }));
    fireEvent.change(screen.getByLabelText('AI provider'), {
      target: { value: 'gemini' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Read your notes' }));

    const keyInput = screen.getByLabelText('AI API key') as HTMLInputElement;
    await waitFor(() => expect(keyInput.disabled).toBe(false));
    fireEvent.change(keyInput, {
      target: { value: 'AIza-settings-123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(aiKeyStore.getKey()).toBe('AIza-settings-123456'));
    expect(settingsStore.get().ai).toEqual({
      enabled: true,
      provider: 'gemini',
      canReadNotes: true,
    });
    expect(settingsStore.get().ai).not.toHaveProperty('apiKey');
  });

  it('resets preferences without touching records', () => {
    store.set((state) => {
      state.profile.name = 'Ada';
      state.tasks = [
        {
          id: 'task-1',
          title: 'Keep me',
          due: null,
          priority: 'med',
          done: false,
          category: '',
          createdAt: '2026-04-10T00:00:00.000Z',
          updatedAt: '2026-04-10T00:00:00.000Z',
          deleted: false,
          deviceId: store.get().deviceId || 'dev',
        },
      ];
    });
    renderSettings();

    fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Serif' }));
    fireEvent.click(document.querySelector('[data-action="reset-settings"]') as HTMLElement);

    expect({ ...settingsStore.get(), updatedAt: 'ignored' }).toEqual({
      ...defaultSettings(),
      updatedAt: 'ignored',
    });
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(store.get().settings.theme).toBe('auto');
    expect(store.get().profile.name).toBe('Ada');
    expect(store.get().tasks).toHaveLength(1);
  });

  it('shows local-only sync status until Firebase is configured', () => {
    renderSettings();

    const section = document.querySelector('[data-section="sync"]');
    expect(section).not.toBeNull();
    const syncSection = within(section as HTMLElement);
    expect(syncSection.getByText('Not configured')).not.toBeNull();
    expect(syncSection.getByText('Local only')).not.toBeNull();
    expect(
      syncSection.getByText('Add Firebase environment variables to turn on sync.'),
    ).not.toBeNull();
  });
});
