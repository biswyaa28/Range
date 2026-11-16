import { planNotifications } from '@/domain/notifications';
import type { NotificationPermissionState } from '@/platform';
import { notifications } from '@/platform';
import { settingsStore, store } from '@/store';

let debounceTimer: number | undefined;
let running = false;

/** Cancels every scheduled reminder and re-plans the next 14 days. */
export async function syncNotifications(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const settings = settingsStore.get().notifications;
    if (!settings.enabled || !notifications.isSupported()) {
      await notifications.cancelAll();
      return;
    }
    if ((await notifications.permission()) !== 'granted') {
      await notifications.cancelAll();
      return;
    }
    const state = store.get();
    const planned = planNotifications({
      blocks: state.blocks,
      deadlines: state.deadlines,
      tasks: state.tasks,
      habits: state.habits,
      settings,
    });
    await notifications.schedule(
      planned.map((item) => ({
        id: item.id,
        at: new Date(item.at).getTime(),
        title: item.title,
        body: item.body,
      })),
    );
  } catch {
    // Reminders are best-effort; never block the app.
  } finally {
    running = false;
  }
}

/** Re-plans after data or settings changes, debounced to avoid churn. */
export function watchNotifications(): () => void {
  const schedule = (): void => {
    if (typeof window === 'undefined') return;
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = undefined;
      void syncNotifications();
    }, 800);
  };

  const unsubscribeSettings = settingsStore.subscribe(schedule);
  const unsubscribeStore = store.subscribe(schedule);
  schedule();

  return () => {
    unsubscribeSettings();
    unsubscribeStore();
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
  };
}

/** Asks the OS for permission; call from a user gesture. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notifications.isSupported()) return 'unsupported';
  return notifications.requestPermission();
}

export async function notificationPermission(): Promise<NotificationPermissionState> {
  return notifications.permission();
}
