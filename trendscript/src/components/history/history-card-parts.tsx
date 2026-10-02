import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatDateTime, formatRelative } from "@/lib/client/format";

/** One "icon + text" item of a card's meta line. */
export function MetaItem({ icon, children, className }: { icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <li className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span aria-hidden className="inline-flex shrink-0 text-faint [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </li>
  );
}

/** Relative date ("il y a 3 h") with the full date in a tooltip and for machines. */
export function RelativeTime({ iso, now }: { iso: string; now: number }) {
  const full = formatDateTime(iso);
  const relative = formatRelative(iso, now);
  if (!relative) return <span>Date inconnue</span>;
  return (
    <time dateTime={iso} title={full}>
      {relative}
    </time>
  );
}

/** Narrow labels on phones, full labels from `sm` (the accessible name stays the full one). */
export function ResponsiveLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span aria-hidden className="sm:hidden">
        {short}
      </span>
      <span className="max-sm:sr-only">{full}</span>
    </>
  );
}
