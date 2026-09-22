import { cn } from "@/lib/cn";

/** The one surface treatment used by every card on the site. */
export function Card({
  className,
  interactive = false,
  children,
  ...rest
}: {
  className?: string;
  interactive?: boolean;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-white/8 bg-ink-850/70 p-7 backdrop-blur-sm",
        interactive &&
          "transition duration-300 hover:-translate-y-1 hover:border-white/16 hover:bg-ink-800/80",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
