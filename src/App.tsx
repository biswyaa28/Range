import React, { useEffect } from 'react';
import { useHashRoute, useMediaQuery } from '@/hooks';
import { useStore } from '@/store';
import { resolveAccent } from '@/domain/color';
import { ToastProvider } from '@/ui/Toast';
import { TopNav, BottomTabBar, Breadcrumb } from '@/features/shell';

import { HomeView } from '@/features/home/HomeView';
import { PlanView } from '@/features/plan/PlanView';
import { TasksView } from '@/features/tasks/TasksView';
import { NotesView } from '@/features/notes/NotesView';
import { FocusView } from '@/features/focus/FocusView';
import { InsightsView } from '@/features/insights/InsightsView';
import { SettingsView } from '@/features/settings/SettingsView';

export const App: React.FC = () => {
  const { route, navigate } = useHashRoute();
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);

  const systemPrefersDark = useMediaQuery('(prefers-color-scheme: dark)');

  // Determine actual theme (light vs dark)
  const isDark =
    settings.theme === 'dark' || (settings.theme === 'auto' && systemPrefersDark);

  // Apply theme data attribute
  useEffect(() => {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, [isDark]);

  // Apply accent tokens
  useEffect(() => {
    const applied = resolveAccent(profile.accent, profile.customAccent, isDark);
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--accent', applied.accent);
    rootStyle.setProperty('--accent-text', applied.accentText);
    rootStyle.setProperty('--on-accent', applied.onAccent);
    rootStyle.setProperty('--focus', applied.focus);
  }, [profile.accent, profile.customAccent, isDark]);

  // ScrollChrome: large title collapse, scrolled nav hide/reveal
  useEffect(() => {
    let scrollRaf = 0;
    let navLastY = 0;
    let navAway = false;

    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        const y = window.scrollY || document.documentElement.scrollTop || 0;

        document.body.classList.toggle('scrolled', y > 56);
        const v = document.getElementById('view');
        if (v) v.classList.toggle('scrolled-hero', y > 90);

        const dy = y - navLastY;
        navLastY = y;
        if (!navAway && y > 120 && dy > 3) {
          navAway = true;
          document.body.classList.add('nav-away');
        } else if (navAway && (dy < -3 || y <= 120)) {
          navAway = false;
          document.body.classList.remove('nav-away');
        }
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  }, []);

  const renderCurrentView = () => {
    switch (route) {
      case 'home':
      case 'today':
        return <HomeView onNavigate={navigate} />;
      case 'plan':
      case 'timetable':
      case 'deadlines':
        return <PlanView />;
      case 'tasks':
      case 'todo':
        return <TasksView />;
      case 'notes':
        return <NotesView />;
      case 'focus':
      case 'prompter':
        return <FocusView />;
      case 'insights':
      case 'stats':
        return <InsightsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <HomeView onNavigate={navigate} />;
    }
  };

  return (
    <ToastProvider>
      <header className="topwrap">
        <TopNav
          currentRoute={route}
          onNavigate={navigate}
          onOpenSearch={() => {}}
          onOpenShortcuts={() => {}}
        />
        <Breadcrumb route={route} />
      </header>

      <main className="view" id="view">
        {renderCurrentView()}
      </main>

      <div id="scrollline" aria-hidden="true" />
      <BottomTabBar currentRoute={route} onNavigate={navigate} />
    </ToastProvider>
  );
};
