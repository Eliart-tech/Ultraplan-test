/**
 * Tiny toast store of the HTML edition (download / copy feedback).
 */

import { useSyncExternalStore } from "react";

export interface Notice {
  id: number;
  tone: "success" | "info" | "warning";
  text: string;
}

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

/** Shows a toast for `durationMs`; returns its id (for an early `dismissNotice`). */
export function pushNotice(tone: Notice["tone"], text: string, durationMs = 6_000): number {
  const notice = { id: nextId++, tone, text };
  notices = [...notices.slice(-2), notice];
  emit();
  setTimeout(() => dismissNotice(notice.id), durationMs);
  return notice.id;
}

export function dismissNotice(id: number): void {
  const next = notices.filter((notice) => notice.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useNotices(): Notice[] {
  return useSyncExternalStore(subscribe, () => notices, () => notices);
}
