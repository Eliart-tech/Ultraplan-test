"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Ids and state a Field shares with the control inside it. */
export interface FieldContextValue {
  /** id of the control (the `<label htmlFor>` target). */
  id: string;
  /** id of the label element (for `aria-labelledby` on groups). */
  labelId: string;
  /** Space-separated ids of the hint and error, or undefined. */
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** The surrounding Field's ids/state, or null outside a Field. */
export function useField(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface ControlA11yProps {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
  disabled?: boolean;
}

/**
 * Merges a Field's id / aria-describedby / aria-invalid / required / disabled
 * into a control's props. Explicit props on the control win.
 * Used by Input, Textarea, Select, ChipInput, Slider.
 */
export function useFieldControlProps<P extends ControlA11yProps>(props: P): P & ControlA11yProps {
  const field = useField();
  if (!field) return props;
  const describedBy = [field.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") || undefined;
  return {
    ...props,
    id: props.id ?? field.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
    required: props.required ?? (field.required || undefined),
    disabled: props.disabled ?? (field.disabled || undefined),
  };
}

export interface FieldProps {
  /** Visible label. */
  label: ReactNode;
  /** Help text under the control (examples, units, consequences). */
  hint?: ReactNode;
  /** Error message; marks the control `aria-invalid` and is announced. */
  error?: ReactNode;
  required?: boolean;
  /** Appends a muted "(facultatif)" to the label. */
  optional?: boolean;
  disabled?: boolean;
  /**
   * Set for controls that are groups (Segmented, RadioCardGroup): the label
   * becomes a plain element that the group references with
   * `aria-labelledby={useField().labelId}` (done for you by the kit's group
   * controls) instead of a `<label for>`. For a custom list of checkboxes,
   * wrap them in `<div role="group" aria-labelledby={field.labelId}>`.
   */
  group?: boolean;
  /** Element at the end of the label row (InfoPopover, counter, live value). */
  labelAside?: ReactNode;
  /** Force the control id (defaults to a generated one). */
  id?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Label + control + hint + error, wired with `useId`. Controls from this kit
 * pick the ids up automatically; for a custom control call `useField()`.
 *
 * @example
 * <Field label="Niche" hint="Ex. : finance perso pour jeunes actifs" error={error}>
 *   <Input value={niche} onChange={(e) => setNiche(e.target.value)} />
 * </Field>
 */
export function Field({
  label,
  hint,
  error,
  required = false,
  optional = false,
  disabled = false,
  group = false,
  labelAside,
  id,
  className,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? `${generated}-control`;
  const labelId = `${generated}-label`;
  const hintId = hint ? `${generated}-hint` : undefined;
  const errorId = error ? `${generated}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const value: FieldContextValue = {
    id: controlId,
    labelId,
    describedBy,
    invalid: Boolean(error),
    required,
    disabled,
  };

  const labelContent = (
    <>
      {label}
      {required ? (
        <span aria-hidden className="ml-0.5 text-danger-ink">
          *
        </span>
      ) : null}
      {optional ? <span className="ml-1 font-normal text-faint">(facultatif)</span> : null}
    </>
  );
  const labelClass = cn("text-sm font-medium text-ink", disabled && "opacity-60");

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-1.5", className)}>
        <div className="flex min-h-5 items-center justify-between gap-2">
          {group ? (
            <span id={labelId} className={labelClass}>
              {labelContent}
            </span>
          ) : (
            <label id={labelId} htmlFor={controlId} className={labelClass}>
              {labelContent}
            </label>
          )}
          {labelAside ? <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted">{labelAside}</div> : null}
        </div>
        {children}
        {hint ? (
          <p id={hintId} className="text-xs leading-relaxed text-muted">
            {hint}
          </p>
        ) : null}
        {error ? (
          <p id={errorId} role="alert" className="text-xs font-medium leading-relaxed text-danger-ink">
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
