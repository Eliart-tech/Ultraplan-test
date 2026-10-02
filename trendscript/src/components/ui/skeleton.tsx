import { cn } from "@/lib/cn";

/**
 * Loading placeholder block. Size it with classes (`h-4 w-32`, `size-10
 * rounded-full`…). Decorative: pair the loading region with `aria-busy`
 * or a Spinner label.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("shimmer animate-shimmer rounded-md", className)} />;
}

/** A few lines of text placeholder; the last line is shorter. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-3.5", index === lines - 1 && lines > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}
