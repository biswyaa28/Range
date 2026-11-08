import React, { useCallback, useEffect, useState } from 'react';
import { useHashRoute, useMediaQuery, useShortcuts } from '@/hooks';
import { useStore } from '@/store';
import { resolveAccent } from '@/domain/color';
import { ToastProvider } from '@/ui/Toast';
import { TopNav, BottomTabBar, Breadcrumb } from '@/features/shell';

import { HomeView } from '@/features/home/HomeView';
import { PlanView } from '@/features/plan/PlanView';
import { TasksView } from '@/features/tasks/TasksView';
import { NotesView } from '@/features/notes/NotesView';
import { FocusView } from '@/features/focus/FocusView';
import { FocusMode } from '@/features/focus/FocusMode';
import { useFocusRuntime } from '@/features/focus/useFocusRuntime';
import { InsightsView } from '@/features/insights/InsightsView';
import { SettingsView } from '@/features/settings/SettingsView';
import { Palette } from '@/features/palette/Palette';
import { openPalette } from '@/features/palette/paletteBus';
import { CheatSheet } from '@/features/shortcuts/CheatSheet';
import { Onboarding } from '@/features/onboarding/Onboarding';

const AppShell: React.FC = () => {
  const { route, navigate } = useHashRoute();
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const [cheatOpen, setCheatOpen] = useState(false);
  // First run only: a later data wipe stays on the current screen until reload.
  const [onboardingOpen, setOnboardingOpen] = useState(() => !profile.onboarded);

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
        const scrollLine = document.getElementById('scrollline');
        const scrollMax = Math.max(
          0,
          document.documentElement.scrollHeight - window.innerHeight,
        );
        if (scrollLine) {
          const progress = scrollMax > 0 ? Math.min(1, Math.max(0, y / scrollMax)) : 0;
          scrollLine.classList.toggle('on', progress > 0);
          scrollLine.style.transform = `scaleX(${progress})`;
        }

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
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (scrollRaf) cancelAnimationFrame(scrollRaf);
    };
  }, []);

  const openCheatSheet = useCallback(() => setCheatOpen(true), []);
  const openOnboarding = useCallback(() => setOnboardingOpen(true), []);
  const closeOnboarding = useCallback(() => setOnboardingOpen(false), []);

  useFocusRuntime();
  const { chordHint } = useShortcuts({
    route,
    navigate,
    openCheatSheet,
  });

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
        return <InsightsView onNavigate={navigate} />;
      case 'settings':
        return (
          <SettingsView
            onOpenOnboarding={openOnboarding}
            onOpenShortcuts={openCheatSheet}
          />
        );
      default:
        return <HomeView onNavigate={navigate} />;
    }
  };

  return (
    <>
      <header className="topwrap">
        <TopNav
          currentRoute={route}
          onNavigate={navigate}
          onOpenSearch={openPalette}
          onOpenShortcuts={openCheatSheet}
        />
        <Breadcrumb route={route} />
      </header>

      <main className="view" id="view">
        {renderCurrentView()}
      </main>

      <div id="scrollline" aria-hidden="true" />
      <BottomTabBar currentRoute={route} onNavigate={navigate} />
      <Palette onNavigate={navigate} onOpenShortcuts={openCheatSheet} />
      <FocusMode />
      <Onboarding open={onboardingOpen} onClose={closeOnboarding} />
      <CheatSheet open={cheatOpen} onClose={() => setCheatOpen(false)} />
      <span className={`cchip${chordHint ? ' show' : ''}`} aria-hidden={!chordHint}>
        {chordHint ?? ''}
      </span>
    </>
  );
};

export const App: React.FC = () => (
  <ToastProvider>
    <AppShell />
  </ToastProvider>
);
