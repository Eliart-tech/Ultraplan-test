import { cn } from "@/lib/cn";

/**
 * TrendScript mark: a rising trend line that ends in a "hot" dot, on the
 * violet brand tile. Same drawing as the generated favicon (app/icon.tsx).
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[28%] bg-brand shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_4px_12px_-4px_rgb(107_78_255/0.6)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" width={size * 0.64} height={size * 0.64} fill="none">
        <path
          d="M3.5 16.5 9 11l3.5 3.5L19 8"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19.5" cy="7.5" r="2.6" fill="#ff5c3a" stroke="#fff" strokeWidth="1.4" />
      </svg>
    </span>
  );
}

/** Logo mark + "TrendScript" wordmark. */
export function Wordmark({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className={cn("text-[0.98rem] font-semibold tracking-[-0.02em] text-ink", compact && "max-[359px]:sr-only")}>
        Trend<span className="text-accent">Script</span>
      </span>
    </span>
  );
}
