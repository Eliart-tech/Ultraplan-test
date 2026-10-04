"use client";

import { Flame, History, LogOut, RotateCcw, Settings2, ShieldAlert, Sparkles, Swords, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Popover } from "@/components/ui/popover";
import { logout, type ServerStatus } from "@/lib/client/api";
import { useServerStatus } from "@/lib/client/use-server-status";
import { cn } from "@/lib/cn";
import { Wordmark } from "./logo";

interface NavItem {
  href: string;
  label: string;
  /** Label of the phone tab bar when `label` is too long for a fifth of 360 px. */
  short?: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { href: "/", label: "Studio", icon: Sparkles },
  { href: "/ce-qui-cartonne", label: "Ce qui cartonne", short: "Cartonne", icon: Flame },
  { href: "/concurrents", label: "Concurrents", icon: Swords },
  { href: "/historique", label: "Historique", icon: History },
  { href: "/reglages", label: "Réglages", icon: Settings2 },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Sticky app header: wordmark, main navigation (inline from `lg`, a second
 * row of five tabs below), server status pill and logout when the password
 * gate is on. On /login only the wordmark is shown (no status request).
 */
export function AppHeader() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/login") {
    return (
      <header className="glass sticky top-0 z-40 border-b border-line">
        <Container className="flex h-14 items-center sm:h-16">
          <Wordmark />
        </Container>
      </header>
    );
  }
  return <FullHeader pathname={pathname} />;
}

function FullHeader({ pathname }: { pathname: string }) {
  const { status, error, loading, reload } = useServerStatus();
  const authEnabled = status?.auth.enabled ?? false;
  // Discreet production warning when the app is open to anyone.
  const unprotected = status !== null && !status.auth.enabled && process.env.NODE_ENV === "production";

  return (
    <header className="glass sticky top-0 z-40 border-b border-line">
      <Container className="flex h-14 items-center gap-3 sm:h-16">
        <Link
          href="/"
          aria-label="TrendScript — aller au Studio"
          className="-mx-1 shrink-0 rounded-lg px-1 py-1 transition-opacity duration-150 hover:opacity-85"
        >
          <Wordmark compact />
        </Link>

        <nav aria-label="Navigation principale" className="ml-3 hidden lg:block">
          <ul className="flex items-center gap-1">
            {NAV.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isActive(pathname, item.href)} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
          {unprotected ? <UnprotectedWarning /> : null}
          <StatusPill status={status} error={error} loading={loading} onRetry={reload} />
          {authEnabled ? <LogoutButton /> : null}
        </div>
      </Container>

      <nav aria-label="Navigation principale" className="border-t border-line lg:hidden">
        <ul className="grid grid-cols-5">
          {NAV.map((item) => (
            <li key={item.href}>
              <MobileNavLink item={item} active={isActive(pathname, item.href)} />
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors duration-150",
        active ? "bg-surface text-ink shadow-xs ring-1 ring-line" : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      {/* Icons from xl: five items + the status pill must fit at lg. */}
      <Icon aria-hidden className={cn("hidden size-4 xl:block", active ? "text-accent" : "text-faint")} />
      {item.label}
    </Link>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        // Stacked icon + label on phones (5 tabs in 360 px), inline from sm.
        "relative flex h-12 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[0.6875rem] font-medium transition-colors duration-150 sm:h-11 sm:flex-row sm:gap-1.5 sm:text-[0.8125rem]",
        active ? "text-ink" : "text-muted hover:text-ink",
      )}
    >
      <Icon aria-hidden className={cn("size-4 shrink-0", active ? "text-accent" : "text-faint")} />
      {item.short ? (
        <>
          {/* The short label is a visible abbreviation; the accessible name stays the full one. */}
          <span aria-hidden className="sm:hidden">
            {item.short}
          </span>
          <span className="sr-only sm:not-sr-only">{item.label}</span>
        </>
      ) : (
        item.label
      )}
      {active ? <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent sm:inset-x-6" /> : null}
    </Link>
  );
}

interface StatusPillProps {
  status: ServerStatus | null;
  error: string | null;
  loading: boolean;
  onRetry: () => void;
}

/** "IA active · 5 sources" / "Mode sans IA" — links to Réglages. */
function StatusPill({ status, error, loading, onRetry }: StatusPillProps) {
  const pill =
    "inline-flex h-8 min-w-0 items-center gap-2 rounded-full border border-line bg-surface px-3 text-xs font-medium shadow-xs";

  if (!status) {
    if (error && !loading) {
      return (
        <button
          type="button"
          onClick={onRetry}
          title={`${error} — cliquez pour réessayer`}
          className={cn(pill, "text-danger-ink transition-colors duration-150 hover:bg-surface-2")}
        >
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-danger" />
          <span className="truncate">Serveur injoignable</span>
          <RotateCcw aria-hidden className="size-3.5 shrink-0" />
        </button>
      );
    }
    return (
      <span className={cn(pill, "text-muted")} role="status">
        <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-faint" />
        <span className="hidden sm:inline">Connexion…</span>
        <span className="sr-only sm:hidden">Connexion au serveur…</span>
      </span>
    );
  }

  const configured = status.sources.filter((source) => source.configured).length;
  const total = status.sources.length;
  const ai = status.ai.configured;
  const description = `${ai ? `IA active (${status.ai.model})` : "Mode sans IA : ANTHROPIC_API_KEY non définie"} · ${configured} source${configured > 1 ? "s" : ""} active${configured > 1 ? "s" : ""} sur ${total}. Voir les réglages.`;

  return (
    <Link
      href="/reglages"
      title={description}
      aria-label={description}
      className={cn(pill, "text-ink transition-colors duration-150 hover:border-line-strong hover:bg-surface-2")}
    >
      <span aria-hidden className="relative flex size-2 shrink-0">
        {ai ? (
          <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-50 motion-reduce:hidden" />
        ) : null}
        <span className={cn("relative size-2 rounded-full", ai ? "bg-success" : "bg-warning")} />
      </span>
      <span className="truncate">{ai ? "IA active" : "Mode sans IA"}</span>
      <span aria-hidden className="hidden h-3 w-px bg-line-strong lg:block" />
      <span className="hidden whitespace-nowrap tabular-nums text-muted lg:inline">
        {configured} source{configured > 1 ? "s" : ""}
      </span>
      {error ? <span className="sr-only">(statut peut-être obsolète : {error})</span> : null}
    </Link>
  );
}

function UnprotectedWarning() {
  return (
    <Popover
      label="Accès non protégé"
      title="Accès non protégé"
      align="end"
      trigger={<ShieldAlert aria-hidden className="size-4" />}
      triggerClassName="inline-flex size-8 items-center justify-center rounded-full text-warning-ink transition-colors duration-150 hover:bg-warning-soft aria-expanded:bg-warning-soft"
    >
      <p>
        Toute personne qui connaît l&apos;adresse de cette application peut l&apos;utiliser — et consommer vos
        quotas d&apos;API. Définissez <code className="rounded bg-surface-2 px-1 font-mono text-xs text-ink">APP_PASSWORD</code>{" "}
        dans les variables d&apos;environnement de l&apos;hébergeur, puis redéployez.
      </p>
    </Popover>
  );
}

function LogoutButton() {
  const [pending, setPending] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={() => {
        setPending(true);
        void logout();
      }}
      leftIcon={<LogOut aria-hidden className="size-4" />}
      aria-label="Se déconnecter"
      title="Se déconnecter"
    >
      <span className="hidden lg:inline">Déconnexion</span>
    </Button>
  );
}
