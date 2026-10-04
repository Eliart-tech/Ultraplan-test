/**
 * In-memory router of the HTML edition. Only a bare `#anchor` reaches the
 * page inside claude.ai, so pages map to hash routes — "#studio" (default),
 * "#concurrents", "#historique", "#reglages" — and query parameters
 * (`/?script=…`, `/concurrents?rapport=…`) live in
 * memory only. Feeds the next/link and next/navigation shims.
 */

export type RoutePath = "/" | "/concurrents" | "/historique" | "/reglages" | (string & {});

export interface RouteState {
  path: RoutePath;
  /** "" or "?script=…". */
  search: string;
  /** Shared, stable for a given `search` (useSearchParams identity). */
  params: URLSearchParams;
}

const HASH_BY_PATH: Record<string, string> = {
  "/": "#studio",
  "/concurrents": "#concurrents",
  "/historique": "#historique",
  "/reglages": "#reglages",
};
const PATH_BY_HASH: Record<string, string> = Object.fromEntries(Object.entries(HASH_BY_PATH).map(([path, hash]) => [hash, path]));

export function isRouteHash(hash: string): boolean {
  return hash in PATH_BY_HASH;
}

/** "#historique" for "/historique"; unknown paths keep the studio hash. */
export function hashForPath(path: string): string {
  return HASH_BY_PATH[path] ?? "#studio";
}

function pathFromHash(hash: string): RoutePath {
  return PATH_BY_HASH[hash] ?? "/";
}

function readLocationHash(): string {
  try {
    return window.location.hash;
  } catch {
    return "";
  }
}

function makeState(path: RoutePath, search: string): RouteState {
  const clean = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : "";
  return { path, search: clean, params: new URLSearchParams(clean) };
}

let state: RouteState = makeState(typeof window === "undefined" ? "/" : pathFromHash(readLocationHash()), "");
const listeners = new Set<() => void>();

export function getRoute(): RouteState {
  return state;
}

export function subscribeRoute(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setRoute(path: RoutePath, search: string): boolean {
  const next = makeState(path, search);
  if (next.path === state.path && next.search === state.search) return false;
  state = next;
  for (const listener of listeners) listener();
  return true;
}

export interface ParsedHref {
  path: RoutePath;
  search: string;
  /** In-page anchor after navigation ("/reglages#sources" → "sources"). */
  fragment: string;
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function isExternalHref(href: string): boolean {
  return EXTERNAL.test(href);
}

/** "/reglages?x=1#sources", "?script=a", "#profil" → path, search, fragment (relative to the current route). */
export function parseHref(href: string): ParsedHref {
  let rest = href.trim();
  let fragment = "";
  const hashIndex = rest.indexOf("#");
  if (hashIndex !== -1) {
    fragment = rest.slice(hashIndex + 1);
    rest = rest.slice(0, hashIndex);
  }
  let search = "";
  const queryIndex = rest.indexOf("?");
  if (queryIndex !== -1) {
    search = rest.slice(queryIndex);
    rest = rest.slice(0, queryIndex);
  }
  const path = rest ? (rest.startsWith("/") ? rest : `/${rest}`).replace(/\/+$/, "") || "/" : state.path;
  return { path, search: rest || search ? search : state.search, fragment };
}

/** The href to render on an <a>: the route hash (query parameters stay in memory). */
export function hrefFor(href: string): string {
  if (isExternalHref(href)) return href;
  if (href.startsWith("#")) return href;
  return hashForPath(parseHref(href).path);
}

let ignoreNextHashChange: string | null = null;

function writeHash(hash: string, replace: boolean): void {
  if (readLocationHash() === hash) return;
  try {
    if (replace) {
      const url = `${window.location.href.split("#")[0]}${hash}`;
      originalReplaceState?.call(window.history, window.history.state, "", url);
    } else {
      ignoreNextHashChange = hash;
      window.location.hash = hash;
    }
  } catch {
    // Sandboxed frame without history access: the in-memory route still changes.
    ignoreNextHashChange = null;
  }
}

function scrollToFragment(fragment: string): void {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const target = fragment ? document.getElementById(decodeURIComponent(fragment)) : null;
      if (target) target.scrollIntoView({ block: "start" });
      else if (!fragment) window.scrollTo({ top: 0 });
    }),
  );
}

export interface NavigateOptions {
  replace?: boolean;
  scroll?: boolean;
}

/** Client-side navigation for internal hrefs ("/", "/historique?x", "/reglages#sources"). */
export function navigate(href: string, { replace = false, scroll = true }: NavigateOptions = {}): void {
  const { path, search, fragment } = parseHref(href);
  const changedPath = path !== state.path;
  setRoute(path, search);
  writeHash(hashForPath(path), replace);
  if (scroll && (changedPath || fragment)) scrollToFragment(fragment);
}

/** Scrolls to an in-page anchor without touching the route hash. */
export function scrollToAnchor(id: string): void {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ block: "start" });
  if (target.tabIndex >= 0 || target.hasAttribute("tabindex")) target.focus({ preventScroll: true });
}

let originalReplaceState: History["replaceState"] | null = null;

/**
 * Installs the hash listener and patches `history.replaceState`: the Studio
 * calls `replaceState(null, "", pathname)` to drop `?script=` / `?analyse=`
 * once consumed — here that clears the in-memory query and keeps the route
 * hash (the real URL is left alone).
 */
export function installRouter(): void {
  window.addEventListener("hashchange", () => {
    const hash = readLocationHash();
    if (ignoreNextHashChange === hash) {
      ignoreNextHashChange = null;
      return;
    }
    // Plain in-page anchors ("#profil") are not routes.
    if (!isRouteHash(hash)) return;
    if (setRoute(pathFromHash(hash), "")) window.scrollTo({ top: 0 });
  });

  originalReplaceState = window.history.replaceState;
  const patched: History["replaceState"] = function (this: History, data, unused, url) {
    if (url === undefined || url === null) {
      try {
        return originalReplaceState?.call(this, data, unused);
      } catch {
        return undefined;
      }
    }
    const { path, search } = parseHref(String(url).replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+/i, ""));
    // Only the query matters to the app: the real pathname of the frame is not a route.
    setRoute(isRouteHashPath(path) ? path : state.path, search);
  };
  try {
    window.history.replaceState = patched;
  } catch {
    // read-only history in this frame: nothing to patch
  }
}

function isRouteHashPath(path: string): boolean {
  return path in HASH_BY_PATH;
}
