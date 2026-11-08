import type { ComponentProps } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { hexToRGB, resolveAccent } from '@/domain/color';
import { todayISO } from '@/domain/dates';
import { store } from '@/store';
import { fileSaver } from '@/platform';
import { ToastProvider } from '@/ui/Toast';
import { SettingsView } from '@/features/settings/SettingsView';

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
  beforeEach(() => {
    store.importAll(defaultState());
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
});
