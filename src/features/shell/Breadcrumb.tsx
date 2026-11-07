import React from 'react';
import type { AppRoute } from '@/hooks';
import './Breadcrumb.css';

export interface BreadcrumbProps {
  route: AppRoute;
}

export const CRUMB_MAP: Record<string, [string, string]> = {
  home: ['Home', 'Today'],
  today: ['Home', 'Today'],
  plan: ['Plan', 'Calendar'],
  timetable: ['Plan', 'Calendar'],
  deadlines: ['Plan', 'Deadlines'],
  tasks: ['Tasks', 'To-do'],
  todo: ['Tasks', 'To-do'],
  notes: ['Notes', 'All notes'],
  focus: ['Focus', 'Pomodoro & sounds'],
  prompter: ['Focus', 'Prompter'],
  insights: ['Insights', 'Stats'],
  stats: ['Insights', 'Stats'],
  settings: ['Settings', 'Preferences'],
};

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ route }) => {
  const [section, page] = CRUMB_MAP[route] ?? ['Home', 'Today'];

  return (
    <nav className="crumb" aria-label="Breadcrumb">
      <span>{section}</span>
      <span className="crumb__sep" aria-hidden="true">
        {' / '}
      </span>
      <b>{page}</b>
    </nav>
  );
};

