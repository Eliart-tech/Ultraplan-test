/**
 * `next/link` for the HTML edition: a plain <a> whose href is the hash route
 * ("/" → "#studio", "/historique" → "#historique", "/reglages" →
 * "#reglages"); clicks navigate in memory (query parameters included)
 * without reloading. External and in-page hrefs are left untouched.
 */

import type { AnchorHTMLAttributes, MouseEvent, ReactNode, Ref } from "react";
import { hrefFor, isExternalHref, navigate } from "./router";

interface UrlObjectLike {
  pathname?: string | null;
  query?: string | null | Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>;
  hash?: string | null;
}

export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string | UrlObjectLike;
  replace?: boolean;
  scroll?: boolean;
  prefetch?: boolean | "auto" | null;
  shallow?: boolean;
  passHref?: boolean;
  legacyBehavior?: boolean;
  locale?: string | false;
  onNavigate?: (event: { preventDefault(): void }) => void;
  ref?: Ref<HTMLAnchorElement>;
  children?: ReactNode;
}

function formatHref(href: string | UrlObjectLike): string {
  if (typeof href === "string") return href;
  let search = "";
  if (typeof href.query === "string") search = href.query ? `?${href.query.replace(/^\?/, "")}` : "";
  else if (href.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(href.query)) {
      if (value === null || value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) params.append(key, String(item));
    }
    const text = params.toString();
    search = text ? `?${text}` : "";
  }
  const hash = href.hash ? `#${href.hash.replace(/^#/, "")}` : "";
  return `${href.pathname ?? ""}${search}${hash}`;
}

export default function Link({
  href,
  replace,
  scroll,
  onClick,
  onNavigate,
  target,
  children,
  // Next-only props, accepted and ignored.
  prefetch: _prefetch,
  shallow: _shallow,
  passHref: _passHref,
  legacyBehavior: _legacyBehavior,
  locale: _locale,
  ...rest
}: LinkProps) {
  void _prefetch;
  void _shallow;
  void _passHref;
  void _legacyBehavior;
  void _locale;
  const raw = formatHref(href);
  const internal = !isExternalHref(raw) && !raw.startsWith("#");

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || !internal) return;
    if (target && target !== "_self") return;
    event.preventDefault();
    let cancelled = false;
    onNavigate?.({ preventDefault: () => (cancelled = true) });
    if (!cancelled) navigate(raw, { replace, scroll: scroll !== false });
  }

  return (
    <a {...rest} target={target} href={hrefFor(raw)} onClick={handleClick}>
      {children}
    </a>
  );
}
