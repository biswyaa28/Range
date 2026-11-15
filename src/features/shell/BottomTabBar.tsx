import React, { useState } from 'react';
import { Icon, type IconName } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Haptics } from '@/engines';
import type { AppRoute } from '@/hooks';
import './BottomTabBar.css';

export interface BottomTabBarProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

const TABS: Array<{ id: AppRoute; label: string; icon: IconName }> = [
  { id: 'home', label: 'Home', icon: 'today' },
  { id: 'plan', label: 'Plan', icon: 'grid' },
  { id: 'tasks', label: 'Tasks', icon: 'todo' },
  { id: 'notes', label: 'Notes', icon: 'note' },
  { id: 'focus', label: 'Focus', icon: 'timer' },
];

const MORE_ITEMS: Array<{ id: AppRoute; label: string; icon: IconName }> = [
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
  { id: 'deadlines', label: 'Deadlines', icon: 'flag' },
];

export const BottomTabBar: React.FC<BottomTabBarProps> = ({ currentRoute, onNavigate }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  const getTabOfRoute = (r: AppRoute): string => {
    if (r === 'today') return 'home';
    if (r === 'timetable' || r === 'deadlines') return 'plan';
    if (r === 'todo') return 'tasks';
    if (r === 'prompter') return 'focus';
    return r;
  };

  const activeTabId = getTabOfRoute(currentRoute);
  const moreActive = activeTabId === 'insights' || activeTabId === 'settings';

  const go = (route: AppRoute) => {
    Haptics.select();
    setMoreOpen(false);
    onNavigate(route);
  };

  return (
    <>
      <nav className="tabbar" id="tabbar" aria-label="Primary">
        {TABS.map((tab) => {
          const isActive = activeTabId === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`tab${isActive ? ' active' : ''}`}
              onClick={() => go(tab.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon name={tab.icon} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          className={`tab${moreActive ? ' active' : ''}`}
          aria-expanded={moreOpen}
          aria-current={moreActive ? 'page' : undefined}
          onClick={() => {
            Haptics.select();
            setMoreOpen(true);
          }}
        >
          <Icon name="sliders" />
          <span>More</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className="more-sheet">
          {MORE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="more-item"
              aria-current={currentRoute === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
};
