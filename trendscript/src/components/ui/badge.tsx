import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Platform } from "@/lib/types";
import { PLATFORM_META } from "./platform-icon";

export type BadgeTone = "neutral" | "accent" | "hot" | "success" | "warning" | "danger";
export type BadgeVariant = "soft" | "solid" | "outline";
export type BadgeSize = "sm" | "md";

const soft: Record<BadgeTone, string> = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent-ink",
  hot: "bg-hot-soft text-hot-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
};

const solid: Record<BadgeTone, string> = {
  neutral: "bg-ink text-canvas",
  accent: "bg-accent text-accent-fg",
  hot: "bg-hot text-hot-fg",
  success: "bg-success text-success-fg",
  warning: "bg-warning text-warning-fg",
  danger: "bg-danger text-danger-fg",
};

const outline: Record<BadgeTone, string> = {
  neutral: "border border-line text-muted",
  accent: "border border-accent/40 text-accent-ink",
  hot: "border border-hot/40 text-hot-ink",
  success: "border border-success/40 text-success-ink",
  warning: "border border-warning/50 text-warning-ink",
  danger: "border border-danger/40 text-danger-ink",
};

const dots: Record<BadgeTone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  hot: "bg-hot",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

const sizes: Record<BadgeSize, string> = {
  sm: "h-5 gap-1 rounded-md px-1.5 text-[0.6875rem] [&_svg]:size-3",
  md: "h-6 gap-1.5 rounded-lg px-2 text-xs [&_svg]:size-3.5",
};

export interface BadgeProps extends ComponentProps<"span"> {
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: BadgeSize;
  /** Leading icon (lucide). */
  icon?: ReactNode;
  /** Leading coloured status dot (ignored when `icon` is set). */
  dot?: boolean;
}

/**
 * Small status label: lifespan, saturation, sensitivity, "Gratuit", "Virale"…
 *
 * @example <Badge tone="hot" icon={<Flame />}>Virale</Badge>
 */
export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "md",
  icon,
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  const palette = variant === "solid" ? solid : variant === "outline" ? outline : soft;
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center whitespace-nowrap font-medium leading-none",
        sizes[size],
        palette[tone],
        className,
      )}
      {...rest}
    >
      {icon ? (
        <span aria-hidden className="inline-flex">
          {icon}
        </span>
      ) : dot ? (
        <span aria-hidden className={cn("size-1.5 rounded-full", dots[tone])} />
      ) : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export interface PlatformBadgeProps extends Omit<ComponentProps<"span">, "children"> {
  platform: Platform;
  size?: BadgeSize;
  /** Text after the platform name, e.g. a count ("YouTube · 4"). */
  suffix?: ReactNode;
}

/** Badge with the platform glyph in its brand colour and the French name. */
export function PlatformBadge({ platform, size = "md", suffix, className, ...rest }: PlatformBadgeProps) {
  const meta = PLATFORM_META[platform];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center whitespace-nowrap border border-line bg-surface font-medium leading-none text-ink",
        sizes[size],
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className={meta.textClass} strokeWidth={2.2} />
      {meta.label}
      {suffix !== undefined && suffix !== null ? (
        <span className="font-normal tabular-nums text-muted">· {suffix}</span>
      ) : null}
    </span>
  );
}
