import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface SettingsSectionProps {
  /** Anchor id (also targeted by the settings navigation). */
  id: string;
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** One block of the Réglages page: icon, h2, intro, content. */
export function SettingsSection({ id, icon, title, description, children, className }: SettingsSectionProps) {
  const headingId = `${id}-titre`;
  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-4", className)}>
      <header className="mb-5 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink [&_svg]:size-[18px]"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-title font-semibold text-ink">
            {title}
          </h2>
          {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{description}</p> : null}
        </div>
      </header>
      {children}
    </section>
  );
}
