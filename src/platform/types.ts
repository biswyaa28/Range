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

export interface HealthDataSummary {
  steps?: number;
  sleepHours?: number;
  restingHeartRate?: number;
  updatedAt?: string;
}

export interface HealthProvider {
  isAvailable(): Promise<boolean>;
  getSummary(dateISO: string): Promise<HealthDataSummary | null>;
}

