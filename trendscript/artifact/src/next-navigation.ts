/**
 * `next/navigation` for the HTML edition, backed by the in-memory hash
 * router: usePathname, useSearchParams (URLSearchParams of the in-memory
 * query), useRouter ({ push, replace, back, forward, refresh, prefetch }).
 */

import { useSyncExternalStore } from "react";
import { getRoute, navigate, subscribeRoute } from "./router";

export function usePathname(): string {
  return useSyncExternalStore(subscribeRoute, () => getRoute().path, () => "/");
}

export function useSearchParams(): URLSearchParams {
  return useSyncExternalStore(subscribeRoute, () => getRoute().params, () => getRoute().params);
}

export interface AppRouterLike {
  push(href: string, options?: { scroll?: boolean }): void;
  replace(href: string, options?: { scroll?: boolean }): void;
  back(): void;
  forward(): void;
  refresh(): void;
  prefetch(href: string): void;
}

const router: AppRouterLike = {
  push: (href, options) => navigate(href, { scroll: options?.scroll !== false }),
  replace: (href, options) => navigate(href, { replace: true, scroll: options?.scroll !== false }),
  back: () => window.history.back(),
  forward: () => window.history.forward(),
  // Everything is client state here: nothing to re-fetch.
  refresh: () => undefined,
  prefetch: () => undefined,
};

export function useRouter(): AppRouterLike {
  return router;
}

export function useParams(): Record<string, string> {
  return {};
}

export function useSelectedLayoutSegment(): string | null {
  const path = usePathname();
  return path === "/" ? null : path.slice(1);
}

export function redirect(href: string): never {
  navigate(href, { replace: true });
  throw new Error(`Redirection vers ${href}`);
}

export function notFound(): never {
  throw new Error("Page introuvable");
}
