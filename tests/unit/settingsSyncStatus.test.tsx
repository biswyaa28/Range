import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { defaultState } from '@/domain/types';
import { aiKeyStore, settingsStore, store } from '@/store';
import { ToastProvider } from '@/ui/Toast';
import { SettingsView } from '@/features/settings/SettingsView';
import type { SyncAccount, SyncState, SyncStatus } from '@/sync/types';

const ACCOUNT: SyncAccount = {
  uid: 'user-1',
  email: 'ada@example.com',
  displayName: 'Ada',
  photoURL: null,
};

/**
 * The sync section is fed by `useSync`, which owns a subscription. The state
 * is swapped per test so the Settings copy can be checked for each status.
 */
const sync = vi.hoisted(() => ({
  state: null as unknown,
  signIn: () => Promise.resolve(),
  signOut: () => Promise.resolve(),
  syncNow: () => Promise.resolve(),
}));

vi.mock('@/sync/useSync', () => ({ useSync: () => sync }));

function syncState(patch: Partial<SyncState> = {}): SyncState {
  return {
    configured: true,
    status: 'idle' as SyncStatus,
    account: ACCOUNT,
    lastSyncedAt: null,
    pending: false,
    error: null,
    notice: null,
    ...patch,
  };
}

function renderSettings() {
  render(
    <ToastProvider>
      <SettingsView />
    </ToastProvider>,
  );
}

function statusRow(): HTMLElement {
  const row = document.querySelector('[data-setting="sync-status"]');
  if (!(row instanceof HTMLElement)) throw new Error('The sync status row is missing.');
  return row;
}

describe('the sync status in Settings', () => {
  beforeEach(async () => {
    store.importAll(defaultState());
    settingsStore.reset();
    await aiKeyStore.clear();
    sync.state = syncState();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows how long ago the last sync ran', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    sync.state = syncState({ lastSyncedAt: fiveMinutesAgo });

    renderSettings();

    expect(screen.getByText('Last synced 5 minutes ago')).toBeTruthy();
  });

  it('says when nothing has synced yet', () => {
    renderSettings();

    expect(screen.getByText('Not synced yet')).toBeTruthy();
  });

  it('shows the message when the last sync failed', () => {
    sync.state = syncState({
      status: 'error',
      error: 'The remote refused the write.',
    });

    renderSettings();

    const description = statusRow().querySelector('.settings-sync-error');
    expect(description?.textContent).toBe('The remote refused the write.');
  });

  it('keeps the pending note next to the last sync time', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    sync.state = syncState({ lastSyncedAt: twoHoursAgo, pending: true });

    renderSettings();

    expect(
      screen.getByText('Last synced 2 hours ago. New changes are waiting to sync.'),
    ).toBeTruthy();
  });

  it('shows the notice from the last sync', () => {
    sync.state = syncState({
      lastSyncedAt: new Date().toISOString(),
      notice: 'Older stats were trimmed to keep sync working',
    });

    renderSettings();

    expect(
      screen.getByText('Older stats were trimmed to keep sync working'),
    ).toBeTruthy();
  });
});
