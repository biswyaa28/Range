import {
  INTEGRATION_STORAGE_KEY,
  defaultIntegrationSnapshot,
  type ClassroomSnapshot,
  type GmailSnapshot,
  type IntegrationAuthStatus,
  type IntegrationSettings,
  type IntegrationSnapshot,
} from '@/domain/integrations';
import { storage } from '@/platform';

type Listener = () => void;

function strings(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, max);
}

function settingsFrom(value: unknown): IntegrationSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    gmail: raw['gmail'] === true,
    classroom: raw['classroom'] === true,
    aiRead: raw['aiRead'] === true,
    senderFilters: strings(raw['senderFilters']),
    labelFilters: strings(raw['labelFilters'], 5),
    classroomNotifications: raw['classroomNotifications'] === true,
    includeInBackup: raw['includeInBackup'] === true,
  };
}

function authFrom(value: unknown): IntegrationAuthStatus {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const state = raw['state'];
  return {
    state:
      state === 'connected' || state === 'reconnect' || state === 'unavailable'
        ? state
        : 'disconnected',
    scopes: strings(raw['scopes'], 10),
    expiresAt: typeof raw['expiresAt'] === 'string' ? raw['expiresAt'] : null,
    lastError: typeof raw['lastError'] === 'string' ? raw['lastError'].slice(0, 200) : null,
  };
}

function snapshotFrom(value: unknown): IntegrationSnapshot {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const classroom = raw['classroom'];
  const gmail = raw['gmail'];
  return {
    settings: settingsFrom(raw['settings']),
    auth: authFrom(raw['auth']),
    classroom:
      classroom && typeof classroom === 'object'
        ? (classroom as ClassroomSnapshot)
        : null,
    gmail: gmail && typeof gmail === 'object' ? (gmail as GmailSnapshot) : null,
  };
}

function load(): IntegrationSnapshot {
  try {
    const raw = storage.getItem(INTEGRATION_STORAGE_KEY);
    return raw ? snapshotFrom(JSON.parse(raw)) : defaultIntegrationSnapshot();
  } catch {
    return defaultIntegrationSnapshot();
  }
}

class IntegrationStore {
  private state: IntegrationSnapshot = load();
  private listeners = new Set<Listener>();

  get = (): IntegrationSnapshot => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  set = (mutator: (state: IntegrationSnapshot) => void): void => {
    const next = snapshotFrom(this.state);
    mutator(next);
    this.state = next;
    try {
      storage.setItem(INTEGRATION_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Cache persistence is best-effort; secure tokens live elsewhere.
    }
    this.listeners.forEach((listener) => listener());
  };

  patchSettings = (patch: Partial<IntegrationSettings>): void => {
    this.set((state) => {
      state.settings = { ...state.settings, ...patch };
      if (patch.senderFilters) state.settings.senderFilters = strings(patch.senderFilters);
      if (patch.labelFilters) state.settings.labelFilters = strings(patch.labelFilters, 5);
    });
  };

  setAuth = (patch: Partial<IntegrationAuthStatus>): void => {
    this.set((state) => {
      state.auth = { ...state.auth, ...patch };
    });
  };

  setClassroom = (snapshot: ClassroomSnapshot | null): void => {
    this.set((state) => {
      state.classroom = snapshot;
    });
  };

  setGmail = (snapshot: GmailSnapshot | null): void => {
    this.set((state) => {
      state.gmail = snapshot;
    });
  };

  clearIntegration = (id: 'gmail' | 'classroom'): void => {
    this.set((state) => {
      if (id === 'gmail') state.gmail = null;
      else state.classroom = null;
    });
  };

  reset = (): void => {
    this.state = defaultIntegrationSnapshot();
    try {
      storage.removeItem(INTEGRATION_STORAGE_KEY);
    } catch {
      // ignore
    }
    this.listeners.forEach((listener) => listener());
  };

  exportSnapshot = (): IntegrationSnapshot => snapshotFrom(this.state);

  importSnapshot = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false;
    this.state = snapshotFrom(value);
    try {
      storage.setItem(INTEGRATION_STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
    this.listeners.forEach((listener) => listener());
    return true;
  };
}

export const integrationStore = new IntegrationStore();
