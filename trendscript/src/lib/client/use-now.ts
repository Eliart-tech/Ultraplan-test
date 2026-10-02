import { useSyncExternalStore } from "react";

/**
 * A shared "current time" for relative dates ("il y a 3 h"). Reading
 * `Date.now()` during render is impure (lint error, hydration mismatches);
 * this store ticks once a minute for all subscribers and refreshes when the
 * tab becomes visible again (background timers are throttled).
 */

const TICK_MS = 60_000;

let current = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function refresh() {
  current = Date.now();
  for (const listener of listeners) listener();
}

function onVisibility() {
  if (document.visibilityState === "visible") refresh();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    timer = setInterval(refresh, TICK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    // The value may be stale if nobody was subscribed for a while.
    if (Date.now() - current >= TICK_MS) queueMicrotask(refresh);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener("visibilitychange", onVisibility);
    }
  };
}

function getSnapshot(): number {
  return current;
}

/**
 * Server render and hydration use the current minute (floored), so both
 * sides usually agree on labels such as "il y a 3 h"; the client switches to
 * its live value right after hydration. Stable within a minute, as React
 * requires for consecutive calls.
 */
function getServerSnapshot(): number {
  return Math.floor(Date.now() / TICK_MS) * TICK_MS;
}

/**
 * Timestamp (ms) refreshed every minute — safe to use during render.
 *
 * @example
 * const now = useNow();
 * <time dateTime={iso}>{formatRelative(iso, now)}</time>
 */
export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
