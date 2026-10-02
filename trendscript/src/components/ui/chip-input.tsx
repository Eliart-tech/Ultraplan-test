"use client";

import { X } from "lucide-react";
import { useId, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";
import { controlWithinBase } from "./control-styles";
import { useFieldControlProps } from "./field";

/** Default normalisation: trim, drop leading '#', collapse inner spaces. */
export function normalizeChip(raw: string): string {
  return raw.trim().replace(/^#+/, "").replace(/\s+/g, " ").trim();
}

/** Case- and accent-insensitive key used to detect duplicates. */
function chipKey(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface ChipInputProps {
  value: string[];
  onValueChange: (value: string[]) => void;
  /** Maximum number of chips (default 8, the API limit for keywords). */
  max?: number;
  /** Minimum length of a chip after normalisation (default 2). */
  minLength?: number;
  /** Maximum length of a chip (default 60). */
  maxLength?: number;
  placeholder?: string;
  /** Visual prefix inside each chip, e.g. "#". */
  chipPrefix?: string;
  /** Custom normalisation (default: trim, strip leading '#', collapse spaces). */
  normalize?: (raw: string) => string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

/**
 * Tag input for keywords / hashtags. Enter or comma adds, pasting a list
 * adds each item, Backspace on an empty field removes the last chip, leaving
 * the field commits the pending text. Duplicates (case/accent-insensitive),
 * too-short items and items over `max` are refused with a short message.
 *
 * @example
 * <Field label="Mots-clés et hashtags" hint="Entrée ou virgule pour ajouter — 8 maximum">
 *   <ChipInput value={keywords} onValueChange={setKeywords} max={8} chipPrefix="#" />
 * </Field>
 */
export function ChipInput({
  value,
  onValueChange,
  max = 8,
  minLength = 2,
  maxLength = 60,
  placeholder = "Ajouter…",
  chipPrefix,
  normalize = normalizeChip,
  disabled,
  invalid,
  className,
  ...a11y
}: ChipInputProps) {
  const [draft, setDraft] = useState("");
  // Refusals are shown; confirmations ("Ajouté : …") are for screen readers only.
  const [message, setMessage] = useState<{ text: string; warn: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generated = useId();
  const messageId = `${generated}-message`;
  // `required` must not reach the text input: it is empty whenever chips
  // were committed, which would block form submission. Announce it instead.
  const { required, ...control } = useFieldControlProps({
    ...a11y,
    disabled,
    "aria-invalid": invalid || undefined,
  });
  const full = value.length >= max;

  /** Adds every item of `items`; returns the refused message, if any. */
  function addItems(items: string[]): string {
    const next = [...value];
    const keys = new Set(next.map(chipKey));
    let refused = "";
    for (const raw of items) {
      const chip = normalize(raw).slice(0, maxLength);
      if (!chip) continue;
      if (chip.length < minLength) {
        refused = `« ${chip} » est trop court (${minLength} caractères minimum).`;
        continue;
      }
      if (keys.has(chipKey(chip))) {
        refused = `« ${chip} » est déjà dans la liste.`;
        continue;
      }
      if (next.length >= max) {
        refused = `${max} éléments maximum.`;
        break;
      }
      next.push(chip);
      keys.add(chipKey(chip));
    }
    if (next.length !== value.length) onValueChange(next);
    if (refused) setMessage({ text: refused, warn: true });
    else if (next.length !== value.length) setMessage({ text: `Ajouté : ${next.slice(value.length).join(", ")}.`, warn: false });
    return refused;
  }

  function commitDraft() {
    if (!draft.trim()) return;
    addItems([draft]);
    setDraft("");
  }

  function removeAt(index: number) {
    const removed = value[index];
    onValueChange(value.filter((_, i) => i !== index));
    setMessage({ text: `Retiré : ${removed}.`, warn: false });
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter must not submit the surrounding form while typing a chip.
      if (draft.trim() || event.key === ",") event.preventDefault();
      commitDraft();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      event.preventDefault();
      removeAt(value.length - 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const text = event.clipboardData.getData("text");
    if (!/[,\n;]/.test(text)) return;
    event.preventDefault();
    addItems(`${draft}${text}`.split(/[,\n;]+/));
    setDraft("");
  }

  function handleChange(next: string) {
    if (next.includes(",")) {
      addItems(next.split(","));
      setDraft("");
      return;
    }
    setDraft(next);
    if (message) setMessage(null);
  }

  const describedBy =
    [control["aria-describedby"], message?.warn ? messageId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          controlWithinBase,
          "flex min-h-10 cursor-text flex-wrap items-center gap-1.5 px-2 py-1.5",
          control["aria-invalid"] && "border-danger",
          disabled && "cursor-not-allowed bg-surface-2 opacity-70",
        )}
        onClick={(event) => {
          if (event.target === event.currentTarget) inputRef.current?.focus();
        }}
      >
        {value.length > 0 ? (
          <ul className="contents" aria-label="Éléments ajoutés">
            {value.map((chip, index) => (
              <li
                key={`${index}-${chip}`}
                className="inline-flex h-7 max-w-full items-center gap-1 rounded-lg bg-accent-soft pl-2.5 pr-1 text-[0.8125rem] font-medium text-accent-ink animate-pop-in"
              >
                <span className="truncate">
                  {chipPrefix ? <span className="opacity-60">{chipPrefix}</span> : null}
                  {chip}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label={`Retirer « ${chip} »`}
                  className="inline-flex size-5 items-center justify-center rounded-md text-accent-ink/70 transition-colors duration-150 hover:bg-accent/15 hover:text-accent-ink"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={inputRef}
          type="text"
          enterKeyHint="enter"
          autoComplete="off"
          spellCheck={false}
          {...control}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          value={draft}
          maxLength={maxLength + 2}
          placeholder={full ? `${max} maximum atteint` : placeholder}
          readOnly={full}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={commitDraft}
          className="h-7 min-w-[8ch] flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
      </div>
      <div className="mt-1 flex items-start justify-between gap-3 text-xs">
        <p id={messageId} aria-live="polite" className={message?.warn ? "min-h-4 text-warning-ink" : "min-h-4"}>
          <span className={message?.warn ? undefined : "sr-only"}>{message?.text}</span>
        </p>
        <span className={cn("shrink-0 tabular-nums text-faint", full && "font-medium text-muted")}>
          {value.length}/{max}
        </span>
      </div>
    </div>
  );
}
