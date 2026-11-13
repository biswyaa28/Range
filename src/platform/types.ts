export type HapticsKind = 'tap' | 'select' | 'success' | 'warning' | 'error' | 'impact';

export interface HapticsAdapter {
  tap(target?: HTMLElement | null): void;
  select(target?: HTMLElement | null): void;
  success(target?: HTMLElement | null): void;
  warning(target?: HTMLElement | null): void;
  error(target?: HTMLElement | null): void;
  impact(target?: HTMLElement | null): void;
}

export interface FileSaver {
  saveFile(blob: Blob, filename: string): Promise<void>;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * Async key/value storage for secrets. Implementations must use the platform's
 * protected store (Keychain, Android Keystore) and never plain web storage.
 */
export interface SecureStorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface HealthDataSummary {
  steps?: number;
  sleepHours?: number;
  activeCalories?: number;
  restingHeartRate?: number;
  updatedAt?: string;
}

export type HealthAccessState = 'granted' | 'denied' | 'unavailable';

export interface HealthProvider {
  isAvailable(): Promise<boolean>;
  requestAccess(): Promise<HealthAccessState>;
  getSummary(dateISO: string): Promise<HealthDataSummary | null>;
  openSettings(): Promise<void>;
}

