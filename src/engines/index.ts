export * from './spring';
export * from './haptics';
export * from './pomodoro';
export * from './noise';
export * from './llm';

import { PomodoroEngine } from './pomodoro';
import { NoiseEngine } from './noise';

/** Long-lived engines shared by the Home card, Focus view and Focus Mode. */
export const pomodoro = new PomodoroEngine();
export const noise = new NoiseEngine();
