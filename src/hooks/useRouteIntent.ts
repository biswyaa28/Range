import { useEffect, useRef } from 'react';

/**
 * Cross-view intents such as "open this task" or "new note".
 *
 * The view that owns an intent is lazily loaded, so an intent sent right
 * after a navigation can arrive before that view mounts its listener and be
 * lost. Each intent is parked until the view claims it, which keeps the
 * handoff working no matter how slow the chunk load is.
 */
interface ParkedIntent {
  detail: string;
  /** Route the intent travels to; a route change discards the others. */
  route: string;
}

/** The route that owns each intent, so a stale intent cannot fire later. */
const TARGET_ROUTE: Record<string, string> = {
  'personalos:edit-task': 'tasks',
  'personalos:open-note': 'notes',
  'personalos:new-note': 'notes',
  'personalos:edit-block': 'plan',
  'personalos:new-block': 'plan',
  'personalos:open-day': 'plan',
  'personalos:customize-home': 'home',
};

const parked = new Map<string, ParkedIntent>();

/**
 * Sends an intent to the view that owns it, now or once it mounts. The
 * intent is parked so a view that is still loading claims it on mount.
 */
export function sendIntent(name: string, detail = ''): void {
  const route = TARGET_ROUTE[name];
  if (route) parked.set(name, { detail, route });
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/** Claims the parked intent for `name`; null when there is none. */
function claimIntent(name: string): string | null {
  const intent = parked.get(name);
  parked.delete(name);
  return intent ? intent.detail : null;
}

/** Drops parked intents aimed at a route other than `route`. */
export function dropIntentsForOtherRoutes(route: string): void {
  for (const [name, intent] of parked) {
    if (intent.route !== route) parked.delete(name);
  }
}

/**
 * Runs `handle` for an intent of `name`, whether it arrives now or while the
 * view mounts. The handler is read through a ref so it can be an inline
 * function without re-subscribing on every render.
 */
export function useRouteIntent(name: string, handle: (detail: string) => void): void {
  const handlerRef = useRef(handle);
  useEffect(() => {
    handlerRef.current = handle;
  });

  useEffect(() => {
    const onIntent = (event: Event) => {
      // The live event supersedes any parked copy of the same intent.
      claimIntent(name);
      handlerRef.current((event as CustomEvent<string>).detail ?? '');
    };
    window.addEventListener(name, onIntent);

    const waiting = claimIntent(name);
    if (waiting !== null) handlerRef.current(waiting);

    return () => window.removeEventListener(name, onIntent);
  }, [name]);
}
