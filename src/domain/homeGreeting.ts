import { hmToMin } from './dates';

/**
 * Pure greeting copy for the Home smart card.
 */

export interface GreetingBlock {
  title: string;
  category: string;
  start: string;
  end: string;
}

export interface GreetingInput {
  name: string;
  greeting: string;
  hour: number;
  nowMinutes: number;
  nextBlock: GreetingBlock | null;
  deadlinesTomorrow: number;
  tasksLeft: number;
  weeklyGoal: string;
}

export interface SmartGreetingCopy {
  salutation: string;
  name: string;
  sentence: string;
  tip: string | null;
}

export const GOAL_TIPS: Record<string, string> = {
  'Finish assignments': 'Tip: tackle your nearest deadline first.',
  'Exam prep': 'Tip: schedule a focus block for your weakest subject.',
  'Build projects': 'Tip: protect one deep-work block for your project.',
  'Skill learning': 'Tip: a short daily session beats a long weekly one.',
  'Stay consistent': 'Tip: finish one small block to keep your streak.',
};

export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function greetingWord(greeting: string, hour: number): string {
  if (greeting === 'hey') return 'Hey';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function formatCountdown(minutes: number): string {
  const mins = Math.max(0, Math.round(minutes));
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}

export function buildLiveSentence(
  input: Pick<
    GreetingInput,
    'nextBlock' | 'nowMinutes' | 'deadlinesTomorrow' | 'tasksLeft'
  >,
): string {
  const parts: string[] = [];
  const next = input.nextBlock;

  if (next) {
    const startsIn = hmToMin(next.start) - input.nowMinutes;
    if (startsIn > 0) {
      const label = next.category === 'class' ? 'class' : 'block';
      parts.push(`Next ${label} in ${formatCountdown(startsIn)}.`);
    } else {
      parts.push(`${next.title} is on now.`);
    }
  }

  if (input.deadlinesTomorrow > 0) {
    parts.push(`${plural(input.deadlinesTomorrow, 'deadline')} tomorrow.`);
  }

  if (input.tasksLeft > 0) {
    parts.push(`${plural(input.tasksLeft, 'task')} left.`);
  }

  return parts.length ? parts.join(' ') : 'You’re clear for today.';
}

export function buildSmartGreeting(input: GreetingInput): SmartGreetingCopy {
  const name = input.name.trim() || 'there';
  return {
    salutation: greetingWord(input.greeting, input.hour),
    name,
    sentence: buildLiveSentence(input),
    tip: GOAL_TIPS[input.weeklyGoal] ?? null,
  };
}
