import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ReportSectionProps {
  /** Anchor id (targeted by the report navigation). */
  id: string;
  title: ReactNode;
  icon: ReactNode;
  /** One or two sentences: what the section shows and how it was computed. */
  description?: ReactNode;
  /** Right side of the heading row (info popover, counter, control). */
  aside?: ReactNode;
  /** "foryou" tints the icon tile: sections about what the user should do. */
  tone?: "default" | "hot" | "foryou";
  children: ReactNode;
  className?: string;
}

const tiles = {
  default: "bg-surface-2 text-muted",
  hot: "bg-hot-soft text-hot-ink",
  foryou: "bg-accent-soft text-accent-ink",
};

/** One block of the competitor report: icon, h2, intro, content. */
export function ReportSection({
  id,
  title,
  icon,
  description,
  aside,
  tone = "default",
  children,
  className,
}: ReportSectionProps) {
  const headingId = `${id}-titre`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-32", className)}>
      <header className="mb-4 flex items-start gap-3">
        <span
          aria-hidden
          className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]", tiles[tone])}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-lg font-semibold leading-snug tracking-tight text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{description}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
      </header>
      {children}
    </section>
  );
}

/** Small uppercase heading inside a section card. */
export function SubHeading({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={cn("text-xs font-semibold uppercase tracking-[0.06em] text-muted", className)}>{children}</h3>
  );
}

export interface ReportNavItem {
  id: string;
  label: string;
}

/**
 * In-report navigation: chips that scroll horizontally on phones, a sticky
 * list from `lg`. Plain anchors.
 */
export function ReportNav({ items }: { items: ReportNavItem[] }) {
  return (
    <nav
      aria-label="Sections du rapport"
      className="-mx-4 mb-6 overflow-x-auto px-4 scrollbar-none sm:-mx-6 sm:px-6 lg:sticky lg:top-24 lg:mx-0 lg:mb-0 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:px-0"
    >
      <ul className="flex gap-2 lg:flex-col lg:gap-0.5">
        {items.map((item) => (
          <li key={item.id} className="shrink-0">
            <a
              href={`#${item.id}`}
              className="inline-flex h-8 items-center whitespace-nowrap rounded-full border border-line bg-surface px-3 text-[0.8125rem] font-medium text-muted shadow-xs transition-colors duration-150 hover:border-line-strong hover:text-ink lg:flex lg:h-8 lg:w-full lg:rounded-lg lg:border-transparent lg:bg-transparent lg:px-3 lg:shadow-none lg:hover:border-transparent lg:hover:bg-surface-2"
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
