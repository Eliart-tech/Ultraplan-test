import { cn } from "@/lib/cn";
import { RichText } from "./rich-text";

/** Numbered setup steps (plain text from the server, links and env vars formatted). */
export function SetupSteps({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("flex flex-col gap-2.5", className)}>
      {steps.map((step, index) => (
        <li key={index} className="flex gap-3 text-sm leading-relaxed text-ink/85">
          <span
            aria-hidden
            className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[0.6875rem] font-semibold tabular-nums text-muted ring-1 ring-line"
          >
            {index + 1}
          </span>
          <span className="min-w-0 flex-1">
            <RichText text={step} />
          </span>
        </li>
      ))}
    </ol>
  );
}
