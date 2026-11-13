import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Haptics } from '@/engines';
import {
  exportBackup,
  getPersistenceStatus,
  settingsStore,
  store,
  subscribePersistenceStatus,
} from '@/store';
import { Button } from '@/ui/Button';
import './StorageNotice.css';

interface NoticeOutcome {
  kind: 'success' | 'error';
  message: string;
}

/**
 * Shown while a save is failing. Without it a full or blocked browser storage
 * leaves edits in memory only, with no visible sign that they are unsaved.
 */
export const StorageNotice: React.FC = () => {
  const status = useSyncExternalStore(
    subscribePersistenceStatus,
    getPersistenceStatus,
    getPersistenceStatus,
  );
  const [outcome, setOutcome] = useState<NoticeOutcome | null>(null);
  const noticeRef = useRef<HTMLDivElement | null>(null);
  const failed = status.failed;

  // Publish the banner height so the toast stack can move above it instead of
  // covering it. The height depends on how the copy wraps.
  useEffect(() => {
    if (!failed || typeof document === 'undefined') return;
    const element = noticeRef.current;
    if (!element) return;

    const body = document.body;
    body.classList.add('storage-warning');

    const sync = () => {
      body.style.setProperty('--storage-warning-height', `${element.offsetHeight}px`);
    };
    sync();

    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(sync);
    if (observer) observer.observe(element);
    else window.addEventListener('resize', sync);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', sync);
      body.classList.remove('storage-warning');
      body.style.removeProperty('--storage-warning-height');
    };
  }, [failed]);

  // A stale "still failing" message must not greet the next failure.
  useEffect(() => {
    if (!failed) setOutcome(null);
  }, [failed]);

  // Exports the in-memory state, which is the only copy left when saving fails.
  const handleExport = async (): Promise<void> => {
    try {
      const filename = await exportBackup();
      Haptics.success();
      setOutcome({ kind: 'success', message: `Backup saved as ${filename}.` });
    } catch {
      Haptics.error();
      setOutcome({ kind: 'error', message: 'Export failed. Try again.' });
    }
  };

  const handleRetry = (): void => {
    store.flush();
    settingsStore.flush();
    if (getPersistenceStatus().failed) {
      setOutcome({
        kind: 'error',
        message: 'Still not saving. Free up space, then try again.',
      });
    }
  };

  if (!failed) return null;

  return (
    <div className="storage-notice" role="alert" ref={noticeRef}>
      <div className="storage-notice-copy">
        <strong>Changes aren&apos;t being saved.</strong>
        <span className="storage-notice-hint">
          Browser storage is full or blocked. Export a backup and free up space before
          closing this tab.
        </span>
        {outcome && (
          <span
            className={`storage-notice-outcome storage-notice-outcome-${outcome.kind}`}
            role="status"
          >
            {outcome.message}
          </span>
        )}
      </div>
      <div className="storage-notice-actions">
        <Button
          variant="primary"
          data-action="export-backup"
          onClick={() => void handleExport()}
        >
          Export backup
        </Button>
        <Button variant="secondary" data-action="retry-save" onClick={handleRetry}>
          Retry saving
        </Button>
      </div>
    </div>
  );
};
