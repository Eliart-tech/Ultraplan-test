"use client";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";

/**
 * Environment variable name as a code chip with a copy button
 * ("YOUTUBE_API_KEY" ⧉). Only the name is copied — never a value.
 */
export function EnvVarChip({
  name,
  optional = false,
  className,
}: {
  name: string;
  optional?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-0.5 rounded-lg border border-line bg-surface-2 pl-2.5 text-ink",
        className,
      )}
    >
      <code className="min-w-0 truncate font-mono text-xs font-medium">{name}</code>
      {optional ? <span className="ml-1 text-[0.6875rem] text-faint">facultatif</span> : null}
      <CopyButton
        text={name}
        iconOnly
        variant="ghost"
        size="sm"
        label={`Copier le nom ${name}`}
        copiedLabel={`${name} copié`}
        className="size-7! rounded-md!"
      />
    </span>
  );
}
