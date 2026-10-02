"use client";

import { Check, Plus, Wand2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { REFINE_SUGGESTIONS } from "./studio-options";

const MAX_INSTRUCTION = 1000;

export interface RefinePanelProps {
  id?: string;
  busy: boolean;
  disabled?: boolean;
  onSubmit: (instruction: string) => void;
  onClose: () => void;
}

/**
 * "Affiner": free instruction + quick suggestions (toggle chips). Claude
 * changes only what is asked and keeps the rest.
 */
export function RefinePanel({ id, busy, disabled = false, onSubmit, onClose }: RefinePanelProps) {
  const [chips, setChips] = useState<string[]>([]);
  const [text, setText] = useState("");
  const instruction = [...chips, text.trim()].filter(Boolean).join(". ").slice(0, MAX_INSTRUCTION);
  const valid = instruction.length >= 3;

  function toggle(chip: string) {
    setChips((current) => (current.includes(chip) ? current.filter((item) => item !== chip) : [...current, chip]));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || busy || disabled) return;
    onSubmit(instruction);
    setChips([]);
    setText("");
  }

  return (
    <form
      id={id}
      onSubmit={handleSubmit}
      aria-label="Affiner le script"
      className="rounded-2xl border border-accent/25 bg-accent-soft/40 p-4 animate-fade-in sm:p-5"
    >
      <div role="group" aria-label="Suggestions rapides" className="flex flex-wrap gap-1.5">
        {REFINE_SUGGESTIONS.map((chip) => {
          const pressed = chips.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(chip)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,color] duration-150",
                pressed
                  ? "border-accent bg-accent text-accent-fg"
                  : "border-line bg-surface text-ink hover:border-accent/50 hover:text-accent-ink",
              )}
            >
              {pressed ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <Plus aria-hidden className="size-3.5" />}
              {chip}
            </button>
          );
        })}
      </div>

      <Field
        label="Autre chose à changer ?"
        optional
        className="mt-4"
        hint="Claude modifie uniquement ce que vous demandez et garde le reste (faits, sources, structure)."
      >
        <Textarea
          value={text}
          rows={2}
          autoResize
          maxLength={MAX_INSTRUCTION}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ex. : remplace l'exemple du milieu par un cas concret en France"
        />
      </Field>

      <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="ghost" onClick={onClose}>
          Fermer
        </Button>
        <Button type="submit" disabled={!valid || disabled} loading={busy} leftIcon={<Wand2 aria-hidden className="size-4" />}>
          Affiner le script
        </Button>
      </div>
    </form>
  );
}
