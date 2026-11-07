import React, { useRef, useState, useLayoutEffect } from 'react';
import { Icon } from '@/ui/Icon';
import { Popover } from '@/ui/Popover';
import { Kbd } from '@/ui/Kbd';
import type { AppRoute } from '@/hooks';
import { useStore, store } from '@/store';
import { fileSaver } from '@/platform';
import type { AppState } from '@/domain/types';
import { selectDeadlines, approveDeadline, dismissDeadline } from '@/features/deadlines/deadlinesActions';
import { CRUMB_MAP } from './Breadcrumb';
import './TopNav.css';

export interface TopNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onOpenSearch?: () => void;
  onOpenShortcuts?: () => void;
}

interface NavTab {
  id: AppRoute;
  label: string;
}

const DESKTOP_TABS: NavTab[] = [
  { id: 'home', label: 'Home' },
  { id: 'plan', label: 'Plan' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'notes', label: 'Notes' },
  { id: 'focus', label: 'Focus' },
  { id: 'insights', label: 'Insights' },
];

export const TopNav: React.FC<TopNavProps> = ({
  currentRoute,
  onNavigate,
  onOpenSearch,
  onOpenShortcuts,
}) => {
  const profile = useStore((s) => s.profile);
  const settings = useStore((s) => s.settings);
  const deadlines = useStore(selectDeadlines);

  const tabsRef = useRef<HTMLDivElement>(null);
  const bellBtnRef = useRef<HTMLButtonElement>(null);
  const avatarBtnRef = useRef<HTMLButtonElement>(null);

  const [pillStyle, setPillStyle] = useState<{ width: number; transform: string; opacity: number }>({
    width: 0,
    transform: 'translateX(0px)',
    opacity: 0,
  });

  const [bellOpen, setBellOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  // Normalize route to tab
  const getTabOfRoute = (r: AppRoute): AppRoute => {
    if (r === 'today') return 'home';
    if (r === 'timetable' || r === 'deadlines') return 'plan';
    if (r === 'todo') return 'tasks';
    if (r === 'stats') return 'insights';
    if (r === 'prompter') return 'focus';
    return r;
  };

  const activeTabId = getTabOfRoute(currentRoute);

  // Position sliding indicator pill
  useLayoutEffect(() => {
    if (!tabsRef.current) return;
    const activeBtn = tabsRef.current.querySelector<HTMLButtonElement>(
      `button[data-tab="${activeTabId}"]`,
    );
    if (activeBtn) {
      setPillStyle({
        width: activeBtn.offsetWidth,
        transform: `translateX(${activeBtn.offsetLeft}px)`,
        opacity: 1,
      });
    } else {
      setPillStyle((prev) => ({ ...prev, opacity: 0 }));
    }
  }, [activeTabId]);

  // Deadlines pending count
  const pendingDeadlines = deadlines.filter(
    (d) => !d.deleted && d.status === 'pending',
  );
  const pendingCount = pendingDeadlines.length;

  const initial = (profile.name?.trim() ? profile.name.trim()[0] : 'P')!.toUpperCase();

  const handleThemeSet = (theme: 'auto' | 'light' | 'dark') => {
    store.set((s: AppState) => {
      s.settings.theme = theme;
    });
  };

  const handleExportData = () => {
    const data = store.exportAll();
    const json = JSON.stringify(data, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: 'application/json' });
    fileSaver.saveFile(blob, `personal-os-backup-${dateStr}.json`);
    setAvatarOpen(false);
  };

  const handleApproveDeadline = (id: string) => {
    approveDeadline(id);
  };

  const handleDismissDeadline = (id: string) => {
    dismissDeadline(id);
  };

  const crumb = CRUMB_MAP[currentRoute] ?? ['Home', 'Today'];

  return (
    <div className="topbar" id="topbar">
      <button
        type="button"
        className="brand"
        onClick={() => onNavigate('home')}
        aria-label="Home"
      >
        <svg className="logo-mark" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <rect x="2.5" y="2.5" width="19" height="19" rx="6" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        </svg>
        <span className="wm">Personal OS</span>
      </button>

      <nav className="tabs" id="nav" ref={tabsRef} aria-label="Sections">
        {DESKTOP_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab-btn${activeTabId === t.id ? ' active' : ''}`}
            data-tab={t.id}
            onClick={() => onNavigate(t.id)}
            aria-current={activeTabId === t.id ? 'page' : undefined}
          >
            {t.label}
          </button>
        ))}
        <span
          className="pill"
          id="pill"
          style={{
            width: pillStyle.width,
            transform: pillStyle.transform,
            opacity: pillStyle.opacity,
          }}
        />
      </nav>

      <span className="tb-title" id="tb-title" aria-hidden="true">
        {crumb[1]}
      </span>

      <div className="tb-right">
        <button
          type="button"
          className="sbtn"
          onClick={onOpenSearch}
          aria-label="Search"
        >
          <span className="sic">
            <Icon name="search" />
          </span>
          <span className="kbd">
            <Kbd>Ctrl/Cmd K</Kbd>
          </span>
        </button>

        <button
          ref={bellBtnRef}
          type="button"
          className="ibtn bellbtn"
          onClick={() => setBellOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={bellOpen}
          aria-label={`Pending deadlines inbox${pendingCount ? `, ${pendingCount} pending` : ', none pending'}`}
        >
          <span className="bic">
            <Icon name="bell" />
          </span>
          {pendingCount > 0 && (
            <span className="badge" id="bell-badge">
              {pendingCount}
            </span>
          )}
        </button>

        <Popover
          anchorEl={bellBtnRef.current}
          open={bellOpen}
          onClose={() => setBellOpen(false)}
          className="bellpop"
        >
          {pendingCount === 0 ? (
            <div className="bp-empty">
              <p>Inbox is empty.</p>
              <button
                type="button"
                onClick={() => {
                  setBellOpen(false);
                  onNavigate('plan');
                }}
              >
                Open deadlines
              </button>
            </div>
          ) : (
            <div>
              <div className="bp-head">Pending deadlines</div>
              {pendingDeadlines.slice(0, 6).map((d) => (
                <div key={d.id} className="bp-row">
                  <div className="bp-t">
                    <b>{d.title}</b>
                    <small>
                      {d.course ? `${d.course} · ` : ''}
                      {d.due || 'No date'}
                    </small>
                  </div>
                  <div className="bp-a">
                    <button
                      type="button"
                      className="ok"
                      onClick={() => handleApproveDeadline(d.id)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissDeadline(d.id)}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
              {pendingCount > 6 && (
                <p className="bp-more">+{pendingCount - 6} more in Deadlines</p>
              )}
            </div>
          )}
        </Popover>

        <div className="avwrap">
          <button
            ref={avatarBtnRef}
            type="button"
            className="avatar"
            id="av-btn"
            onClick={() => setAvatarOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={avatarOpen}
            aria-label={`Account menu${profile.name ? `, ${profile.name}` : ''}`}
          >
            {initial}
          </button>

          <Popover
            anchorEl={avatarBtnRef.current}
            open={avatarOpen}
            onClose={() => setAvatarOpen(false)}
            className="menu"
          >
            <button
              type="button"
              className="mi"
              role="menuitem"
              onClick={() => {
                setAvatarOpen(false);
                onNavigate('settings');
              }}
            >
              <Icon name="gear" />
              Settings
            </button>
            <button
              type="button"
              className="mi"
              role="menuitem"
              onClick={() => {
                setAvatarOpen(false);
                onOpenShortcuts?.();
              }}
            >
              <Icon name="keys" />
              Keyboard shortcuts
            </button>
            <button
              type="button"
              className="mi mob"
              role="menuitem"
              onClick={() => {
                setAvatarOpen(false);
                onNavigate('insights');
              }}
            >
              <Icon name="chart" />
              Insights
            </button>
            <div className="mlabel">Theme</div>
            <div className="mseg" role="group" aria-label="Theme selection">
              <button
                type="button"
                className={settings.theme === 'auto' ? 'on' : ''}
                onClick={() => handleThemeSet('auto')}
              >
                Auto
              </button>
              <button
                type="button"
                className={settings.theme === 'light' ? 'on' : ''}
                onClick={() => handleThemeSet('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={settings.theme === 'dark' ? 'on' : ''}
                onClick={() => handleThemeSet('dark')}
              >
                Dark
              </button>
            </div>
            <div className="mlabel">Data</div>
            <button
              type="button"
              className="mi"
              role="menuitem"
              onClick={handleExportData}
            >
              <Icon name="download" />
              Export data
            </button>
            <button
              type="button"
              className="mi"
              role="menuitem"
              onClick={() => {
                setAvatarOpen(false);
                onNavigate('settings');
              }}
            >
              <Icon name="upload" />
              Import data
            </button>
          </Popover>
        </div>
      </div>
    </div>
  );
};
