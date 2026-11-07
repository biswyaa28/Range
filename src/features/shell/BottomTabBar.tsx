import React from 'react';
import { Icon } from '@/ui/Icon';
import type { AppRoute } from '@/hooks';
import './BottomTabBar.css';

export interface BottomTabBarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const TABS: Array<{ id: AppRoute; label: string; icon: 'today' | 'grid' | 'todo' | 'note' | 'timer' }> = [
  { id: 'home', label: 'Home', icon: 'today' },
  { id: 'plan', label: 'Plan', icon: 'grid' },
  { id: 'tasks', label: 'Tasks', icon: 'todo' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'focus', label: 'Focus', icon: 'timer' },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentRoute, onNavigate }) => {
  const getTabOfRoute = (r: AppRoute): string => {
    if (r === 'today') return 'home';
    if (r === 'timetable' || r === 'deadlines') return 'plan';
    if (r === 'todo') return 'tasks';
    if (r === 'prompter') return 'focus';
    return r;
  };

  const activeTabId = getTabOfRoute(currentRoute);

  return (
    <nav className="tabbar" id="tabbar" aria-label="Sections">
      {TABS.map((tab) => {
        const isActive = activeTabId === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            className={`tab${isActive ? ' active' : ''}`}
            onClick={() => onNavigate(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon name={tab.icon} />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

