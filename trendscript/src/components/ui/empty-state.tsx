import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  /** Lucide icon element, e.g. `<Inbox />`. */
  icon?: ReactNode;
  title: ReactNode;
  /** What to do next — never fake data, always an explanation. */
  description?: ReactNode;
  /** Primary call to action (Button / ButtonLink). */
  action?: ReactNode;
  /** Extra content under the action (steps, links). */
  children?: ReactNode;
  size?: "sm" | "md";
  /** Heading level of the title (default h2). */
  titleAs?: "h2" | "h3" | "p";
  className?: string;
}

/**
 * Explains why a list or panel is empty and what to do about it.
 *
 * @example
 * <EmptyState icon={<History />} title="Aucun script enregistré"
 *   description="Chaque script généré dans le Studio s'enregistre ici automatiquement."
 *   action={<ButtonLink href="/" variant="primary">Ouvrir le Studio</ButtonLink>} />
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  children,
  size = "md",
  titleAs = "h2",
  className,
}: EmptyStateProps) {
  const Title = titleAs;
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-line-strong bg-surface/60 text-center",
        size === "sm" ? "gap-2 px-5 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      {icon ? (
        <span
          aria-hidden
          className={cn(
            "mb-1 flex items-center justify-center rounded-2xl bg-accent-soft text-accent-ink",
            size === "sm" ? "size-10 [&_svg]:size-5" : "size-12 [&_svg]:size-6",
          )}
        >
          {icon}
        </span>
      ) : null}
      <Title className={cn("font-semibold text-ink", size === "sm" ? "text-sm" : "text-base")}>{title}</Title>
      {description ? (
        <p className={cn("max-w-md leading-relaxed text-muted", size === "sm" ? "text-xs" : "text-sm")}>
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
      {children}
    </div>
  );
}
