import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { todayISO } from '@/domain/dates';
import { StorageNotice } from '@/features/shell/StorageNotice';
import { fileSaver } from '@/platform';
import {
  getPersistenceStatus,
  reportWriteFailure,
  reportWriteSuccess,
  resetPersistenceStatus,
  settingsStore,
  store,
} from '@/store';

function renderNotice() {
  return render(<StorageNotice />);
}

describe('StorageNotice', () => {
  beforeEach(() => {
    resetPersistenceStatus();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    resetPersistenceStatus();
  });

  it('stays hidden while writes succeed', () => {
    renderNotice();

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('warns when a write fails and clears when saving recovers', () => {
    renderNotice();

    act(() => reportWriteFailure('state'));
    expect(screen.getByRole('alert').textContent).toContain("Changes aren't being saved.");

    act(() => reportWriteSuccess('state'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays visible until every failed area recovers', () => {
    renderNotice();

    act(() => reportWriteFailure('state'));
    act(() => reportWriteFailure('settings'));
    act(() => reportWriteSuccess('state'));
    expect(screen.getByRole('alert')).not.toBeNull();

    act(() => reportWriteSuccess('settings'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('publishes its height so toasts can clear it', () => {
    renderNotice();

    act(() => reportWriteFailure('state'));
    expect(document.body.classList.contains('storage-warning')).toBe(true);
    expect(document.body.style.getPropertyValue('--storage-warning-height')).toBe('0px');

    act(() => reportWriteSuccess('state'));
    expect(document.body.classList.contains('storage-warning')).toBe(false);
    expect(document.body.style.getPropertyValue('--storage-warning-height')).toBe('');
  });

  it('reports a successful export inside the banner', async () => {
    const save = vi.spyOn(fileSaver, 'saveFile').mockResolvedValue(undefined);
    renderNotice();

    act(() => reportWriteFailure('state'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    });

    const filename = `personal-os-${todayISO()}.json`;
    expect(save).toHaveBeenCalledWith(expect.any(Blob), filename);
    expect(screen.getByRole('status').textContent).toBe(`Backup saved as ${filename}.`);
    // Exporting a copy does not mean saving works again.
    expect(getPersistenceStatus().failed).toBe(true);
  });

  it('reports a failed export inside the banner', async () => {
    vi.spyOn(fileSaver, 'saveFile').mockRejectedValue(new Error('blocked'));
    renderNotice();

    act(() => reportWriteFailure('state'));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    });

    expect(screen.getByRole('status').textContent).toBe('Export failed. Try again.');
  });

  it('tells the user when a retry still cannot save', () => {
    vi.spyOn(store, 'flush').mockImplementation(() => undefined);
    vi.spyOn(settingsStore, 'flush').mockImplementation(() => undefined);
    renderNotice();

    act(() => reportWriteFailure('state'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));

    expect(screen.getByRole('status').textContent).toBe(
      'Still not saving. Free up space, then try again.',
    );
  });

  it('clears the banner once a retry writes successfully', () => {
    vi.spyOn(store, 'flush').mockImplementation(() => reportWriteSuccess('state'));
    vi.spyOn(settingsStore, 'flush').mockImplementation(() =>
      reportWriteSuccess('settings'),
    );
    renderNotice();

    act(() => reportWriteFailure('state'));
    act(() => reportWriteFailure('settings'));
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
