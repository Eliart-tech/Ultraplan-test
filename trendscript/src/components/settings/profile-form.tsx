"use client";

import { CircleCheck, RotateCcw, Save, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardFooter } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { MeterBar } from "@/components/ui/meter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/cn";
import { EMPTY_PROFILE, saveProfile, useProfile } from "@/lib/client/storage";
import type { CreatorProfile } from "@/lib/types";
import { PROFILE_FIELDS } from "./profile-fields";

type SaveStatus = "idle" | "saved" | "cleared" | "error";

function trimProfile(profile: CreatorProfile): CreatorProfile {
  const clean = { ...profile };
  for (const field of PROFILE_FIELDS) clean[field.key] = profile[field.key].trim();
  return clean;
}

/**
 * "Profil créateur" form bound to the saved profile (localStorage). The
 * editor mounts only after hydration, so its draft starts from the real
 * saved values without a setState-in-effect sync.
 */
export function ProfileForm() {
  const { profile, hydrated } = useProfile();
  if (!hydrated) return <ProfileFormSkeleton />;
  return <ProfileEditor saved={profile} />;
}

function ProfileEditor({ saved }: { saved: CreatorProfile }) {
  const [draft, setDraft] = useState<CreatorProfile>(saved);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const dirty = PROFILE_FIELDS.some((field) => draft[field.key] !== saved[field.key]);
  const filled = PROFILE_FIELDS.filter((field) => draft[field.key].trim() !== "").length;

  // Leaving the page with unsaved edits: let the browser ask first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(key: keyof CreatorProfile, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    if (status === "saved" || status === "error") setStatus("idle");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const clean = trimProfile(draft);
    if (saveProfile(clean)) {
      setDraft(clean);
      setStatus("saved");
    } else {
      setStatus("error");
    }
  }

  return (
    <Card as="div">
      <form onSubmit={handleSubmit} noValidate aria-label="Profil créateur">
        <CardBody className="flex flex-col gap-6">
          <MeterBar
            label="Profil renseigné"
            value={filled}
            max={PROFILE_FIELDS.length}
            valueLabel={`${filled} champ${filled > 1 ? "s" : ""} sur ${PROFILE_FIELDS.length}`}
            tone={filled === PROFILE_FIELDS.length ? "success" : "accent"}
            className="max-w-sm"
          />

          <div className="grid gap-x-5 gap-y-5 md:grid-cols-2">
            {PROFILE_FIELDS.map((field) => {
              const value = draft[field.key];
              const nearLimit = value.length > field.maxLength * 0.8;
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={field.hint}
                  className={cn(field.wide && "md:col-span-2")}
                  labelAside={
                    field.rows ? (
                      <span className={cn("tabular-nums", nearLimit ? "text-warning-ink" : "text-faint")} aria-hidden>
                        {value.length}/{field.maxLength}
                      </span>
                    ) : null
                  }
                >
                  {field.rows ? (
                    <Textarea
                      name={field.key}
                      value={value}
                      onChange={(event) => update(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      rows={field.rows}
                      autoResize
                    />
                  ) : (
                    <Input
                      name={field.key}
                      value={value}
                      onChange={(event) => update(field.key, event.target.value)}
                      placeholder={field.placeholder}
                      maxLength={field.maxLength}
                      autoComplete={field.autoComplete}
                    />
                  )}
                </Field>
              );
            })}
          </div>

          {status === "error" ? (
            <Alert tone="danger" title="Profil non enregistré" onDismiss={() => setStatus("idle")}>
              Le navigateur a refusé l&apos;enregistrement : le stockage local est peut-être désactivé (navigation
              privée) ou plein. Vos saisies sont toujours dans le formulaire.
            </Alert>
          ) : null}
        </CardBody>

        <CardFooter className="justify-between gap-3">
          <StatusLine status={status} dirty={dirty} filled={filled} />
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {dirty ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setDraft(saved);
                  setStatus("idle");
                }}
                leftIcon={<Undo2 aria-hidden className="size-4" />}
              >
                Annuler les modifications
              </Button>
            ) : null}
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(EMPTY_PROFILE);
                setStatus("cleared");
              }}
              disabled={filled === 0}
              leftIcon={<RotateCcw aria-hidden className="size-4" />}
              title="Vide tous les champs ; rien n'est effacé avant « Enregistrer »"
            >
              Réinitialiser
            </Button>
            <Button type="submit" disabled={!dirty} leftIcon={<Save aria-hidden className="size-4" />}>
              Enregistrer
            </Button>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

/** Polite live message under the form: saved, unsaved, cleared, empty. */
function StatusLine({ status, dirty, filled }: { status: SaveStatus; dirty: boolean; filled: number }) {
  let tone: "success" | "warning" | "muted" = "muted";
  let text: string;
  if (status === "saved" && !dirty) {
    tone = "success";
    text =
      filled === 0
        ? "Profil effacé de ce navigateur."
        : "Profil enregistré : il sera utilisé pour vos prochains scripts.";
  } else if (status === "cleared" && dirty) {
    tone = "warning";
    text = "Champs vidés. « Enregistrer » efface le profil ; « Annuler les modifications » le restaure.";
  } else if (dirty) {
    tone = "warning";
    text = "Modifications non enregistrées.";
  } else if (filled === 0) {
    text = "Profil vide : les scripts visent un créateur francophone généraliste qui tutoie son audience.";
  } else {
    text = "Profil à jour, enregistré dans ce navigateur.";
  }
  return (
    <p
      role="status"
      className={cn(
        "flex min-w-0 flex-1 basis-64 items-center gap-2 text-[0.8125rem]",
        tone === "success" ? "text-success-ink" : tone === "warning" ? "text-warning-ink" : "text-muted",
      )}
    >
      {tone === "success" ? (
        <CircleCheck aria-hidden className="size-4 shrink-0" />
      ) : (
        <span
          aria-hidden
          className={cn("size-2 shrink-0 rounded-full", tone === "warning" ? "bg-warning" : "bg-faint")}
        />
      )}
      <span>{text}</span>
    </p>
  );
}

function ProfileFormSkeleton() {
  return (
    <Card as="div" aria-busy="true">
      <span role="status" className="sr-only">
        Chargement du profil…
      </span>
      <CardBody className="flex flex-col gap-6">
        <Skeleton className="h-6 w-64" />
        <div className="grid gap-5 md:grid-cols-2">
          {PROFILE_FIELDS.map((field) => (
            <div key={field.key} className={cn("flex flex-col gap-2", field.wide && "md:col-span-2")}>
              <Skeleton className="h-4 w-32" />
              <Skeleton className={cn("w-full rounded-xl", field.rows ? "h-16" : "h-10")} />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
