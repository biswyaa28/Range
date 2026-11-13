import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMediaQuery } from '@/hooks';
import {
  applySettings,
  exportBackup,
  liveArray,
  settingsStore,
  store,
  useAiKey,
  useSettings,
  useStore,
} from '@/store';
import type { HapticsConfig, ThemeMode } from '@/domain/types';
import { defaultState } from '@/domain/types';
import type {
  AccentColor,
  AIProvider,
  AnimationLevel,
  ClockFormat,
  Density,
  FontPreference,
  HomeWidgetSettings,
  NotificationSettingsPatch,
  Settings,
  SettingsPatch,
  ThemePreference,
  TimetableBlockCategory,
  WeekStart,
} from '@/domain/settings';
import { DEFAULT_TIMETABLE_COLORS, isHexColor } from '@/domain/settings';
import { ACCENTS, resolveAccent } from '@/domain/color';
import { defaultClock, formatRelativeTime, todayISO } from '@/domain/dates';
import { buildDemoData } from '@/domain/demo';
import { recomputeDayStats } from '@/domain/stats';
import {
  CLEAR_CONFIRM_PHRASE,
  DELETE_CLOUD_CONFIRM_PHRASE,
  isClearConfirmation,
  isDeleteCloudConfirmation,
  validateBackupText,
} from '@/domain/backup';
import { countOversizedNotes } from '@/domain/limits';
import { PRIVACY_POLICY_URL } from '@/config/links';
import { resolveBentoLayout } from '@/domain/bentoLayout';
import { HOME_CARD_IDS, HOME_CARD_SPECS, HOME_CARDS } from '@/features/home/cards/registry';
import { Haptics } from '@/engines/haptics';
import { platformName } from '@/platform';
import { useSync } from '@/sync/useSync';
import type { DeleteProgress, SyncState } from '@/sync/types';
import { Button } from '@/ui/Button';
import { Icon, type IconName } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Segmented } from '@/ui/Segmented';
import { Switch } from '@/ui/Switch';
import { useToast } from '@/ui/Toast';
import packageJson from '../../../package.json';
import './SettingsView.css';

export interface SettingsViewProps {
  onOpenOnboarding?: () => void;
  onOpenShortcuts?: () => void;
}

type BackupData = Record<string, unknown>;

interface SettingItem {
  id: string;
  title: string;
  description?: string;
  descriptionClassName?: string;
  keywords?: string;
  control: React.ReactNode;
  block?: boolean;
  wide?: boolean;
  danger?: boolean;
}

interface SettingGroup {
  id: string;
  title: string;
  icon: IconName;
  keywords?: string;
  action?: React.ReactNode;
  items: SettingItem[];
}

const HAPTIC_LEVELS: Array<{ value: HapticsConfig['level']; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
];

const TIMETABLE_CATEGORIES: Array<{
  id: TimetableBlockCategory;
  label: string;
  icon: IconName;
}> = [
  { id: 'class', label: 'Class', icon: 'class' },
  { id: 'study', label: 'Study', icon: 'study' },
  { id: 'work', label: 'Work', icon: 'work' },
  { id: 'exercise', label: 'Exercise', icon: 'exercise' },
  { id: 'meal', label: 'Meal', icon: 'meal' },
  { id: 'personal', label: 'Personal', icon: 'personal' },
  { id: 'other', label: 'Other', icon: 'other' },
];

const AI_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'gemini', label: 'Gemini 2.5 Flash' },
  { value: 'groq', label: 'Groq — coming soon' },
  { value: 'openrouter', label: 'OpenRouter — coming soon' },
];

function countList(data: BackupData | null, key: string): number {
  const value = data ? data[key] : undefined;
  return Array.isArray(value) ? value.length : 0;
}

function widgetTitle(id: string): string {
  return HOME_CARDS.find((card) => card.id === id)?.title ?? id;
}

function normalizeWidgetOrder(order: readonly string[]): string[] {
  const known = new Set(HOME_CARD_IDS);
  const seen = new Set<string>();
  const out: string[] = [];

  for (const id of order) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  for (const id of HOME_CARD_IDS) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }

  return out;
}

function widgetVisibilityFromHidden(hidden: readonly string[]): Record<string, boolean> {
  const hiddenSet = new Set(hidden);
  const visible: Record<string, boolean> = {};
  for (const id of HOME_CARD_IDS) visible[id] = !hiddenSet.has(id);
  return visible;
}

function sameWidgetOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Not synced yet';
  const relative = formatRelativeTime(iso);
  if (!relative) return 'Not synced yet';
  return `Last synced ${relative}`;
}

function syncStatusText(state: SyncState): string {
  switch (state.status) {
    case 'disabled':
      return 'Add Firebase environment variables to turn on sync.';
    case 'signed-out':
      return 'Signed out. Local changes stay on this device until you sign in.';
    case 'offline':
      return 'Offline. Changes are saved here and will sync when the connection returns.';
    case 'syncing':
      return 'Pulling remote changes and sending local edits.';
    case 'error':
      return state.error ?? 'Sync failed. Try again.';
    case 'idle':
      return state.pending
        ? `${formatSyncTime(state.lastSyncedAt)}. New changes are waiting to sync.`
        : formatSyncTime(state.lastSyncedAt);
  }
}

const matches = (text: string, query: string): boolean =>
  text.toLowerCase().includes(query);

const AiKeyField: React.FC = () => {
  const { loaded, hasKey, error, setKey, clear } = useAiKey();
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (!draft.trim() || saving || !loaded) return;
    setSaving(true);
    setNote(null);
    await setKey(draft);
    setSaving(false);
    setDraft('');
    setNote('Key saved in secure storage on this device.');
  };

  const remove = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    await clear();
    setSaving(false);
    setNote('Key removed from this device.');
  };

  return (
    <div className="ai-key-field">
      <div className="ai-key-row">
        <input
          className="settings-input"
          type="password"
          aria-label="AI API key"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasKey ? 'Key saved — paste a new one to replace' : 'Paste your API key'}
          maxLength={512}
          value={draft}
          disabled={saving || !loaded}
          onChange={(event) => {
            setDraft(event.target.value);
            setNote(null);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          data-action="save-ai-key"
          onClick={() => void save()}
          disabled={!draft.trim() || saving || !loaded}
        >
          Save
        </Button>
        {hasKey ? (
          <Button
            variant="ghost"
            size="sm"
            data-action="clear-ai-key"
            onClick={() => void remove()}
            disabled={saving}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p
        className="ai-key-status"
        data-ai-key-status={error ? 'error' : hasKey ? 'saved' : 'empty'}
      >
        {error
          ? error
          : hasKey
            ? 'Saved securely on this device. The key is never synced.'
            : note ?? 'Stored in secure storage, never in settings or the cloud.'}
      </p>
    </div>
  );
};

const SettingRow: React.FC<{ item: SettingItem }> = ({ item }) => {
  const rowClass = [
    'settings-row',
    item.block ? 'settings-row-block' : '',
    item.wide ? 'settings-row-wide' : '',
    item.danger ? 'settings-row-danger' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={rowClass} data-setting={item.id}>
      <div className="settings-row-copy">
        <div className="settings-row-title">{item.title}</div>
        {item.description ? (
          <p className={`settings-row-desc ${item.descriptionClassName ?? ''}`.trim()}>
            {item.description}
          </p>
        ) : null}
      </div>
      <div className="settings-row-control">{item.control}</div>
    </div>
  );
};

const SettingsGroupCard: React.FC<{ group: SettingGroup }> = ({ group }) => {
  const titleId = `settings-${group.id}-title`;

  return (
    <section className="settings-section" data-section={group.id} aria-labelledby={titleId}>
      <div className="settings-section-head">
        <span className="settings-section-icon">
          <Icon name={group.icon} size={15} />
        </span>
        <h2 className="settings-section-title" id={titleId}>
          {group.title}
        </h2>
        {group.action ? <div className="settings-section-action">{group.action}</div> : null}
      </div>
      <div className="settings-group">
        {group.items.map((item) => (
          <SettingRow key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
};

interface HomeWidgetListProps {
  order: string[];
  visible: Record<string, boolean>;
  draggingId: string | null;
  onToggle: (id: string, checked: boolean) => void;
  onMove: (id: string, delta: number) => void;
  onDragStart: (event: React.PointerEvent<HTMLElement>, id: string) => void;
  onDragMove: (event: React.PointerEvent<HTMLElement>) => void;
  onDragEnd: (event: React.PointerEvent<HTMLElement>) => void;
  onDragCancel: () => void;
}

const HomeWidgetList: React.FC<HomeWidgetListProps> = ({
  order,
  visible,
  draggingId,
  onToggle,
  onMove,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}) => (
  <div className="settings-widgets" role="list" aria-label="Home widgets">
    {order.map((id, index) => {
      const title = widgetTitle(id);
      const shown = visible[id] !== false;

      return (
        <div
          key={id}
          className={`settings-widget${draggingId === id ? ' is-dragging' : ''}`}
          data-widget-id={id}
          role="listitem"
        >
          <span
            className="settings-widget-grip"
            aria-hidden="true"
            title="Drag to reorder"
            onPointerDown={(event) => onDragStart(event, id)}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onLostPointerCapture={onDragCancel}
          >
            <Icon name="grip" size={18} />
          </span>
          <div className="settings-widget-copy">
            <div className="settings-widget-title">{title}</div>
            <div className="settings-widget-desc">{shown ? 'Shown on Home' : 'Hidden from Home'}</div>
          </div>
          <div className="settings-widget-actions">
            <button
              type="button"
              className="settings-widget-move"
              aria-label={`Move ${title} up`}
              disabled={index === 0}
              onClick={() => onMove(id, -1)}
            >
              <Icon name="chevU" size={16} />
            </button>
            <button
              type="button"
              className="settings-widget-move"
              aria-label={`Move ${title} down`}
              disabled={index === order.length - 1}
              onClick={() => onMove(id, 1)}
            >
              <Icon name="chevD" size={16} />
            </button>
            <Switch
              checked={shown}
              onChange={(checked) => onToggle(id, checked)}
              aria-label={`Show ${title} on Home`}
            />
          </div>
        </div>
      );
    })}
  </div>
);

export const SettingsView: React.FC<SettingsViewProps> = ({
  onOpenOnboarding,
  onOpenShortcuts,
}) => {
  const state = useStore();
  const settings = useSettings();
  const sync = useSync();
  const toast = useToast();
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; lastTargetId: string | null } | null>(
    null,
  );
  const adoptedLayoutRef = useRef(false);

  const [pendingImport, setPendingImport] = useState<BackupData | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearText, setClearText] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState<DeleteProgress | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const startSignIn = useCallback(async (): Promise<void> => {
    if (signingIn) return;
    setSigningIn(true);
    try {
      await sync.signIn();
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, sync]);

  const cancelSignIn = useCallback((): void => {
    void sync.cancelSignIn();
  }, [sync]);

  const { profile } = state;
  const haptics = profile.haptics;
  const isDark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  const applied = resolveAccent(settings.accentColor, settings.accentCustom, isDark);

  const blocks = liveArray(state.blocks);
  const tasks = liveArray(state.tasks);
  const notes = liveArray(state.notes);
  const deadlines = liveArray(state.deadlines);
  const trackedDays = Object.keys(state.dayStats).length;

  const syncChipLabel = !sync.state.configured || sync.state.status === 'signed-out'
    ? 'Local only'
    : sync.state.status === 'offline'
      ? 'Offline'
      : sync.state.status === 'error'
        ? 'Sync issue'
        : sync.state.status === 'syncing'
          ? 'Syncing…'
          : sync.state.pending
            ? 'Pending'
            : 'Synced';
  const syncChipClass =
    sync.state.status === 'error'
      ? 'chip red'
      : sync.state.status === 'idle' && sync.state.account && !sync.state.pending
        ? 'chip green'
        : 'chip';

  const widgetOrder = normalizeWidgetOrder(settings.homeWidgets.order);
  const widgetVisible = settings.homeWidgets.visible;

  // Project every preference onto the document immediately. The shell does the
  // same on boot; keeping it here makes the page self-contained for tests and
  // for any surface that mounts it outside the shell.
  useEffect(() => {
    applySettings(settings);
  }, [settings]);

  // If Home already has a customised bento order, start the widget list from it
  // instead of overwriting the user's arrangement with registry defaults.
  useEffect(() => {
    if (adoptedLayoutRef.current) return;
    adoptedLayoutRef.current = true;

    const layout = store.get().layout;
    if (!Array.isArray(layout.order) || layout.order.length === 0) return;

    const resolved = resolveBentoLayout(layout, HOME_CARD_SPECS, store.get().profile.preset);
    const order = normalizeWidgetOrder(resolved.order);
    const visible = widgetVisibilityFromHidden(resolved.hidden);
    const current = settingsStore.get().homeWidgets;
    const sameVisible = HOME_CARD_IDS.every(
      (id) => (current.visible[id] !== false) === visible[id],
    );

    if (!sameWidgetOrder(order, current.order) || !sameVisible) {
      settingsStore.set({ homeWidgets: { order, visible } });
    }
  }, []);

  const bridgeAppearance = useCallback((next: Settings) => {
    const theme: ThemeMode = next.theme === 'system' ? 'auto' : next.theme;
    const legacy = store.get();

    if (
      legacy.settings.theme === theme &&
      legacy.profile.accent === next.accentColor &&
      legacy.profile.customAccent === next.accentCustom &&
      legacy.profile.haptics.on === next.haptics
    ) {
      return;
    }

    store.set((current) => {
      current.settings.theme = theme;
      current.profile.accent = next.accentColor;
      current.profile.customAccent = next.accentCustom;
      current.profile.haptics = { ...current.profile.haptics, on: next.haptics };
    });
  }, []);

  const commitAppearance = useCallback(
    (patch: SettingsPatch) => {
      settingsStore.set(patch);
      bridgeAppearance(settingsStore.get());
    },
    [bridgeAppearance],
  );

  const applyHomeWidgets = useCallback((next: HomeWidgetSettings) => {
    const order = normalizeWidgetOrder(next.order);
    const visible: Record<string, boolean> = {};
    for (const id of HOME_CARD_IDS) visible[id] = next.visible[id] !== false;

    settingsStore.set({ homeWidgets: { order, visible } });
    store.set((current) => {
      current.layout.order = order;
      current.layout.hidden = HOME_CARD_IDS.filter((id) => visible[id] === false);
    });
  }, []);

  const moveWidget = useCallback(
    (id: string, delta: number) => {
      const current = settingsStore.get().homeWidgets;
      const order = normalizeWidgetOrder(current.order);
      const from = order.indexOf(id);
      if (from < 0) return;

      const to = Math.max(0, Math.min(order.length - 1, from + delta));
      if (to === from) {
        setAnnouncement(`${widgetTitle(id)} is already ${delta < 0 ? 'first' : 'last'}.`);
        return;
      }

      const next = order.slice();
      next.splice(from, 1);
      next.splice(to, 0, id);
      applyHomeWidgets({ order: next, visible: current.visible });
      setAnnouncement(`${widgetTitle(id)} moved to position ${to + 1}.`);
      Haptics.select();
    },
    [applyHomeWidgets],
  );

  const toggleWidget = useCallback(
    (id: string, checked: boolean) => {
      const current = settingsStore.get().homeWidgets;
      applyHomeWidgets({
        order: current.order,
        visible: { ...current.visible, [id]: checked },
      });
      setAnnouncement(`${widgetTitle(id)} ${checked ? 'shown on' : 'hidden from'} Home.`);
    },
    [applyHomeWidgets],
  );

  const resetHomeLayout = useCallback(() => {
    const visible: Record<string, boolean> = {};
    for (const id of HOME_CARD_IDS) visible[id] = true;
    applyHomeWidgets({ order: [...HOME_CARD_IDS], visible });
    setAnnouncement('Home layout reset.');
    toast.showToast('Home layout reset');
    Haptics.success();
  }, [applyHomeWidgets, toast]);

  const beginWidgetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>, id: string) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort; window-level movement still works.
      }
      dragRef.current = { id, pointerId: event.pointerId, lastTargetId: null };
      setDraggingId(id);
      setAnnouncement(
        `${widgetTitle(id)} picked up. Drag to reorder, or use the move buttons.`,
      );
      Haptics.impact();
    },
    [],
  );

  const moveWidgetDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (typeof document.elementFromPoint !== 'function') return;

      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-widget-id]');
      const targetId = target?.dataset['widgetId'];
      if (!targetId || targetId === drag.id || targetId === drag.lastTargetId) return;

      const current = settingsStore.get().homeWidgets;
      const order = normalizeWidgetOrder(current.order);
      const from = order.indexOf(drag.id);
      const to = order.indexOf(targetId);
      if (from < 0 || to < 0 || !target) return;

      drag.lastTargetId = targetId;
      const rect = target.getBoundingClientRect();
      const hasGeometry = rect.height > 0 && Number.isFinite(event.clientY);
      const after = hasGeometry ? event.clientY > rect.top + rect.height / 2 : from < to;
      const next = order.filter((id) => id !== drag.id);
      const targetIndex = next.indexOf(targetId);
      next.splice(targetIndex + (after ? 1 : 0), 0, drag.id);

      applyHomeWidgets({ order: next, visible: current.visible });
      setAnnouncement(`${widgetTitle(drag.id)} moved to position ${next.indexOf(drag.id) + 1}.`);
    },
    [applyHomeWidgets],
  );

  const endWidgetDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDraggingId(null);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }
    Haptics.select();
  }, []);

  const cancelWidgetDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
  }, []);

  const updateHaptics = (patch: Partial<HapticsConfig>): void => {
    store.set((current) => {
      current.profile.haptics = { ...current.profile.haptics, ...patch };
    });
  };

  const handleThemeChange = (theme: ThemePreference): void => {
    commitAppearance({ theme });
    Haptics.select();
  };

  const handleAccentChange = (accentId: AccentColor): void => {
    commitAppearance({ accentColor: accentId });
    Haptics.select();
  };

  const handleCustomAccent = (value: string): void => {
    if (!isHexColor(value)) return;
    commitAppearance({ accentColor: 'custom', accentCustom: value.toLowerCase() });
  };

  const handleNameChange = (value: string): void => {
    const name = value.slice(0, 40);
    store.set((current) => {
      current.profile.name = name;
    });
    settingsStore.set({ identity: { name } });
  };

  const setNotifications = (patch: NotificationSettingsPatch): void => {
    settingsStore.set({ notifications: patch });
  };

  const handleWeekStart = (value: string): void => {
    const parsed = Number(value);
    if (parsed !== 0 && parsed !== 1 && parsed !== 6) return;
    settingsStore.set({ weekStart: parsed as WeekStart });
    Haptics.select();
  };

  const handleClockFormat = (value: ClockFormat): void => {
    settingsStore.set({ clockFormat: value });
    Haptics.select();
  };

  const handleTimetableColor = (category: string, value: string): void => {
    if (!isHexColor(value)) return;
    settingsStore.set({ timetableColors: { [category]: value.toLowerCase() } });
  };

  const handleResetTimetableColors = (): void => {
    settingsStore.set({ timetableColors: { ...DEFAULT_TIMETABLE_COLORS } });
    toast.showToast('Timetable colors reset');
    Haptics.success();
  };

  const resetPreferences = (): void => {
    settingsStore.reset();
    const next = settingsStore.get();
    bridgeAppearance(next);
    store.set((current) => {
      const order = normalizeWidgetOrder(next.homeWidgets.order);
      current.layout.order = order;
      current.layout.hidden = HOME_CARD_IDS.filter(
        (id) => next.homeWidgets.visible[id] === false,
      );
    });
    toast.showToast('Preferences reset to defaults');
    Haptics.warning();
  };

  const handleExport = async (): Promise<void> => {
    try {
      await exportBackup();
      Haptics.success();
      toast.showToast('Backup file downloaded');
    } catch {
      Haptics.error();
      toast.showToast('Export failed. Try again.');
    }
  };

  const handleDemoLoad = (): void => {
    const current = store.get();
    const demo = buildDemoData(defaultClock, undefined, current.settings.theme);
    // Demo data must never sign the user out of their own setup.
    demo.profile = { ...current.profile };
    demo.settings.seeded = true;
    demo.settings.theme = current.settings.theme;
    store.importAll(demo);
    store.set((next) => {
      recomputeDayStats(next.dayStats, next.blocks, todayISO());
    });
    Haptics.success();
    toast.showToast('Demo data loaded — explore away');
  };

  const handleDemoRemove = (): void => {
    const current = store.get();
    const fresh = defaultState();
    fresh.profile = { ...current.profile };
    fresh.settings = { ...current.settings, seeded: false };
    fresh.clearedAt = defaultClock.nowISO();
    store.importAll(fresh);
    Haptics.warning();
    toast.showToast('Demo data removed');
  };

  const handleFilePicked = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = validateBackupText(String(reader.result ?? ''));
      if (!result.ok) {
        Haptics.error();
        toast.showToast(result.error);
        return;
      }
      setPendingImport(result.data);
    };
    reader.onerror = () => {
      Haptics.error();
      toast.showToast('Could not read that file.');
    };
    reader.readAsText(file);
  };

  const closeImport = useCallback(() => {
    setPendingImport(null);
  }, []);

  const confirmImport = (): void => {
    if (!pendingImport) return;
    const oversized = countOversizedNotes(pendingImport);
    store.importAll(pendingImport);
    setPendingImport(null);
    Haptics.success();
    toast.showToast(
      oversized > 0
        ? `Backup imported — ${oversized} note${oversized === 1 ? '' : 's'} trimmed to 200,000 characters`
        : 'Backup imported',
    );
  };

  const closeClear = useCallback(() => {
    setClearOpen(false);
    setClearText('');
  }, []);

  const closeDelete = useCallback(() => {
    if (deleting) return;
    setDeleteOpen(false);
    setDeleteText('');
    setDeleteError(null);
    setDeleteProgress(null);
  }, [deleting]);

  const runDeleteCloud = async (): Promise<void> => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    setDeleteProgress(null);
    try {
      await sync.deleteCloudData(setDeleteProgress);
      setDeleteOpen(false);
      setDeleteText('');
      Haptics.success();
      toast.showToast('Cloud data deleted');
    } catch {
      Haptics.error();
      setDeleteError('Could not finish deleting. Local data was kept — try again.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmClear = (): void => {
    if (!isClearConfirmation(clearText)) return;
    store.importAll(defaultState());
    store.set((current) => {
      current.clearedAt = defaultClock.nowISO();
    });
    setClearOpen(false);
    setClearText('');
    Haptics.warning();
    toast.showToast('All data cleared — fresh start');
  };

  const groups: SettingGroup[] = [
    {
      id: 'appearance',
      title: 'Appearance',
      icon: 'sliders',
      keywords: 'look style theme accent colour color font type density spacing radius corners dark light auto system',
      items: [
        {
          id: 'appearance-preview',
          title: 'Live preview',
          description: 'Surfaces, type and accent update as you change them.',
          keywords: 'sample preview card link primary',
          block: true,
          control: (
            <div className="settings-preview" data-accent-preview>
              <div className="settings-preview-top">
                <span
                  className="settings-preview-dot"
                  style={{ background: applied.accent }}
                  aria-hidden="true"
                />
                <span className="settings-preview-name">Home</span>
                <span
                  className="settings-preview-pill"
                  style={{ background: applied.accent, color: applied.onAccent }}
                >
                  Primary
                </span>
              </div>
              <div className="settings-preview-title">Good morning</div>
              <div className="settings-preview-line" />
              <div className="settings-preview-line short" />
              <div className="settings-preview-meta">
                <span className="settings-preview-link" style={{ color: applied.accentText }}>
                  a link
                </span>
                <span className="settings-preview-chip">3 tasks</span>
                <span className="settings-preview-chip">2 blocks</span>
              </div>
            </div>
          ),
        },
        {
          id: 'theme',
          title: 'Theme',
          description: 'Auto follows your device light or dark setting.',
          keywords: 'dark light auto system',
          wide: true,
          control: (
            <Segmented<ThemePreference>
              className="settings-seg"
              value={settings.theme}
              onChange={handleThemeChange}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'Auto' },
              ]}
              aria-label="Theme"
            />
          ),
        },
        {
          id: 'accent',
          title: 'Accent color',
          description: 'Used for focus rings, active states and highlights.',
          keywords: 'colour color swatch custom blue violet pink orange teal lime red mono',
          block: true,
          control: (
            <div className="settings-swatches" role="radiogroup" aria-label="Accent color">
              {ACCENTS.map((accent) => (
                <button
                  key={accent.id}
                  type="button"
                  className={`settings-swatch${settings.accentColor === accent.id ? ' is-on' : ''}`}
                  role="radio"
                  aria-checked={settings.accentColor === accent.id}
                  aria-label={accent.label}
                  title={accent.label}
                  data-accent={accent.id}
                  style={
                    {
                      '--sw': accent.hex ?? 'linear-gradient(135deg,#fff 50%,#000 50%)',
                    } as React.CSSProperties
                  }
                  onClick={() => handleAccentChange(accent.id as AccentColor)}
                />
              ))}
              <label
                className={`settings-swatch custom${settings.accentColor === 'custom' ? ' is-on' : ''}`}
                title="Custom color"
              >
                <input
                  type="color"
                  id="accent-custom"
                  aria-label="Custom accent color"
                  value={settings.accentCustom}
                  onChange={(event) => handleCustomAccent(event.target.value)}
                />
              </label>
            </div>
          ),
        },
        {
          id: 'font',
          title: 'Font',
          description: 'Typeface used across the app.',
          keywords: 'typeface typography system serif mono',
          wide: true,
          control: (
            <Segmented<FontPreference>
              className="settings-seg"
              value={settings.font}
              onChange={(font) => {
                settingsStore.set({ font });
                Haptics.select();
              }}
              options={[
                { value: 'system', label: 'System' },
                { value: 'serif', label: 'Serif' },
                { value: 'mono', label: 'Mono' },
              ]}
              aria-label="Font"
            />
          ),
        },
        {
          id: 'density',
          title: 'Density',
          description: 'Spacing between rows, cards and controls.',
          keywords: 'spacing compact comfortable spacious',
          wide: true,
          control: (
            <Segmented<Density>
              className="settings-seg"
              value={settings.density}
              onChange={(density) => {
                settingsStore.set({ density });
                Haptics.select();
              }}
              options={[
                { value: 'compact', label: 'Compact' },
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'spacious', label: 'Spacious' },
              ]}
              aria-label="Density"
            />
          ),
        },
        {
          id: 'radius',
          title: 'Corner radius',
          description: 'Roundness of cards, inputs and sheets.',
          keywords: 'rounded corners shape',
          block: true,
          control: (
            <div className="settings-range">
              <input
                type="range"
                min={0}
                max={48}
                step={1}
                aria-label="Corner radius"
                value={settings.cornerRadius}
                onChange={(event) => {
                  settingsStore.set({ cornerRadius: Number(event.target.value) });
                }}
              />
              <span className="settings-range-value">{settings.cornerRadius}px</span>
            </div>
          ),
        },
      ],
    },
    {
      id: 'profile',
      title: 'Profile',
      icon: 'personal',
      keywords: 'you name greeting setup personalize onboarding answers',
      items: [
        {
          id: 'profile-name',
          title: 'Your name',
          description: 'Name shown in your Home greeting.',
          keywords: 'name greeting',
          block: true,
          control: (
            <input
              id="pref-name"
              className="settings-input"
              type="text"
              maxLength={40}
              placeholder="there"
              aria-label="Name shown in your Home greeting"
              value={profile.name}
              onChange={(event) => handleNameChange(event.target.value)}
            />
          ),
        },
        {
          id: 'profile-setup',
          title: 'Setup answers',
          description: `${profile.role || 'No role yet'} · ${profile.level || 'No level'} · ${
            profile.field || 'No field'
          } · ${profile.studyHours} h/day`,
          keywords: 'role level field study hours personalize',
          control: (
            <Button
              variant="secondary"
              data-action="personalize-profile"
              onClick={() => onOpenOnboarding?.()}
            >
              Personalize
            </Button>
          ),
        },
      ],
    },
    {
      id: 'motion-haptics',
      title: 'Motion & haptics',
      icon: 'bolt',
      keywords: 'animation speed reduced motion vibration haptic sound tap android',
      items: [
        {
          id: 'motion',
          title: 'Motion',
          description: 'Control animation speed across the app.',
          keywords: 'animation transitions reduced full off',
          wide: true,
          control: (
            <Segmented<AnimationLevel>
              className="settings-seg"
              value={settings.animation}
              onChange={(animation) => {
                settingsStore.set({ animation });
                Haptics.select();
              }}
              options={[
                { value: 'full', label: 'Full' },
                { value: 'reduced', label: 'Reduced' },
                { value: 'off', label: 'Off' },
              ]}
              aria-label="Motion"
            />
          ),
        },
        {
          id: 'haptics',
          title: 'Haptic feedback',
          description:
            'Vibration on taps, toggles and completions (Android); a subtle pulse elsewhere.',
          keywords: 'vibration android touch',
          control: (
            <Switch
              checked={settings.haptics}
              onChange={(checked) => commitAppearance({ haptics: checked })}
              aria-label="Haptic feedback"
            />
          ),
        },
        {
          id: 'haptic-level',
          title: 'Haptic intensity',
          description: 'How strong the vibrations feel.',
          keywords: 'level light medium strong',
          wide: true,
          control: (
            <div className="settings-chips" role="group" aria-label="Haptic intensity">
              {HAPTIC_LEVELS.map((level) => (
                <button
                  key={level.value}
                  type="button"
                  className="settings-chip-choice"
                  aria-pressed={haptics.level === level.value}
                  data-haptic-level={level.value}
                  onClick={() => {
                    updateHaptics({ level: level.value });
                    Haptics.select();
                  }}
                >
                  {level.label}
                </button>
              ))}
            </div>
          ),
        },
        {
          id: 'sound',
          title: 'Sound feedback',
          description: 'A soft click plays alongside haptics.',
          keywords: 'audio click sound',
          control: (
            <Switch
              checked={haptics.sound}
              onChange={(checked) => updateHaptics({ sound: checked })}
              aria-label="Sound feedback"
            />
          ),
        },
      ],
    },
    {
      id: 'home-layout',
      title: 'Home layout',
      icon: 'grid',
      keywords: 'widgets cards order reorder drag visibility bento home',
      action: (
        <button
          type="button"
          className="settings-section-button"
          data-action="reset-home-layout"
          onClick={resetHomeLayout}
        >
          Reset
        </button>
      ),
      items: [
        {
          id: 'home-widgets',
          title: 'Widgets',
          description: 'Drag the handle or use the arrows to reorder. Toggle a widget to hide it.',
          descriptionClassName: 'settings-widgets-hint',
          keywords: HOME_CARDS.map((card) => card.title).join(' '),
          block: true,
          control: (
            <HomeWidgetList
              order={widgetOrder}
              visible={widgetVisible}
              draggingId={draggingId}
              onToggle={toggleWidget}
              onMove={moveWidget}
              onDragStart={beginWidgetDrag}
              onDragMove={moveWidgetDrag}
              onDragEnd={endWidgetDrag}
              onDragCancel={cancelWidgetDrag}
            />
          ),
        },
      ],
    },
    {
      id: 'timetable',
      title: 'Timetable',
      icon: 'today',
      keywords: 'schedule week clock colors blocks calendar 12 24',
      action: (
        <button
          type="button"
          className="settings-section-button"
          data-action="reset-timetable-colors"
          onClick={handleResetTimetableColors}
        >
          Reset colors
        </button>
      ),
      items: [
        {
          id: 'week-start',
          title: 'Week starts on',
          description: 'First day in the timetable and calendar views.',
          keywords: 'sunday monday saturday week',
          wide: true,
          control: (
            <Segmented<string>
              className="settings-seg"
              value={String(settings.weekStart)}
              onChange={handleWeekStart}
              options={[
                { value: '1', label: 'Monday' },
                { value: '0', label: 'Sunday' },
                { value: '6', label: 'Saturday' },
              ]}
              aria-label="Week starts on"
            />
          ),
        },
        {
          id: 'clock-format',
          title: 'Clock',
          description: 'Time format in schedules and timers.',
          keywords: '12 hour 24 hour time',
          wide: true,
          control: (
            <Segmented<ClockFormat>
              className="settings-seg"
              value={settings.clockFormat}
              onChange={handleClockFormat}
              options={[
                { value: '24h', label: '24-hour' },
                { value: '12h', label: '12-hour' },
              ]}
              aria-label="Clock format"
            />
          ),
        },
        {
          id: 'block-colors',
          title: 'Block colors',
          description: 'Colors used for timetable blocks by category.',
          keywords: 'class study work exercise meal personal other color',
          block: true,
          control: (
            <div className="settings-colors">
              {TIMETABLE_CATEGORIES.map((category) => {
                const color = settings.timetableColors[category.id];
                return (
                  <label key={category.id} className="settings-color">
                    <span
                      className="settings-color-dot"
                      style={{ color, background: `${color}1f` }}
                      aria-hidden="true"
                    >
                      <Icon name={category.icon} size={14} />
                    </span>
                    <span className="settings-color-name">{category.label}</span>
                    <input
                      type="color"
                      aria-label={`${category.label} block color`}
                      value={color}
                      onChange={(event) =>
                        handleTimetableColor(category.id, event.target.value)
                      }
                    />
                  </label>
                );
              })}
            </div>
          ),
        },
      ],
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: 'bell',
      keywords: 'reminders alerts digest quiet hours',
      items: [
        {
          id: 'notifications-master',
          title: 'Notifications',
          description: 'Local nudges for the things you choose below.',
          keywords: 'enable reminders alerts',
          control: (
            <Switch
              checked={settings.notifications.enabled}
              onChange={(enabled) => setNotifications({ enabled })}
              aria-label="Notifications"
            />
          ),
        },
        {
          id: 'notification-deadlines',
          title: 'Deadline reminders',
          description: 'A reminder before an assignment or exam is due.',
          keywords: 'assignment exam due',
          control: (
            <Switch
              checked={settings.notifications.deadlines}
              onChange={(deadlines) => setNotifications({ deadlines })}
              aria-label="Deadline reminders"
            />
          ),
        },
        {
          id: 'notification-tasks',
          title: 'Task reminders',
          description: 'A nudge when a task is due today.',
          keywords: 'todo due',
          control: (
            <Switch
              checked={settings.notifications.tasks}
              onChange={(tasks) => setNotifications({ tasks })}
              aria-label="Task reminders"
            />
          ),
        },
        {
          id: 'notification-focus',
          title: 'Focus session alerts',
          description: 'Let you know when a focus block starts or ends.',
          keywords: 'pomodoro timer',
          control: (
            <Switch
              checked={settings.notifications.focus}
              onChange={(focus) => setNotifications({ focus })}
              aria-label="Focus session alerts"
            />
          ),
        },
        {
          id: 'notification-digest',
          title: 'Weekly digest',
          description: 'A short summary of your week every Sunday evening.',
          keywords: 'weekly summary report',
          control: (
            <Switch
              checked={settings.notifications.weeklyDigest}
              onChange={(weeklyDigest) => setNotifications({ weeklyDigest })}
              aria-label="Weekly digest"
            />
          ),
        },
        {
          id: 'notification-quiet',
          title: 'Quiet hours',
          description: 'Pause nudges during a window you choose.',
          keywords: 'silent night do not disturb',
          control: (
            <Switch
              checked={settings.notifications.quietHours.enabled}
              onChange={(enabled) => setNotifications({ quietHours: { enabled } })}
              aria-label="Quiet hours"
            />
          ),
        },
        {
          id: 'notification-quiet-period',
          title: 'Quiet period',
          description: settings.notifications.quietHours.enabled
            ? 'No nudges during this window.'
            : 'Turn on quiet hours to use this window.',
          keywords: 'start end time night',
          block: true,
          control: (
            <div className="settings-time-range">
              <label className="settings-time-field">
                <span>Start</span>
                <input
                  className="settings-time"
                  type="time"
                  aria-label="Quiet hours start"
                  value={settings.notifications.quietHours.start}
                  disabled={!settings.notifications.quietHours.enabled}
                  onChange={(event) =>
                    setNotifications({ quietHours: { start: event.target.value } })
                  }
                />
              </label>
              <label className="settings-time-field">
                <span>End</span>
                <input
                  className="settings-time"
                  type="time"
                  aria-label="Quiet hours end"
                  value={settings.notifications.quietHours.end}
                  disabled={!settings.notifications.quietHours.enabled}
                  onChange={(event) =>
                    setNotifications({ quietHours: { end: event.target.value } })
                  }
                />
              </label>
            </div>
          ),
        },
      ],
    },
    {
      id: 'data',
      title: 'Data',
      icon: 'download',
      keywords: 'backup export import reset clear local json storage',
      items: [
        {
          id: 'data-counts',
          title: 'Your data',
          description: 'Everything is stored locally in this browser.',
          keywords: 'blocks tasks notes deadlines days count',
          block: true,
          control: (
            <div className="counts" data-data-counts>
              <span className="chip">{blocks.length} blocks</span>
              <span className="chip">{tasks.length} tasks</span>
              <span className="chip">{notes.length} notes</span>
              <span className="chip">{deadlines.length} deadlines</span>
              <span className="chip">{trackedDays} days tracked</span>
            </div>
          ),
        },
        {
          id: 'data-export',
          title: 'Export JSON',
          description: 'Download a complete backup you can keep anywhere.',
          keywords: 'download backup save',
          control: (
            <Button
              variant="secondary"
              data-action="export-data"
              onClick={() => void handleExport()}
            >
              <Icon name="download" size={16} />
              Export JSON
            </Button>
          ),
        },
        {
          id: 'data-import',
          title: 'Import JSON',
          description: "Replace this device's data with a backup file.",
          keywords: 'upload restore backup',
          control: (
            <>
              <Button
                variant="secondary"
                data-action="import-data-pick"
                onClick={() => importInputRef.current?.click()}
              >
                <Icon name="upload" size={16} />
                Import JSON
              </Button>
              <input
                ref={importInputRef}
                id="imp-file"
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleFilePicked}
                aria-label="Import backup file"
              />
            </>
          ),
        },
        {
          id: 'data-demo',
          title: 'Demo data',
          description: 'Load a populated sample week, or remove it when you are done.',
          keywords: 'sample sandbox try',
          wide: true,
          control: (
            <div className="settings-inline-actions">
              <Button variant="secondary" data-action="demo-load" onClick={handleDemoLoad}>
                Load demo data
              </Button>
              {state.settings.seeded && (
                <Button variant="secondary" data-action="demo-remove" onClick={handleDemoRemove}>
                  Remove demo data
                </Button>
              )}
            </div>
          ),
        },
        {
          id: 'data-reset',
          title: 'Reset preferences',
          description: 'Appearance, layout and notification settings return to defaults.',
          keywords: 'defaults settings restore',
          control: (
            <Button
              variant="secondary"
              data-action="reset-settings"
              onClick={resetPreferences}
            >
              Reset
            </Button>
          ),
        },
        {
          id: 'data-clear',
          title: 'Clear data on this device',
          description: sync.state.account
            ? 'Removes blocks, tasks, notes, deadlines and history from this device only. Your cloud copy returns on the next sync.'
            : 'Permanently removes every block, task, note, deadline and day of history from this device.',
          keywords: 'delete wipe erase danger reset',
          danger: true,
          control: (
            <Button
              variant="secondary"
              className="settings-clear-btn"
              data-action="clear-data"
              onClick={() => setClearOpen(true)}
            >
              Clear device data
            </Button>
          ),
        },
        ...(sync.state.configured
          ? [
              {
                id: 'data-delete-cloud',
                title: 'Delete my cloud data',
                description: sync.state.account
                  ? `Permanently deletes everything under your account (${sync.state.account.email ?? 'signed in'}), then clears this device and signs out. This cannot be undone.`
                  : 'Sign in with Google to permanently delete everything stored in your Firebase account.',
                keywords: 'delete cloud remote firebase google account erase danger gdpr',
                danger: true,
                wide: true,
                control: (
                  <Button
                    variant="secondary"
                    className="settings-clear-btn"
                    data-action="delete-cloud-data"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete my cloud data
                  </Button>
                ),
              },
            ]
          : []),
      ],
    },
    {
      id: 'ai',
      title: 'AI',
      icon: 'mirror',
      keywords: 'assistant provider gemini groq openrouter notes chat',
      items: [
        {
          id: 'ai-enabled',
          title: 'AI assistance',
          description: 'Allow Personal OS to suggest titles, summaries and next steps.',
          keywords: 'enable assistant suggestions',
          control: (
            <Switch
              checked={settings.ai.enabled}
              onChange={(enabled) => settingsStore.set({ ai: { enabled } })}
              aria-label="AI assistance"
            />
          ),
        },
        {
          id: 'ai-provider',
          title: 'Provider',
          description:
            'Gemini Flash streams replies today. Groq and OpenRouter are adapter stubs for later.',
          keywords: 'gemini groq openrouter model',
          wide: true,
          control: (
            <select
              className="settings-select"
              aria-label="AI provider"
              value={settings.ai.provider}
              onChange={(event) =>
                settingsStore.set({ ai: { provider: event.target.value as AIProvider } })
              }
            >
              {AI_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label}
                </option>
              ))}
            </select>
          ),
        },
        {
          id: 'ai-key',
          title: 'API key',
          description:
            'Stored in this device’s secure storage — never in settings backups or cloud sync.',
          keywords: 'key token secret credential gemini google groq openrouter',
          wide: true,
          control: <AiKeyField />,
        },
        {
          id: 'ai-notes',
          title: 'Read your notes',
          description: 'Let AI use note text for context. Off by default.',
          keywords: 'notes context privacy',
          control: (
            <Switch
              checked={settings.ai.canReadNotes}
              onChange={(canReadNotes) => settingsStore.set({ ai: { canReadNotes } })}
              aria-label="Read your notes"
            />
          ),
        },
      ],
    },
    {
      id: 'sync',
      title: 'Sync',
      icon: 'cloud',
      keywords: 'firebase google account cloud remote devices backup offline',
      items: [
        {
          id: 'sync-account',
          title: sync.state.account
            ? sync.state.account.displayName?.trim() ||
              sync.state.account.email ||
              'Google account'
            : 'Google account',
          description: !sync.state.configured
            ? 'Sync is not configured in this build. Add Firebase environment variables to enable it.'
            : sync.state.account
              ? sync.state.account.email ?? 'Connected to Firebase.'
              : 'Sign in to sync tasks, notes, timetable, settings and stats across devices.',
          keywords: 'google sign in account firebase',
          wide: true,
          control: sync.state.account ? (
            <Button
              variant="secondary"
              data-action="sync-sign-out"
              onClick={() => void sync.signOut()}
            >
              Sign out
            </Button>
          ) : !sync.state.configured ? (
            <span className="chip">Not configured</span>
          ) : signingIn ? (
            <div className="settings-sync-actions">
              <Button variant="secondary" disabled>
                {platformName === 'macos' ? 'Waiting for browser…' : 'Signing in…'}
              </Button>
              {platformName === 'macos' ? (
                <Button variant="ghost" data-action="sync-cancel" onClick={cancelSignIn}>
                  Cancel
                </Button>
              ) : null}
            </div>
          ) : (
            <Button
              variant="primary"
              data-action="sync-sign-in"
              onClick={() => void startSignIn()}
            >
              <Icon name="cloud" size={16} />
              Sign in with Google
            </Button>
          ),
        },
        {
          id: 'sync-status',
          title: 'Status',
          description: syncStatusText(sync.state),
          descriptionClassName:
            sync.state.status === 'error' ? 'settings-sync-error' : undefined,
          keywords: 'sync now last synced offline pending error',
          wide: true,
          control: sync.state.account ? (
            <Button
              variant="secondary"
              data-action="sync-now"
              disabled={sync.state.status === 'syncing' || sync.state.status === 'offline'}
              onClick={() => void sync.syncNow()}
            >
              {sync.state.status === 'syncing' ? 'Syncing…' : 'Sync now'}
            </Button>
          ) : (
            <span className="settings-sync-note">Local only</span>
          ),
        },
        ...(sync.state.notice
          ? [
              {
                id: 'sync-notice',
                title: 'Notice',
                description: sync.state.notice,
                keywords: 'notice trimmed stats sync',
                wide: true,
                control: null,
              },
            ]
          : []),
        ...(sync.state.unsyncable && sync.state.unsyncable.length > 0
          ? [
              {
                id: 'sync-unsyncable',
                title: `${sync.state.unsyncable.length} item${sync.state.unsyncable.length === 1 ? '' : 's'} can’t sync`,
                description: sync.state.unsyncable
                  .map(
                    (record) =>
                      `${record.title} (${record.collection}/${record.id}) is ${Math.round(record.bytes / 1024)} KB — shorten it to sync.`,
                  )
                  .join(' '),
                keywords: 'unsyncable too large oversized note size error',
                wide: true,
                control: <span className="chip">Skipped</span>,
              },
            ]
          : []),
        {
          id: 'sync-privacy',
          title: 'AI API key',
          description: 'The key stays on this device and is never written to Firebase.',
          keywords: 'privacy secret key token',
          control: <span className="chip">Device only</span>,
        },
      ],
    },
    {
      id: 'about',
      title: 'About',
      icon: 'gear',
      keywords: 'version local storage keys shortcuts personalize help',
      items: [
        {
          id: 'about-local',
          title: 'This device',
          description: `Personal OS v${packageJson.version}. Local-first — your data lives in this browser. With sync on, it also goes to your private Firebase account.`,
          descriptionClassName: 'settings-about',
          keywords: 'version local privacy offline sync',
          control: <span className="chip">v{packageJson.version}</span>,
        },
        {
          id: 'about-privacy',
          title: 'Privacy policy',
          description: 'What sync stores, what AI receives, and how to delete it.',
          keywords: 'privacy policy data gdpr health gemini firestore legal',
          control: (
            <a
              className="settings-link"
              data-action="privacy-policy"
              href={PRIVACY_POLICY_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Read policy
            </a>
          ),
        },
        {
          id: 'about-storage',
          title: 'Storage keys',
          description: 'Your records and preferences use separate versioned keys.',
          keywords: 'personalos storage local browser',
          block: true,
          control: (
            <div className="settings-keys">
              <span className="chip mono">personalOS_v1</span>
              <span className="chip mono">personalOS_settings_v1</span>
            </div>
          ),
        },
        {
          id: 'about-shortcuts',
          title: 'Keyboard shortcuts',
          description: 'Every chord, key and calendar shortcut in one place.',
          keywords: 'keys cheat sheet help',
          control: (
            <Button
              variant="secondary"
              data-action="open-shortcuts"
              onClick={() => onOpenShortcuts?.()}
            >
              <Icon name="keys" size={16} />
              Open cheat sheet
            </Button>
          ),
        },
        {
          id: 'about-personalize',
          title: 'Run setup again',
          description: 'Change your name, schedule, focus style and layout preset.',
          keywords: 'onboarding personalize wizard',
          control: (
            <Button
              variant="secondary"
              data-action="personalize"
              onClick={() => onOpenOnboarding?.()}
            >
              Personalize
            </Button>
          ),
        },
      ],
    },
  ];

  const normalizedQuery = query.trim().toLowerCase();
  const filteredGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !normalizedQuery ||
          matches(
            [
              group.title,
              group.keywords ?? '',
              item.title,
              item.description ?? '',
              item.keywords ?? '',
            ].join(' '),
            normalizedQuery,
          ),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const resultCount = filteredGroups.reduce((total, group) => total + group.items.length, 0);

  return (
    <div className="view-content settings-view">
      <div className="view-head settings-head">
        <div>
          <h1>Settings</h1>
          <div className="rule" />
        </div>
        <span className={`${syncChipClass} settings-local-chip`}>{syncChipLabel}</span>
      </div>

      <div className="settings-search">
        <Icon name="search" size={18} className="settings-search-icon" />
        <input
          type="search"
          className="settings-search-input"
          aria-label="Search settings"
          placeholder="Search settings"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setQuery('');
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="settings-search-clear"
            aria-label="Clear search field"
            onClick={() => setQuery('')}
          >
            <Icon name="x" size={15} />
          </button>
        ) : null}
      </div>

      <p className="settings-search-status" role="status">
        {normalizedQuery ? `${resultCount} setting${resultCount === 1 ? '' : 's'} found` : ''}
      </p>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      {filteredGroups.map((group) => (
        <SettingsGroupCard key={group.id} group={group} />
      ))}

      {normalizedQuery && filteredGroups.length === 0 ? (
        <div className="empty settings-empty">
          <Icon name="search" size={22} />
          <h3>No settings found</h3>
          <p className="hint">Try a shorter word or check a different section.</p>
          <Button variant="secondary" onClick={() => setQuery('')}>
            Clear search
          </Button>
        </div>
      ) : null}

      <Modal open={pendingImport !== null} onClose={closeImport} title="Import backup">
        <p className="hint">
          This replaces your current data with the chosen backup. Export first if you want a
          rollback point.
        </p>
        <div className="counts">
          <span className="chip">{countList(pendingImport, 'blocks')} blocks</span>
          <span className="chip">{countList(pendingImport, 'tasks')} tasks</span>
          <span className="chip">{countList(pendingImport, 'notes')} notes</span>
          <span className="chip">{countList(pendingImport, 'deadlines')} deadlines</span>
        </div>
        <div className="row end">
          <Button variant="ghost" onClick={closeImport}>
            Cancel
          </Button>
          <Button variant="primary" data-action="import-confirm" onClick={confirmImport}>
            Import backup
          </Button>
        </div>
      </Modal>

      <Modal open={clearOpen} onClose={closeClear} title="Clear data on this device">
        <p className="hint">
          This permanently removes every block, task, note, deadline and day of history from this
          device only. It cannot be undone.
        </p>
        {sync.state.account ? (
          <p className="hint">
            You are signed in, so your cloud copy stays in Firebase and returns on the next sync.
            Use “Delete my cloud data” to remove it too.
          </p>
        ) : null}
        <div className="field">
          <label htmlFor="clear-confirm-input">
            Type <span className="mono">{CLEAR_CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            id="clear-confirm-input"
            className="settings-input"
            type="text"
            autoComplete="off"
            value={clearText}
            onChange={(event) => setClearText(event.target.value)}
          />
        </div>
        <div className="row end">
          <Button variant="ghost" onClick={closeClear}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-action="clear-confirm"
            disabled={!isClearConfirmation(clearText)}
            onClick={confirmClear}
          >
            Clear device data
          </Button>
        </div>
      </Modal>

      <Modal open={deleteOpen} onClose={closeDelete} title="Delete my cloud data">
        <p className="hint">
          This permanently deletes every block, task, note, deadline, app state document and saved
          preference in your Firebase account. It then clears this device and signs you out. This
          cannot be undone.
        </p>
        {sync.state.account ? null : (
          <p className="hint">You are signed out. Sign in with Google to delete your cloud data.</p>
        )}
        <div className="field">
          <label htmlFor="delete-cloud-input">
            Type <span className="mono">{DELETE_CLOUD_CONFIRM_PHRASE}</span> to confirm
          </label>
          <input
            id="delete-cloud-input"
            className="settings-input"
            type="text"
            autoComplete="off"
            value={deleteText}
            disabled={deleting}
            onChange={(event) => setDeleteText(event.target.value)}
          />
        </div>
        {deleteProgress ? (
          <p className="hint" role="status">
            {deleteProgress.total === null
              ? `Deleted ${deleteProgress.deleted} documents…`
              : `Deleted ${deleteProgress.deleted} of ${deleteProgress.total} documents…`}
          </p>
        ) : null}
        {deleteError ? (
          <p className="hint settings-sync-error" role="alert">
            {deleteError}
          </p>
        ) : null}
        <div className="row end">
          <Button variant="ghost" onClick={closeDelete} disabled={deleting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            data-action="delete-cloud-confirm"
            disabled={
              !isDeleteCloudConfirmation(deleteText) || !sync.state.account || deleting
            }
            onClick={() => void runDeleteCloud()}
          >
            {deleting ? 'Deleting…' : deleteError ? 'Retry' : 'Delete permanently'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};
