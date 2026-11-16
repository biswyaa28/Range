import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AppRoute } from '@/hooks';
import type { Deadline, Task } from '@/domain/types';
import {
  classroomPlanItems,
  type ClassroomAnnouncement,
  type ClassroomPlanItem,
  type GmailDigestItem,
} from '@/domain/integrations';
import { fmtShort, formatRelativeTime } from '@/domain/dates';
import { store, stampNewRecord } from '@/store';
import { useIntegrations } from '@/integrations/useIntegrations';
import {
  connectIntegration,
  integrationsAvailable,
  integrationsMocked,
  refreshClassroom,
  refreshGmail,
  refreshStaleIntegrations,
} from '@/integrations/controller';
import { openExternal } from '@/platform/openExternal';
import { EmptyState } from '@/ui/EmptyState';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { VirtualRows } from '@/ui/VirtualRows';
import { useToast } from '@/ui/Toast';
import { Haptics } from '@/engines/haptics';
import { AiDigestSummary } from './AiDigestSummary';
import './InboxView.css';

type InboxTab = 'all' | 'gmail' | 'classroom';

type Entry =
  | { key: string; type: 'gmail'; item: GmailDigestItem }
  | { key: string; type: 'classroom-work'; item: ClassroomPlanItem }
  | { key: string; type: 'classroom-announcement'; item: ClassroomAnnouncement };

export interface InboxViewProps {
  onNavigate?: (route: AppRoute) => void;
}

function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}

function digestState(item: GmailDigestItem): string {
  if (item.dueDate) return `Due ${fmtShort(item.dueDate)}${item.dueTime ? ` · ${item.dueTime}` : ''}`;
  return 'No date found';
}

function submissionLabel(state: ClassroomPlanItem['state']): string {
  switch (state) {
    case 'turned-in':
      return 'Turned in';
    case 'late':
      return 'Late';
    case 'missing':
      return 'Missing';
    case 'assigned':
      return 'Assigned';
    default:
      return 'Open in Classroom';
  }
}

export const InboxView: React.FC<InboxViewProps> = ({ onNavigate }) => {
  const toast = useToast();
  const integration = useIntegrations();
  const [tab, setTab] = useState<InboxTab>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [refreshTick, setRefreshTick] = useState(0);
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const touchStart = useRef<number | null>(null);
  const mounted = useRef(true);
  const available = integrationsAvailable();

  const refresh = useCallback(async (silent = false) => {
    if (!available) return;
    if (integrationsMocked()) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const state = integration;
      if (state.settings.classroom) await refreshClassroom();
      if (state.settings.gmail) await refreshGmail();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not refresh Google data.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [available, integration]);

  useEffect(() => {
    mounted.current = true;
    void refreshStaleIntegrations().then(() => refresh(true));
    const timer = window.setInterval(() => {
      void refreshStaleIntegrations();
    }, 6 * 60 * 60 * 1000);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
    // Opening the Inbox is the refresh trigger; the store subscription would
    // otherwise restart the fetch after every cache update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const classroomItems = useMemo(
    () => classroomPlanItems(integration.classroom),
    [integration.classroom],
  );

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    if (tab !== 'classroom') {
      for (const item of integration.gmail?.digest ?? []) {
        out.push({ key: item.id, type: 'gmail', item });
      }
    }
    if (tab !== 'gmail') {
      for (const item of classroomItems) {
        out.push({ key: item.id, type: 'classroom-work', item });
      }
      for (const item of integration.classroom?.announcements ?? []) {
        out.push({
          key: `announcement:${item.id}`,
          type: 'classroom-announcement',
          item,
        });
      }
    }
    return out;
  }, [classroomItems, integration.classroom, integration.gmail, tab]);

  const reconnect = async (): Promise<void> => {
    const id = integration.settings.classroom ? 'classroom' : 'gmail';
    try {
      await connectIntegration(id);
      await refresh();
      Haptics.success();
      toast.showToast('Google reconnected');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not reconnect Google.');
    }
  };

  const addDigestItem = (item: GmailDigestItem): void => {
    const key = `added:${item.id}`;
    if (added.has(key)) return;
    store.set((state) => {
      if (item.dueDate) {
        const deadline = stampNewRecord<Partial<Deadline>>(
          {
            title: item.subject.slice(0, 120),
            course: item.sender.slice(0, 60),
            due: item.dueDate,
            type: item.kind === 'exam' ? 'exam' : item.kind === 'announcement' ? 'announcement' : 'assignment',
            status: 'approved',
            source: 'personal',
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Deadline;
        state.deadlines.push(deadline);
      } else {
        const task = stampNewRecord<Partial<Task>>(
          {
            title: item.subject.slice(0, 160),
            due: null,
            priority: 'med',
            category: 'inbox',
            done: false,
          },
          state.deviceId,
          () => crypto.randomUUID(),
        ) as Task;
        state.tasks.unshift(task);
      }
    });
    setAdded((current) => new Set(current).add(key));
    Haptics.success();
    toast.showToast(item.dueDate ? 'Added to deadlines' : 'Added as a task');
    setRefreshTick((value) => value + 1);
  };

  const lastUpdated = integration.classroom?.fetchedAt ?? integration.gmail?.fetchedAt ?? '';
  const needsSetup = !integration.settings.gmail && !integration.settings.classroom;

  const reconnectState = integration.auth.state === 'reconnect';
  const disconnected = !available || needsSetup || integration.auth.state === 'disconnected';

  return (
    <div
      className="view-content inbox-view"
      data-refresh-tick={refreshTick}
      onTouchStart={(event) => {
        if ((window.scrollY || 0) <= 0) touchStart.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const start = touchStart.current;
        touchStart.current = null;
        const end = event.changedTouches[0]?.clientY;
        if (start !== null && end !== undefined && end - start > 70) void refresh();
      }}
    >
      <div className="view-head">
        <h1>Inbox</h1>
        <div className="rule" />
      </div>

      <div className="inbox-toolbar">
        <Segmented<InboxTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'all', label: 'All' },
            { value: 'gmail', label: 'Gmail' },
            { value: 'classroom', label: 'Classroom' },
          ]}
          aria-label="Inbox source"
        />
        <span className="inbox-updated">
          {lastUpdated ? `Updated ${formatRelativeTime(lastUpdated)}` : 'Not refreshed yet'}
        </span>
        {integration.settings.aiRead && (integration.gmail?.messages.length ?? 0) > 0 ? (
          <AiDigestSummary
            messages={integration.gmail?.messages ?? []}
            onOpenSettings={() => onNavigate?.('settings')}
          />
        ) : null}
        <Button
          variant="secondary"
          className="inbox-refresh"
          onClick={() => void refresh()}
          disabled={!available || loading || disconnected}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {!available ? (
        <EmptyState
          icon="cloud"
          title="Not available in the browser build"
          description="Google integrations work in the Android and Mac builds, where Google sign-in is available."
        />
      ) : needsSetup ? (
        <EmptyState
          icon="cloud"
          title="Connect Google"
          description="Enable Gmail or Classroom in Settings. Read-only scopes, on-device cache, no sending."
          action={
            <Button onClick={() => onNavigate?.('settings')}>Open integrations</Button>
          }
        />
      ) : reconnectState ? (
        <div className="panel inbox-reconnect" role="alert">
          <h2>Reconnect Google</h2>
          <p>
            {integration.auth.lastError ??
              'Google access expired. Reconnect to resume read-only syncing.'}
          </p>
          <Button onClick={() => void reconnect()}>Reconnect Google</Button>
        </div>
      ) : loading && entries.length === 0 ? (
        <div className="panel inbox-loading" role="status">
          Reading your digest…
        </div>
      ) : error && entries.length === 0 ? (
        <div className="panel inbox-error" role="alert">
          <p>{error}</p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {error ? (
            <p className="inbox-inline-error" role="status">
              {error} Showing cached data.
            </p>
          ) : null}
          {entries.length === 0 ? (
            <EmptyState
              icon="flag"
              title="Nothing needs attention"
              description="No recent Gmail deadlines or Classroom announcements in this view."
            />
          ) : (
            <VirtualRows
              items={entries}
              rowHeight={118}
              getKey={(entry) => entry.key}
              testId="inbox-rows"
              renderRow={(entry) => {
                if (entry.type === 'gmail') {
                  const item = entry.item;
                  return (
                    <article className="inbox-row" data-kind={item.kind}>
                      <div className="inbox-row-main">
                        <div className="inbox-row-top">
                          <span className="chip solid">Gmail · {kindLabel(item.kind)}</span>
                          {item.forwarded ? <span className="chip">Forwarded</span> : null}
                          <span className="chip mono">{digestState(item)}</span>
                        </div>
                        <h2>{item.subject}</h2>
                        <p className="inbox-meta">
                          {item.sender} · {fmtShort(item.receivedAt.slice(0, 10))}
                        </p>
                        <p className="inbox-snippet">{item.snippet}</p>
                      </div>
                      <Button
                        variant={item.dueDate ? 'primary' : 'secondary'}
                        className="inbox-add"
                        data-action="inbox-add"
                        data-id={item.id}
                        disabled={added.has(`added:${item.id}`)}
                        onClick={() => addDigestItem(item)}
                      >
                        {added.has(`added:${item.id}`)
                          ? 'Added'
                          : item.dueDate
                            ? 'Add deadline'
                            : 'Add task'}
                      </Button>
                    </article>
                  );
                }

                if (entry.type === 'classroom-work') {
                  const item = entry.item;
                  return (
                    <article className="inbox-row" data-kind={item.exam ? 'exam' : 'assignment'}>
                      <div className="inbox-row-main">
                        <div className="inbox-row-top">
                          <span className="chip solid">Classroom</span>
                          {item.exam ? <span className="chip red">Exam</span> : null}
                          <span className="chip mono">Due {fmtShort(item.due)}</span>
                          <span className="chip">{submissionLabel(item.state)}</span>
                        </div>
                        <h2>{item.title}</h2>
                        <p className="inbox-meta">{item.course || 'Classroom course'}</p>
                        <p className="inbox-snippet">
                          Read-only. Submitting coursework is not available through the Classroom API.
                        </p>
                      </div>
                      <Button
                        variant="secondary"
                        className="inbox-add"
                        data-action="classroom-open"
                        onClick={() => void openExternal(item.alternateLink)}
                        disabled={!item.alternateLink}
                      >
                        Open in Classroom
                      </Button>
                    </article>
                  );
                }

                const item = entry.item;
                return (
                  <article className="inbox-row" data-kind="announcement">
                    <div className="inbox-row-main">
                      <div className="inbox-row-top">
                        <span className="chip">Classroom announcement</span>
                        <span className="chip mono">
                          {fmtShort(item.createdAt.slice(0, 10))}
                        </span>
                      </div>
                      <h2>{item.courseName || 'Classroom'}</h2>
                      <p className="inbox-snippet">{item.text}</p>
                    </div>
                    <Button
                      variant="secondary"
                      className="inbox-add"
                      onClick={() => void openExternal(item.alternateLink)}
                      disabled={!item.alternateLink}
                    >
                      Open
                    </Button>
                  </article>
                );
              }}
            />
          )}
        </>
      )}

      <p className="inbox-privacy">
        Gmail and Classroom data stays on this device. Gmail is never marked, sent or deleted.
      </p>
    </div>
  );
};
