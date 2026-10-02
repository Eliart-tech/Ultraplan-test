import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ContainerSize = "sm" | "md" | "lg" | "xl";

const widths: Record<ContainerSize, string> = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
};

/** Centred page column with the app's horizontal gutters (16 px on phones). */
export function Container({ size = "lg", className, ...rest }: ComponentProps<"div"> & { size?: ContainerSize }) {
  return <div className={cn("mx-auto w-full px-4 sm:px-6 lg:px-8", widths[size], className)} {...rest} />;
}

export interface PageHeaderProps {
  title: ReactNode;
  /** One or two sentences under the title. */
  description?: ReactNode;
  /** Small label above the title ("Studio", "Étape 2"). */
  eyebrow?: ReactNode;
  /** Right-aligned actions (wrap under the title on phones). */
  actions?: ReactNode;
  className?: string;
}

/** Page title block: h1 + description + actions. One per page. */
export function PageHeader({ title, description, eyebrow, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-accent-ink">{eyebrow}</p>
        ) : null}
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-display">
          {title}
        </h1>
        {description ? <p className="mt-2 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
