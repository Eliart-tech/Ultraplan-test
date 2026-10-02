"use client";

import { Check, Copy, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./button";

/**
 * Copies text to the clipboard: async Clipboard API first, then the legacy
 * hidden-textarea + execCommand fallback (insecure origins, older WebViews).
 * Resolves to false when both fail.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission denied or document not focused: try the fallback.
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

type CopyState = "idle" | "copied" | "failed";

export interface CopyButtonProps {
  /** Text to copy, or a function computing it at click time (large exports). */
  text: string | (() => string);
  /** Visible label (default "Copier"). */
  label?: string;
  /** Label after success (default "Copié"). */
  copiedLabel?: string;
  /** Icon-only square button; `label` becomes its accessible name. */
  iconOnly?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onCopied?: () => void;
  className?: string;
}

/**
 * Copy-to-clipboard button with "Copié" feedback for 2 s, announced to
 * screen readers.
 *
 * @example <CopyButton text={script.caption} label="Copier la légende" size="sm" />
 */
export function CopyButton({
  text,
  label = "Copier",
  copiedLabel = "Copié",
  iconOnly = false,
  variant = "secondary",
  size = "sm",
  disabled,
  onCopied,
  className,
}: CopyButtonProps) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function handleClick() {
    const ok = await copyText(typeof text === "function" ? text() : text);
    setState(ok ? "copied" : "failed");
    if (ok) onCopied?.();
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }

  const icon =
    state === "copied" ? (
      <Check aria-hidden className="size-4 text-success-ink" />
    ) : state === "failed" ? (
      <X aria-hidden className="size-4 text-danger-ink" />
    ) : (
      <Copy aria-hidden className="size-4" />
    );
  const current = state === "copied" ? copiedLabel : state === "failed" ? "Échec de la copie" : label;

  return (
    <>
      <Button
        variant={variant}
        size={size}
        iconOnly={iconOnly}
        disabled={disabled}
        onClick={handleClick}
        aria-label={iconOnly ? current : undefined}
        title={iconOnly ? label : undefined}
        leftIcon={icon}
        className={className}
      >
        {iconOnly ? null : current}
      </Button>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copié dans le presse-papiers" : state === "failed" ? "La copie a échoué" : ""}
      </span>
    </>
  );
}
