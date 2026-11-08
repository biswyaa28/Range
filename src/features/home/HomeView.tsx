import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { BentoCardSize } from '@/domain/types';
import type { AppRoute } from '@/hooks';
import { useMediaQuery, useReducedMotion } from '@/hooks';
import {
  BENTO_GAP,
  BENTO_SIZE_NAME,
  BENTO_SIZE_SPAN,
  applyBentoPreset,
  hideBentoCard,
  isBentoPresetName,
  moveBentoCard,
  nextBentoSize,
  placeBentoCard,
  resolveBentoLayout,
  setBentoSize,
  showBentoCard,
  snapBentoSize,
  visibleBentoOrder,
  type BentoPresetName,
  type ResolvedBentoLayout,
} from '@/domain/bentoLayout';
import { store, useStore } from '@/store';
import { useToast } from '@/ui/Toast';
import { Icon } from '@/ui/Icon';
import { Haptics } from '@/engines/haptics';
import { buildHomeData } from './homeData';
import { HomeProvider, type HomeActions } from './HomeContext';
import { SmartGreeting } from './SmartGreeting';
import { SearchBar } from './SearchBar';
import { HOME_CARD_SPECS, homeCard } from './cards/registry';
import './HomeView.css';

export interface HomeViewProps {
  onNavigate?: (route: AppRoute) => void;
}

const TRAILING_RAIL_IDS = ['calendar', 'timeline'];

interface DragState {
  id: string;
  pointerId: number;
  rect: { left: number; top: number; width: number; height: number };
  x: number;
  y: number;
  grabX: number;
  grabY: number;
  targetIndex: number;
}

interface ResizeState {
  id: string;
  pointerId: number;
  left: number;
  top: number;
  height: number;
  startLeft: number;
  span: number;
  size: BentoCardSize;
  originalSize: BentoCardSize;
  columnWidth: number;
}

function focusWhenReady(selector: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  let attempts = 0;
  const tick = () => {
    const element = document.querySelector<HTMLElement>(selector);
    if (element) {
      element.focus();
      if (element instanceof HTMLInputElement) element.select();
      return;
    }
    if (attempts++ >= 60) return;
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(tick);
    } else {
      window.setTimeout(tick, 16);
    }
  };
  tick();
}

function cardExtraClass(id: string): string {
  if (id === 'calendar') return ' cal';
  if (id === 'timeline') return ' tlcard';
  return '';
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigate }) => {
  const state = useStore();
  const toast = useToast();
  const reduced = useReducedMotion();
  const desktop = useMediaQuery('(min-width: 1100px)');
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState(false);
  const [liveMsg, setLiveMsg] = useState('');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);

  const bentoRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);
  const pendingRef = useRef<{ cleanup: () => void } | null>(null);

  const data = useMemo(() => buildHomeData(state, now), [state, now]);
  const layout = useMemo(
    () =>
      resolveBentoLayout(
        state.layout,
        HOME_CARD_SPECS,
        state.profile.preset,
        TRAILING_RAIL_IDS,
      ),
    [state.layout, state.profile.preset],
  );
  const visible = useMemo(() => visibleBentoOrder(layout), [layout]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  const announce = useCallback((message: string) => {
    setLiveMsg(message);
  }, []);

  const persistLayout = useCallback(
    (next: ResolvedBentoLayout, preset?: BentoPresetName) => {
      store.set((current) => {
        current.layout.order = next.order.slice();
        current.layout.size = { ...next.size };
        current.layout.hidden = next.hidden.slice();
        if (preset) current.profile.preset = preset;
      });
    },
    [],
  );

  const navigate = useCallback(
    (route: AppRoute) => {
      if (onNavigate) {
        onNavigate(route);
      } else if (typeof window !== 'undefined') {
        window.location.hash = `#${route}`;
      }
    },
    [onNavigate],
  );

  const addTask = useCallback(() => {
    navigate('tasks');
    focusWhenReady('#todo-title');
  }, [navigate]);

  const startFocus = useCallback(() => {
    navigate('focus');
    focusWhenReady('#focus-start');
  }, [navigate]);

  const openDeadlines = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.location.hash = '#deadlines';
    } else {
      onNavigate?.('plan');
    }
  }, [onNavigate]);

  const actions = useMemo<HomeActions>(
    () => ({ navigate, openDeadlines, addTask, startFocus }),
    [addTask, navigate, openDeadlines, startFocus],
  );
  const contextValue = useMemo(() => ({ data, actions }), [actions, data]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('customizing', editing);
    return () => document.body.classList.remove('customizing');
  }, [editing]);

  useEffect(() => {
    const onCustomize = () => setEditing((value) => !value);
    window.addEventListener('personalos:customize-home', onCustomize);
    return () => window.removeEventListener('personalos:customize-home', onCustomize);
  }, []);

  useEffect(() => {
    return () => {
      pendingRef.current?.cleanup();
    };
  }, []);

  const showCardById = useCallback(
    (id: string) => {
      const currentState = store.get();
      const currentLayout = resolveBentoLayout(
        currentState.layout,
        HOME_CARD_SPECS,
        currentState.profile.preset,
        TRAILING_RAIL_IDS,
      );
      persistLayout(showBentoCard(currentLayout, id, HOME_CARD_SPECS));
      const title = homeCard(id)?.title ?? 'Card';
      announce(`${title} added back to Home`);
      Haptics.select();
    },
    [announce, persistLayout],
  );

  const hideCard = useCallback(
    (id: string) => {
      const def = homeCard(id);
      if (!def) return;
      persistLayout(hideBentoCard(layoutRef.current, id));
      toast.showToast(`Hid “${def.title}”`, 'Undo', () => showCardById(id));
      announce(`${def.title} hidden. Undo is available in the toast.`);
      Haptics.tap();
    },
    [announce, persistLayout, showCardById, toast],
  );

  const setCardSize = useCallback(
    (id: string, size: BentoCardSize) => {
      const def = homeCard(id);
      if (!def) return;
      if ((layoutRef.current.size[id] ?? def.defaultSize) === size) return;
      persistLayout(setBentoSize(layoutRef.current, id, size, HOME_CARD_SPECS));
      announce(`${def.title} set to ${BENTO_SIZE_NAME[size]}.`);
      Haptics.select();
    },
    [announce, persistLayout],
  );

  const moveCard = useCallback(
    (id: string, direction: number) => {
      const def = homeCard(id);
      if (!def) return;
      const currentVisible = visibleRef.current;
      const from = currentVisible.indexOf(id);
      const to = Math.max(0, Math.min(currentVisible.length - 1, from + direction));
      if (from < 0) return;
      if (to === from) {
        announce(`${def.title} is already ${direction < 0 ? 'first' : 'last'}`);
        return;
      }
      const next = moveBentoCard(layoutRef.current, id, direction);
      persistLayout(next);
      const nextVisible = visibleBentoOrder(next);
      announce(`${def.title} moved to position ${nextVisible.indexOf(id) + 1}.`);
      Haptics.select();
      window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(`[data-card="${id}"] [data-role="drag"]`)
          ?.focus({ preventScroll: true });
      });
    },
    [announce, persistLayout],
  );

  const applyPreset = useCallback(
    (name: BentoPresetName) => {
      const next = applyBentoPreset(name, HOME_CARD_SPECS, TRAILING_RAIL_IDS);
      persistLayout(next, name);
      const label = name.charAt(0).toUpperCase() + name.slice(1);
      toast.showToast(`Preset applied: ${label}`);
      announce(`${name} preset applied`);
      Haptics.select();
    },
    [announce, persistLayout, toast],
  );

  const resetLayout = useCallback(() => {
    store.set((current) => {
      current.layout.order = [];
      current.layout.size = {};
      current.layout.hidden = [];
    });
    toast.showToast('Layout reset to defaults');
    announce('Layout reset to defaults');
    Haptics.tap();
  }, [announce, toast]);

  const computeDropIndex = useCallback((clientX: number, clientY: number, dragId: string) => {
    const bento = bentoRef.current;
    if (!bento) return 0;
    const nonDrag = visibleRef.current.filter((id) => id !== dragId);
    const box = bento.getBoundingClientRect();
    const pointerX = clientX - box.left;
    const pointerY = clientY - box.top;
    const elements = Array.from(bento.children) as HTMLElement[];

    for (const element of elements) {
      if (
        !element.classList.contains('card') ||
        element.classList.contains('drag-ghost')
      ) {
        continue;
      }
      const id = element.dataset.card;
      if (!id) continue;
      const index = nonDrag.indexOf(id);
      if (index < 0) continue;
      const { offsetLeft: left, offsetTop: top, offsetWidth: width, offsetHeight: height } = element;
      if (pointerY < top) return index;
      if (pointerY < top + height && pointerX < left + width / 2) return index;
    }

    return nonDrag.length;
  }, []);

  const beginDrag = useCallback(
    (id: string, pointerId: number, clientX: number, clientY: number, element: HTMLElement) => {
      const index = visibleRef.current.indexOf(id);
      if (index < 0) return;
      const rect = element.getBoundingClientRect();
      const next: DragState = {
        id,
        pointerId,
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        x: clientX,
        y: clientY,
        grabX: clientX - rect.left,
        grabY: clientY - rect.top,
        targetIndex: index,
      };
      dragRef.current = next;
      setDrag(next);
      announce(
        `${homeCard(id)?.title ?? 'Card'} picked up. Drop to place, Escape to cancel.`,
      );
      Haptics.impact();
    },
    [announce],
  );

  const finishDrag = useCallback(
    (commit: boolean) => {
      const current = dragRef.current;
      if (!current) return;
      const currentVisible = visibleRef.current;
      const nonDrag = currentVisible.filter((id) => id !== current.id);
      const beforeId = nonDrag[Math.min(current.targetIndex, nonDrag.length)] ?? null;
      dragRef.current = null;
      setDrag(null);

      if (commit) {
        const next = placeBentoCard(layoutRef.current, current.id, beforeId);
        persistLayout(next);
        const nextVisible = visibleBentoOrder(next);
        const title = homeCard(current.id)?.title ?? 'Card';
        announce(`${title} moved to position ${nextVisible.indexOf(current.id) + 1}.`);
        Haptics.select();
      } else {
        announce('Move cancelled');
        Haptics.tap();
      }
    },
    [announce, persistLayout],
  );

  const finishResize = useCallback(
    (commit: boolean) => {
      const current = resizeRef.current;
      if (!current) return;
      resizeRef.current = null;
      setResize(null);

      if (commit && current.size !== current.originalSize) {
        persistLayout(setBentoSize(layoutRef.current, current.id, current.size, HOME_CARD_SPECS));
        const title = homeCard(current.id)?.title ?? 'Card';
        announce(`${title} set to ${BENTO_SIZE_NAME[current.size]}.`);
        Haptics.select();
      } else if (!commit) {
        announce('Resize cancelled');
        Haptics.tap();
      }
    },
    [announce, persistLayout],
  );

  const onDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
      if (!editing) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      const handle = event.currentTarget;
      const card = handle.closest('.card');
      if (!(card instanceof HTMLElement) || !card.closest('.bento')) return;
      event.preventDefault();

      if (event.pointerType === 'touch') {
        let lastX = event.clientX;
        let lastY = event.clientY;
        let timer = 0;

        const cleanup = () => {
          window.clearTimeout(timer);
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', cancel);
          if (pendingRef.current?.cleanup === cleanup) pendingRef.current = null;
        };
        const move = (moveEvent: PointerEvent) => {
          if (moveEvent.pointerId !== event.pointerId) return;
          lastX = moveEvent.clientX;
          lastY = moveEvent.clientY;
          if (
            Math.abs(moveEvent.clientX - event.clientX) > 10 ||
            Math.abs(moveEvent.clientY - event.clientY) > 10
          ) {
            cleanup();
          }
        };
        const up = (upEvent: PointerEvent) => {
          if (upEvent.pointerId !== event.pointerId) return;
          cleanup();
        };
        const cancel = (cancelEvent: PointerEvent) => {
          if (cancelEvent.pointerId !== event.pointerId) return;
          cleanup();
        };

        timer = window.setTimeout(() => {
          cleanup();
          beginDrag(id, event.pointerId, lastX, lastY, card);
        }, 250);
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', cancel);
        pendingRef.current = { cleanup };
        return;
      }

      beginDrag(id, event.pointerId, event.clientX, event.clientY, card);
    },
    [beginDrag, editing],
  );

  useEffect(() => {
    const dragId = drag?.id;
    const pointerId = drag?.pointerId;
    if (!dragId || pointerId === undefined) return;

    document.body.classList.add('dragging-any');
    let frame = 0;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      event.preventDefault();
      const targetIndex = computeDropIndex(event.clientX, event.clientY, dragId);
      setDrag((previous) => {
        if (!previous) return previous;
        const next = { ...previous, x: event.clientX, y: event.clientY, targetIndex };
        dragRef.current = next;
        return next;
      });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      finishDrag(true);
    };
    const onCancel = () => finishDrag(false);
    const autoScroll = () => {
      const current = dragRef.current;
      if (!current) return;
      const margin = 76;
      let scrolled = false;
      if (current.y < margin) {
        window.scrollBy(0, -Math.min(20, Math.ceil((margin - current.y) / 3)));
        scrolled = true;
      } else if (current.y > window.innerHeight - margin) {
        window.scrollBy(
          0,
          Math.min(20, Math.ceil((current.y - (window.innerHeight - margin)) / 3)),
        );
        scrolled = true;
      }
      if (scrolled) {
        const targetIndex = computeDropIndex(current.x, current.y, current.id);
        if (targetIndex !== current.targetIndex) {
          setDrag((previous) => {
            if (!previous) return previous;
            const next = { ...previous, targetIndex };
            dragRef.current = next;
            return next;
          });
        }
      }
      frame = window.requestAnimationFrame(autoScroll);
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    if (!reduced) frame = window.requestAnimationFrame(autoScroll);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      if (frame) window.cancelAnimationFrame(frame);
      document.body.classList.remove('dragging-any');
    };
  }, [computeDropIndex, drag?.id, drag?.pointerId, finishDrag, reduced]);

  const onResizePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, id: string) => {
      if (!editing || !desktop || event.pointerType === 'touch') return;
      if (event.button !== 0) return;
      const def = homeCard(id);
      const card = event.currentTarget.closest('.card');
      const bento = bentoRef.current;
      if (!def || !(card instanceof HTMLElement) || !bento) return;
      event.preventDefault();
      event.stopPropagation();
      const rect = card.getBoundingClientRect();
      const size = layoutRef.current.size[id] ?? def.defaultSize;
      const columnWidth = (bento.clientWidth - 11 * BENTO_GAP) / 12;
      const next: ResizeState = {
        id,
        pointerId: event.pointerId,
        left: card.offsetLeft,
        top: card.offsetTop,
        height: card.offsetHeight,
        startLeft: rect.left,
        span: BENTO_SIZE_SPAN[size],
        size,
        originalSize: size,
        columnWidth,
      };
      resizeRef.current = next;
      setResize(next);
      Haptics.impact();
    },
    [desktop, editing],
  );

  useEffect(() => {
    const resizeId = resize?.id;
    const pointerId = resize?.pointerId;
    if (!resizeId || pointerId === undefined) return;
    const def = homeCard(resizeId);
    const bento = bentoRef.current;
    if (!def || !bento) return;

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      const columnWidth = (bento.clientWidth - 11 * BENTO_GAP) / 12;
      const want = Math.round(
        (event.clientX - (resizeRef.current?.startLeft ?? 0) + BENTO_GAP / 2) /
          (columnWidth + BENTO_GAP),
      );
      const size = snapBentoSize(want, def);
      setResize((previous) => {
        if (!previous || previous.size === size) return previous;
        const next = { ...previous, size, span: BENTO_SIZE_SPAN[size] };
        resizeRef.current = next;
        Haptics.tap();
        return next;
      });
    };
    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      finishResize(true);
    };
    const onCancel = () => finishResize(false);

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [finishResize, resize?.id, resize?.pointerId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (resizeRef.current) {
        event.preventDefault();
        finishResize(false);
        return;
      }
      if (dragRef.current) {
        event.preventDefault();
        finishDrag(false);
        return;
      }
      if (editing) {
        const target = event.target;
        if (
          target instanceof HTMLElement &&
          target.closest('input, textarea, select, [contenteditable="true"]')
        ) {
          return;
        }
        setEditing(false);
        announce('Customize mode off');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [announce, editing, finishDrag, finishResize]);

  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    if (!editing) {
      previousRectsRef.current.clear();
      return;
    }
    const bento = bentoRef.current;
    if (!bento) return;
    const nextRects = new Map<string, DOMRect>();
    const cards = Array.from(bento.children).filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element.classList.contains('card') &&
        !element.classList.contains('drag-ghost'),
    );

    cards.forEach((element) => {
      const id = element.dataset.card;
      if (!id) return;
      const rect = element.getBoundingClientRect();
      nextRects.set(id, rect);
      const previous = previousRectsRef.current.get(id);
      if (!previous || reduced) return;
      const dx = previous.left - rect.left;
      const dy = previous.top - rect.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;

      element.style.transition = 'none';
      element.style.transform = `translate(${dx}px, ${dy}px)`;
      window.requestAnimationFrame(() => {
        element.style.transition = 'transform .25s ease-out';
        element.style.transform = '';
        window.setTimeout(() => {
          element.style.transition = '';
        }, 300);
      });
    });

    previousRectsRef.current = nextRects;
  });

  const toggleEdit = () => {
    if (editing) {
      finishDrag(false);
      finishResize(false);
      announce('Customize mode off');
      setEditing(false);
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.cust')?.focus({ preventScroll: true });
      });
    } else {
      setEditing(true);
      announce('Customize mode on. Cards can be reordered, resized and hidden.');
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.editbar .pbtn')?.focus({ preventScroll: true });
      });
    }
  };

  const doneEditing = () => {
    finishDrag(false);
    finishResize(false);
    setEditing(false);
    announce('Customize mode off');
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.cust')?.focus({ preventScroll: true });
    });
  };

  const railIds = useMemo(() => {
    if (editing) return [];
    const tail: string[] = [];
    for (let index = visible.length - 1; index >= 0; index--) {
      const id = visible[index];
      if (id === 'calendar' || id === 'timeline') tail.unshift(id);
      else break;
    }
    return tail;
  }, [editing, visible]);

  const flatIds = useMemo(
    () => visible.filter((id) => !railIds.includes(id)),
    [railIds, visible],
  );

  const presetValue = isBentoPresetName(state.profile.preset)
    ? state.profile.preset
    : 'balanced';

  const nonDragIds = drag ? visible.filter((id) => id !== drag.id) : [];

  const renderCard = (id: string, index: number) => {
    const def = homeCard(id);
    if (!def) return null;
    const size = layout.size[id] ?? def.defaultSize;
    const dragging = drag?.id === id;
    const baseStyle = { '--i': String(index) } as React.CSSProperties;
    const style: React.CSSProperties = dragging
      ? {
          ...baseStyle,
          position: 'fixed',
          left: drag.rect.left,
          top: drag.rect.top,
          width: drag.rect.width,
          height: drag.rect.height,
          margin: 0,
          zIndex: 500,
          pointerEvents: 'none',
          transform: `translate3d(${drag.x - drag.grabX - drag.rect.left}px, ${
            drag.y - drag.grabY - drag.rect.top
          }px, 0) scale(1.02)`,
        }
      : baseStyle;

    return (
      <section
        key={id}
        className={`card${cardExtraClass(id)}${dragging ? ' drag-ghost' : ''}`}
        data-card={id}
        data-size={size}
        aria-label={def.title}
        style={style}
      >
        {editing && (
          <>
            <div className="ctools">
              <button
                type="button"
                className="tool"
                data-role="drag"
                aria-label={`Reorder ${def.title}. Or focus it and use the arrow keys.`}
                title="Drag to reorder (arrow keys also move it)"
                onPointerDown={(event) => onDragHandlePointerDown(event, id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    moveCard(id, -1);
                  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    moveCard(id, 1);
                  }
                }}
              >
                <Icon name="grip" />
              </button>
              <span className="szseg" role="group" aria-label={`Size of ${def.title}`}>
                {def.allowedSizes.map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-role="size"
                    data-sz={option}
                    className={option === size ? 'on' : ''}
                    aria-pressed={option === size}
                    aria-label={`Set ${def.title} to ${BENTO_SIZE_NAME[option]}`}
                    onClick={() => setCardSize(id, option)}
                  >
                    {option}
                  </button>
                ))}
              </span>
              <span className="mvbtns">
                <button
                  type="button"
                  className="tool"
                  data-role="up"
                  aria-label={`Move ${def.title} earlier`}
                  onClick={() => moveCard(id, -1)}
                >
                  <Icon name="chevU" />
                </button>
                <button
                  type="button"
                  className="tool"
                  data-role="down"
                  aria-label={`Move ${def.title} later`}
                  onClick={() => moveCard(id, 1)}
                >
                  <Icon name="chevD" />
                </button>
              </span>
              <button
                type="button"
                className="tool hide"
                data-role="hide"
                aria-label={`Hide ${def.title} from Home`}
                title="Hide card"
                onClick={() => hideCard(id)}
              >
                <Icon name="eyeoff" />
              </button>
            </div>
            {desktop && (
              <button
                type="button"
                className="rz"
                data-role="resize"
                aria-label={`Resize ${def.title}. Press Enter to cycle size`}
                title="Drag to resize"
                onPointerDown={(event) => onResizePointerDown(event, id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setCardSize(id, nextBentoSize(size, def));
                    window.requestAnimationFrame(() => {
                      document
                        .querySelector<HTMLElement>(
                          `[data-card="${id}"] [data-role="resize"]`,
                        )
                        ?.focus({ preventScroll: true });
                    });
                  }
                }}
              />
            )}
          </>
        )}
        {def.render(size)}
      </section>
    );
  };

  const placeholder = drag ? (
    <div
      key="drop-slot"
      className="drop-slot"
      data-size={layout.size[drag.id] ?? homeCard(drag.id)?.defaultSize ?? 'M'}
      aria-hidden="true"
      style={{ height: drag.rect.height }}
    />
  ) : null;

  return (
    <HomeProvider value={contextValue}>
      <div className={`home${railIds.length ? '' : ' no-rail'}`}>
        <div className="home-main">
          <SmartGreeting />
          <SearchBar editing={editing} onToggleEdit={toggleEdit} />

          {editing && (
            <>
              <div className="editbar" role="toolbar" aria-label="Customize Home">
                <button type="button" className="pbtn" onClick={doneEditing}>
                  <Icon name="check" />
                  Done
                </button>
                <label className="psel">
                  <span className="plab">Preset</span>
                  <select
                    id="preset-sel"
                    aria-label="Layout preset"
                    value={presetValue}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (isBentoPresetName(value)) applyPreset(value);
                    }}
                  >
                    <option value="minimal">Minimal</option>
                    <option value="balanced">Balanced</option>
                    <option value="everything">Everything</option>
                  </select>
                </label>
                <button type="button" className="pbtn ghost" onClick={resetLayout}>
                  Reset layout
                </button>
                <span style={{ flex: 1 }} />
                <span className="ehint">
                  Drag the grip to reorder · drag a corner to resize · arrow keys move a focused
                  card
                </span>
              </div>
              <div className="tray" id="hidden-tray">
                <span className="tlab">
                  <Icon name="eyeoff" />
                  Hidden cards
                </span>
                {layout.hidden.length ? (
                  layout.hidden.map((id) => {
                    const def = homeCard(id);
                    if (!def) return null;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="tray-chip"
                        data-role="show"
                        data-card={id}
                        onClick={() => showCardById(id)}
                      >
                        <Icon name="eye" />
                        {def.title}
                      </button>
                    );
                  })
                ) : (
                  <span className="tnone">No hidden cards</span>
                )}
              </div>
            </>
          )}

          <div className="bento" id="bento" ref={bentoRef}>
            {flatIds.map((id, index) => {
              const showPlaceholder =
                drag !== null && id !== drag.id && nonDragIds.indexOf(id) === drag.targetIndex;
              return (
                <React.Fragment key={id}>
                  {showPlaceholder && placeholder}
                  {renderCard(id, index)}
                </React.Fragment>
              );
            })}
            {drag && drag.targetIndex >= nonDragIds.length && placeholder}
            {resize && (
              <div
                className="rez-outline"
                aria-hidden="true"
                style={{
                  left: resize.left,
                  top: resize.top,
                  height: resize.height,
                  width:
                    resize.columnWidth * resize.span + (resize.span - 1) * BENTO_GAP,
                }}
              >
                <span>
                  {resize.size} · {resize.span} of 12 columns
                </span>
              </div>
            )}
          </div>
        </div>

        {railIds.length > 0 && (
          <aside className="rail" aria-label="Calendar and timeline">
            {railIds.map((id, index) => renderCard(id, flatIds.length + index))}
          </aside>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </p>
    </HomeProvider>
  );
};
