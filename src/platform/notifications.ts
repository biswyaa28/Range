import type {
  NotificationAdapter,
  NotificationPermissionState,
  ScheduledNotification,
} from './types';

function mapPermission(value: string | undefined): NotificationPermissionState {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  if (value === 'prompt' || value === 'prompt-with-rationale' || value === 'default') {
    return 'prompt';
  }
  return 'unsupported';
}

/** Web Notification API; reminders fire only while the page stays open. */
export class WebNotifications implements NotificationAdapter {
  private timers: number[] = [];

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  async permission(): Promise<NotificationPermissionState> {
    if (!this.isSupported()) return 'unsupported';
    try {
      return mapPermission(Notification.permission);
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (!this.isSupported()) return 'unsupported';
    try {
      const result =
        Notification.permission === 'default'
          ? await Notification.requestPermission()
          : Notification.permission;
      return mapPermission(result);
    } catch {
      return 'denied';
    }
  }

  async schedule(items: readonly ScheduledNotification[]): Promise<void> {
    await this.cancelAll();
    if (!this.isSupported() || Notification.permission !== 'granted') return;
    const now = Date.now();
    for (const item of items) {
      const delay = item.at - now;
      if (delay <= 0) continue;
      const timer = window.setTimeout(() => {
        try {
          new Notification(item.title, { body: item.body, tag: `personalos-${item.id}` });
        } catch {
          // Ignore: the OS may refuse notifications in the background.
        }
      }, delay);
      this.timers.push(timer);
    }
  }

  async cancelAll(): Promise<void> {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}

export const webNotifications = new WebNotifications();

/** Android via @capacitor/local-notifications; the OS owns scheduling. */
export class CapacitorNotifications implements NotificationAdapter {
  isSupported(): boolean {
    return true;
  }

  async permission(): Promise<NotificationPermissionState> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.checkPermissions();
      return mapPermission(result.display);
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      const result = await LocalNotifications.requestPermissions();
      return mapPermission(result.display);
    } catch {
      return 'denied';
    }
  }

  async schedule(items: readonly ScheduledNotification[]): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: await this.pending() });
      await LocalNotifications.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          schedule: { at: new Date(item.at), allowWhileIdle: true },
        })),
      });
    } catch {
      // Permission revoked or plugin unavailable: leave the app usable.
    }
  }

  async cancelAll(): Promise<void> {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications');
      await LocalNotifications.cancel({ notifications: await this.pending() });
    } catch {
      // ignore
    }
  }

  private async pending(): Promise<{ id: number }[]> {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const list = await LocalNotifications.getPending();
    return list.notifications.map((item) => ({ id: item.id }));
  }
}

export const capacitorNotifications = new CapacitorNotifications();

/** macOS via tauri-plugin-notification; future items use in-app timers. */
export class TauriNotifications implements NotificationAdapter {
  private timers: number[] = [];

  isSupported(): boolean {
    return true;
  }

  async permission(): Promise<NotificationPermissionState> {
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      return (await isPermissionGranted()) ? 'granted' : 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { isPermissionGranted, requestPermission } =
        await import('@tauri-apps/plugin-notification');
      if (await isPermissionGranted()) return 'granted';
      const result = await requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }

  async schedule(items: readonly ScheduledNotification[]): Promise<void> {
    await this.cancelAll();
    const { sendNotification } = await import('@tauri-apps/plugin-notification');
    const now = Date.now();
    for (const item of items) {
      const delay = item.at - now;
      if (delay <= 0) continue;
      const timer = window.setTimeout(() => {
        try {
          sendNotification({ title: item.title, body: item.body });
        } catch {
          // ignore
        }
      }, delay);
      this.timers.push(timer);
    }
  }

  async cancelAll(): Promise<void> {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
  }
}

export const tauriNotifications = new TauriNotifications();
