"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  /** What will happen, and whether it can be undone. */
  description?: ReactNode;
  /** Label of the confirm button ("Supprimer", "Tout effacer"). */
  confirmLabel: string;
  cancelLabel?: string;
  /** "danger" (default) for destructive actions. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  /** Called on Cancel, Escape and a click on the backdrop. Must be idempotent. */
  onCancel: () => void;
}

/**
 * Modal confirmation on the native `<dialog>` (`showModal`): focus trap,
 * inert page, Escape and top-layer rendering come from the browser. Focus
 * starts on "Annuler" so Enter never destroys anything by accident; the
 * browser returns focus to the opener when it closes.
 *
 * @example
 * <ConfirmDialog open={pending !== null} title="Supprimer ce script ?" confirmLabel="Supprimer"
 *   onConfirm={remove} onCancel={() => setPending(null)} />
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuler",
  tone = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape: keep React in charge of the open state.
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      // Closed by the browser anyway (e.g. repeated Escape): resync.
      onClose={onCancel}
      onClick={(event) => {
        // The inner panel covers the whole box: only the backdrop targets the dialog itself.
        if (event.target === event.currentTarget) onCancel();
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] max-w-none overflow-visible rounded-2xl border border-line bg-surface p-0 text-ink shadow-pop backdrop:bg-black/45 backdrop:backdrop-blur-[2px] open:animate-pop-in"
    >
      {open ? (
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden
              className={
                tone === "danger"
                  ? "flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger-ink"
                  : "flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink"
              }
            >
              <TriangleAlert className="size-5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <h2 id={titleId} className="text-base font-semibold leading-snug text-ink">
                {title}
              </h2>
              {description ? (
                <div id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted">
                  {description}
                </div>
              ) : null}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
