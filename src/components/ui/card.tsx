import { cn } from "@/lib/cn";

export function Card({
  className,
  tone = "white",
  interactive = false,
  children,
  ...rest
}: {
  className?: string;
  tone?: "white" | "sky";
  interactive?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-4xl border border-line",
        tone === "white" ? "bg-white" : "bg-sky-100",
        interactive &&
          "transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_50px_-24px_rgba(37,48,102,0.28)]",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Navy circle with a check — the bullet marker used across the site. */
export function CheckMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-800",
        className,
      )}
    >
      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none">
        <path
          d="M3.5 8.5 6.5 11.5 12.5 5"
          stroke="#fff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Stars({ count = 5, className }: { count?: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-1", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <svg key={i} viewBox="0 0 20 20" className="h-4 w-4 fill-ink-800">
          <path d="M10 1.5l2.47 5.1 5.53.77-4 3.96.96 5.6L10 14.3l-4.96 2.63.96-5.6-4-3.96 5.53-.77L10 1.5z" />
        </svg>
      ))}
    </span>
  );
}
