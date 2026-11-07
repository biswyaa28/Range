import type { BentoCardSize } from '@/domain/types';
import type { BentoCardSpec } from '@/domain/bentoLayout';
import type { ReactNode } from 'react';
import {
  CalendarCard,
  DeadlinesCard,
  FocusCard,
  HealthCard,
  ProgressCard,
  QuickCard,
  StreakCard,
  TasksCard,
  TimelineCard,
  UpNextCard,
  WeeklyCard,
} from './HomeCards';

export interface HomeCardDef {
  id: string;
  title: string;
  defaultSize: BentoCardSize;
  allowedSizes: BentoCardSize[];
  render: (size: BentoCardSize) => ReactNode;
}

export const HOME_CARDS: HomeCardDef[] = [
  {
    id: 'progress',
    title: 'Today’s progress',
    defaultSize: 'M',
    allowedSizes: ['S', 'M', 'L'],
    render: (size) => <ProgressCard size={size} />,
  },
  {
    id: 'weekly',
    title: 'Weekly activity',
    defaultSize: 'XL',
    allowedSizes: ['M', 'L', 'XL'],
    render: (size) => <WeeklyCard size={size} />,
  },
  {
    id: 'focus',
    title: 'Focus',
    defaultSize: 'M',
    allowedSizes: ['S', 'M', 'L'],
    render: (size) => <FocusCard size={size} />,
  },
  {
    id: 'tasks',
    title: 'Today’s tasks',
    defaultSize: 'M',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <TasksCard size={size} />,
  },
  {
    id: 'upnext',
    title: 'Up next',
    defaultSize: 'M',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <UpNextCard size={size} />,
  },
  {
    id: 'deadlines',
    title: 'Deadlines',
    defaultSize: 'L',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <DeadlinesCard size={size} />,
  },
  {
    id: 'streak',
    title: 'Streak',
    defaultSize: 'L',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <StreakCard size={size} />,
  },
  {
    id: 'quick',
    title: 'Quick access',
    defaultSize: 'L',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <QuickCard size={size} />,
  },
  {
    id: 'health',
    title: 'Health',
    defaultSize: 'L',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <HealthCard size={size} />,
  },
  {
    id: 'calendar',
    title: 'Calendar',
    defaultSize: 'M',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <CalendarCard size={size} />,
  },
  {
    id: 'timeline',
    title: 'Today’s timeline',
    defaultSize: 'XL',
    allowedSizes: ['S', 'M', 'L', 'XL'],
    render: (size) => <TimelineCard size={size} />,
  },
];

export const HOME_CARD_IDS: string[] = HOME_CARDS.map((card) => card.id);

export const HOME_CARD_SPECS: BentoCardSpec[] = HOME_CARDS.map((card) => ({
  id: card.id,
  defaultSize: card.defaultSize,
  allowedSizes: card.allowedSizes,
}));

export function homeCard(id: string): HomeCardDef | undefined {
  return HOME_CARDS.find((card) => card.id === id);
}
