import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { useHashRoute, useShortcuts } from '@/hooks';
import { applySettings, settingsStore, useSettings, useStore } from '@/store';
import { ACCENTS } from '@/domain/color';
import { isHexColor } from '@/domain/settings';
import type { AccentColor, SettingsPatch } from '@/domain/settings';
import { ToastProvider } from '@/ui/Toast';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { TopNav, BottomTabBar, Breadcrumb, StorageNotice } from '@/features/shell';
import { watchNotifications } from '@/features/settings/notificationSync';

const HomeView = React.lazy(() =>
  import('@/features/home/HomeView').then((module) => ({ default: module.HomeView })),
);
const PlanView = React.lazy(() =>
  import('@/features/plan/PlanView').then((module) => ({ default: module.PlanView })),
);
const TasksView = React.lazy(() =>
  import('@/features/tasks/TasksView').then((module) => ({ default: module.TasksView })),
);
const NotesView = React.lazy(() =>
  import('@/features/notes/NotesView').then((module) => ({ default: module.NotesView })),
);
const FocusView = React.lazy(() =>
  import('@/features/focus/FocusView').then((module) => ({ default: module.FocusView })),
);
import { FocusMode } from '@/features/focus/FocusMode';
import { useFocusRuntime } from '@/features/focus/useFocusRuntime';
const InsightsView = React.lazy(() =>
  import('@/features/insights/InsightsView').then((module) => ({ default: module.InsightsView })),
);
const SettingsView = React.lazy(() =>
  import('@/features/settings/SettingsView').then((module) => ({ default: module.SettingsView })),
);
import { Palette } from '@/features/palette/Palette';
import { openPalette } from '@/features/palette/paletteBus';
import { ChatPanel } from '@/features/chat/ChatPanel';
import { closeChat } from '@/features/chat/chatBus';
import { CheatSheet } from '@/features/shortcuts/CheatSheet';
import { Onboarding } from '@/features/onboarding/Onboarding';
import { syncEngine } from '@/sync';
import { chatStore } from '@/store/chatStore';

function accentFromLegacy(
  accent: string,
  customAccent: string,
): { accentColor: AccentColor; accentCustom?: string } {
  if (isHexColor(accent)) {
    return { accentColor: 'custom', accentCustom: accent.toLowerCase() };
  }
  if (accent === 'custom') {
    return {
      accentColor: 'custom',
      ...(isHexColor(customAccent) ? { accentCustom: customAccent.toLowerCase() } : {}),
    };
  }
  if (ACCENTS.some((entry) => entry.id === accent)) {
    return {
      accentColor: accent as AccentColor,
      ...(isHexColor(customAccent) ? { accentCustom: customAccent.toLowerCase() } : {}),
    };
  }
  return {
    accentColor: 'mono',
    ...(isHexColor(customAccent) ? { accentCustom: customAccent.toLowerCase() } : {}),
  };
}

const AppShell: React.FC = () => {
  const { route, rawRoute, navigate } = useHashRoute();
  const profile = useStore((s) => s.profile);
  const legacyTheme = useStore((s) => s.settings.theme);
  const legacyAccent = useStore((s) => s.profile.accent);
  const legacyCustomAccent = useStore((s) => s.profile.customAccent);
  const legacyHaptics = useStore((s) => s.profile.haptics.on);
  const legacyName = useStore((s) => s.profile.name);
  const appSettings = useSettings();
  const [cheatOpen, setCheatOpen] = useState(false);
  // First run only: a later data wipe stays on the current screen until reload.
  const [onboardingOpen, setOnboardingOpen] = useState(() => !profile.onboarded);

  // Auth listeners and online retries are owned by the sync engine.
  useEffect(() => {
    syncEngine.start();
    // A signed-out device must not keep an AI transcript that can quote notes.
    let lastUid = syncEngine.getState().account?.uid ?? null;
    const unsubscribe = syncEngine.subscribe((state) => {
      const uid = state.account?.uid ?? null;
      if (lastUid !== null && uid === null) chatStore.clear();
      lastUid = uid;
    });
    return () => {
      unsubscribe();
      syncEngine.dispose();
    };
  }, []);

  // The versioned settings store owns appearance, motion, density and tokens.
  useEffect(() => {
    applySettings(appSettings);
  }, [appSettings]);

  // Local reminders follow the data and notification settings.
  useEffect(() => watchNotifications(), []);

  // Legacy surfaces (top-nav theme menu, onboarding, imports) still write the
  // original groups. Mirror those writes into the settings store so there is a
  // single source of truth for how the app looks.
  useEffect(() => {
    const current = settingsStore.get();
    const theme = legacyTheme === 'auto' ? 'system' : legacyTheme;
    const accent = accentFromLegacy(legacyAccent, legacyCustomAccent);
    const patch: SettingsPatch = {};

    if (current.theme !== theme) patch.theme = theme;
    if (current.accentColor !== accent.accentColor) patch.accentColor = accent.accentColor;
    if (accent.accentCustom && current.accentCustom !== accent.accentCustom) {
      patch.accentCustom = accent.accentCustom;
    }
    if (current.haptics !== legacyHaptics) patch.haptics = legacyHaptics;

    const name = legacyName.trim().slice(0, 40);
    if (name && current.identity.name !== name) patch.identity = { name };

    if (Object.keys(patch).length > 0) {
      settingsStore.set(patch);
    }
  }, [legacyTheme, legacyAccent, legacyCustomAccent, legacyHaptics, legacyName]);

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
  const openSettingsFromChat = useCallback(() => {
    closeChat();
    navigate('settings');
  }, [navigate]);

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
        <Breadcrumb route={rawRoute} />
      </header>

      <main className="view" id="view">
        <StorageNotice />
        <ErrorBoundary resetKey={route}>
          <Suspense fallback={<div className="view-loading" role="status">Loading view…</div>}>
            {renderCurrentView()}
          </Suspense>
        </ErrorBoundary>
      </main>

      <div id="scrollline" aria-hidden="true" />
      <BottomTabBar currentRoute={route} onNavigate={navigate} />
      <Palette onNavigate={navigate} onOpenShortcuts={openCheatSheet} />
      <ChatPanel onOpenSettings={openSettingsFromChat} />
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
