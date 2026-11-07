import { webHaptics, webFileSaver, webStorage, webHealth } from './web';
import type { HapticsAdapter, FileSaver, StorageAdapter, HealthProvider } from './types';

export * from './types';

// Default platform implementation is Web (can be swapped for native or desktop at build/runtime)
export const haptics: HapticsAdapter = webHaptics;
export const fileSaver: FileSaver = webFileSaver;
export const storage: StorageAdapter = webStorage;
export const health: HealthProvider = webHealth;

