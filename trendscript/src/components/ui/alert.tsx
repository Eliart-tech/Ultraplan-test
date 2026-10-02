import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "info" | "success" | "warning" | "danger";

const tones: Record<AlertTone, { box: string; icon: string; Icon: typeof Info }> = {
  info: { box: "border-accent/25 bg-accent-soft", icon: "text-accent-ink", Icon: Info },
  success: { box: "border-success/25 bg-success-soft", icon: "text-success-ink", Icon: CircleCheck },
  warning: { box: "border-warning/35 bg-warning-soft", icon: "text-warning-ink", Icon: TriangleAlert },
  danger: { box: "border-danger/25 bg-danger-soft", icon: "text-danger-ink", Icon: OctagonAlert },
};

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Replace the default tone icon (pass `null` for none). */
  icon?: ReactNode | null;
  /** Buttons / links shown under the text. */
  action?: ReactNode;
  /** Shows a close button. */
  onDismiss?: () => void;
  /**
   * Live-region role. Default: "alert" for danger (interrupts), "status" for
   * the others (polite). Use "none" for static notes present at page load.
   */
  role?: "alert" | "status" | "none";
  size?: "sm" | "md";
  className?: string;
}

/**
 * Inline message: info, success, warning (guardrails, partial sources) or
 * danger (failed request).
 *
 * @example
 * <Alert tone="warning" title="Sujet sensible">La viralité est plafonnée à 39.</Alert>
 */
export function Alert({
  tone = "info",
  title,
  children,
  icon,
  action,
  onDismiss,
  role,
  size = "md",
  className,
}: AlertProps) {
  const style = tones[tone];
  const Icon = style.Icon;
  const liveRole = role ?? (tone === "danger" ? "alert" : "status");
  return (
    <div
      role={liveRole === "none" ? undefined : liveRole}
      className={cn(
        "relative flex gap-3 rounded-xl border text-ink",
        size === "sm" ? "px-3 py-2.5 text-[0.8125rem]" : "px-4 py-3.5 text-sm",
        style.box,
        className,
      )}
    >
      {icon === null ? null : (
        <span aria-hidden className={cn("mt-px shrink-0 [&_svg]:size-[1.125rem]", style.icon)}>
          {icon ?? <Icon />}
        </span>
      )}
      <div className={cn("min-w-0 flex-1 leading-relaxed", onDismiss && "pr-6")}>
        {title ? <p className="font-semibold text-ink">{title}</p> : null}
        {children ? <div className={cn("text-ink/80", title ? "mt-0.5" : null)}>{children}</div> : null}
        {action ? <div className="mt-3 flex flex-wrap items-center gap-2">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fermer"
          className="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-lg text-muted transition-colors duration-150 hover:bg-ink/5 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
        </button>
      ) : null}
    </div>
  );
}
