"use client";

import { ArrowLeft, ArrowRight, Check, PenLine, Quote } from "lucide-react";
import Link from "next/link";
import { useId, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useServerStatus } from "@/lib/client/use-server-status";
import { cn } from "@/lib/cn";
import { ANGLE_TYPE_LABELS } from "@/lib/script/levels";
import type { Angle } from "@/lib/types";
import { useStudio, type CustomAngleDraft } from "./studio-store";
import { makeId } from "./studio-utils";
import { TopicRecap } from "./topic-recap";

const CUSTOM = "custom";
const MIN_TITLE = 3;

/** Radio card look shared by the angle options (native radio underneath). */
const optionClasses = (checked: boolean) =>
  cn(
    "relative flex h-full cursor-pointer flex-col rounded-2xl border bg-surface p-5 text-left shadow-card",
    "transition-[border-color,box-shadow,transform] duration-200 ease-out",
    "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus",
    checked
      ? "border-accent ring-1 ring-accent"
      : "border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-pop motion-reduce:hover:translate-y-0",
  );

function RadioMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-150",
        checked ? "border-accent bg-accent text-accent-fg" : "border-line-strong bg-surface",
      )}
    >
      {checked ? <Check className="size-3" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * Step 3 — Angle: Claude's angle proposals as radio cards, plus "Mon propre
 * angle". In basic mode (no AI angles) only the custom form is offered.
 */
export function AngleStep() {
  const { state, dispatch } = useStudio();
  const { draft } = state;
  const { status } = useServerStatus();
  const name = useId();
  const topic = draft.topic;
  if (!topic) return null;

  const angles = topic.angles;
  const basic = angles.length === 0;
  const committed = draft.angle;
  const choice =
    draft.angleChoice ??
    (committed ? (committed.type === "custom" ? CUSTOM : committed.id) : basic ? CUSTOM : null);
  const custom = draft.customAngle;
  const customValid = custom.title.trim().length >= MIN_TITLE;
  const selectedAngle = angles.find((angle) => angle.id === choice);
  const canContinue = choice === CUSTOM ? customValid : Boolean(selectedAngle);

  function choose(value: string) {
    dispatch({ type: "chooseAngle", choice: value });
  }

  function handleContinue(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canContinue) return;
    let angle: Angle;
    if (choice === CUSTOM) {
      const sameAsCommitted =
        committed?.type === "custom" &&
        committed.title.trim() === custom.title.trim() &&
        committed.pitch.trim() === custom.pitch.trim();
      angle = sameAsCommitted
        ? committed
        : {
            id: makeId("custom"),
            type: "custom",
            title: custom.title.trim().slice(0, 200),
            pitch: custom.pitch.trim().slice(0, 1000),
            hook: "",
            whyItWorks: "",
          };
    } else if (selectedAngle) {
      angle = selectedAngle;
    } else {
      return;
    }
    dispatch({ type: "commitAngle", angle });
  }

  return (
    <form onSubmit={handleContinue} className="space-y-6" aria-label="Choix de l'angle">
      <TopicRecap
        topic={topic}
        onChangeTopic={draft.analysis ? () => dispatch({ type: "goTo", step: "sujets" }) : undefined}
      />

      {basic ? (
        <Alert tone="info" title="Pas d'angles proposés pour ce sujet">
          {status?.ai.configured === false ? (
            <>
              Claude propose trois angles par sujet (pédagogique, analyse, debunk…) quand{" "}
              <code className="rounded bg-surface px-1 font-mono text-xs">ANTHROPIC_API_KEY</code> est configurée —{" "}
              <Link href="/reglages" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                voir Réglages
              </Link>
              . En attendant, décrivez votre propre angle ci-dessous.
            </>
          ) : (
            <>
              Cette analyse a été faite sans synthèse IA, donc sans angles proposés. Décrivez votre angle ci-dessous, ou
              relancez l&apos;analyse pour que Claude en propose.
            </>
          )}
        </Alert>
      ) : null}

      <fieldset>
        <legend className="mb-3 text-sm font-semibold text-ink">
          {basic ? "Votre angle" : "Angles proposés par Claude"}
        </legend>
        <div className={cn("grid gap-4", !basic && "lg:grid-cols-3")}>
          {angles.map((angle) => (
            <AngleOption
              key={angle.id}
              angle={angle}
              name={name}
              checked={choice === angle.id}
              onSelect={() => choose(angle.id)}
            />
          ))}
        </div>

        <div className={cn(!basic && "mt-4")}>
          <CustomAngleOption
            name={name}
            checked={choice === CUSTOM}
            onSelect={() => choose(CUSTOM)}
            value={custom}
            onChange={(patch) => dispatch({ type: "updateCustomAngle", patch })}
            hideRadio={basic}
          />
        </div>
      </fieldset>

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
        {draft.analysis ? (
          <Button
            variant="ghost"
            leftIcon={<ArrowLeft aria-hidden className="size-4" />}
            onClick={() => dispatch({ type: "goTo", step: "sujets" })}
          >
            Retour aux sujets
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button type="submit" size="lg" disabled={!canContinue} rightIcon={<ArrowRight aria-hidden className="size-5" />}>
            Écrire le script avec cet angle
          </Button>
          {!canContinue ? (
            <p className="text-xs text-muted sm:text-right">
              {choice === CUSTOM ? "Donnez un titre à votre angle (3 caractères minimum)." : "Choisissez un angle pour continuer."}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}

interface AngleOptionProps {
  angle: Angle;
  name: string;
  checked: boolean;
  onSelect: () => void;
}

function AngleOption({ angle, name, checked, onSelect }: AngleOptionProps) {
  const id = useId();
  return (
    <label className={optionClasses(checked)}>
      <input
        type="radio"
        name={name}
        value={angle.id}
        checked={checked}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-pitch`}
        className="sr-only"
      />
      <span className="flex items-center justify-between gap-3">
        <Badge size="sm" tone={checked ? "accent" : "neutral"}>
          {ANGLE_TYPE_LABELS[angle.type] ?? angle.type}
        </Badge>
        <RadioMark checked={checked} />
      </span>
      <span id={`${id}-title`} className="mt-3 block text-base font-semibold leading-snug text-ink">
        {angle.title}
      </span>
      <span id={`${id}-pitch`} className="mt-1.5 block text-sm leading-relaxed text-muted">
        {angle.pitch}
      </span>
      {angle.hook ? (
        <span className="mt-4 flex gap-2 rounded-xl bg-surface-2 px-3.5 py-3 text-sm font-medium leading-relaxed text-ink">
          <Quote aria-hidden className="mt-0.5 size-4 shrink-0 text-accent" />
          <span>
            <span className="sr-only">Exemple d&apos;accroche : </span>« {angle.hook} »
          </span>
        </span>
      ) : null}
      {angle.whyItWorks ? (
        <span className="mt-3 block text-xs leading-relaxed text-muted">
          <span className="font-semibold text-ink">Pourquoi ça marche : </span>
          {angle.whyItWorks}
        </span>
      ) : null}
    </label>
  );
}

interface CustomAngleOptionProps {
  name: string;
  checked: boolean;
  onSelect: () => void;
  value: CustomAngleDraft;
  onChange: (patch: Partial<CustomAngleDraft>) => void;
  /** Basic mode: the custom form is the only option, no radio needed. */
  hideRadio: boolean;
}

function CustomAngleOption({ name, checked, onSelect, value, onChange, hideRadio }: CustomAngleOptionProps) {
  const id = useId();
  const form = (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Field label="Titre de l'angle" required hint="Ce que promet la vidéo, en quelques mots.">
        <Input
          value={value.title}
          maxLength={200}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Ex. : 3 erreurs que tout le monde fait avec…"
          autoComplete="off"
        />
      </Field>
      <Field
        label="Pitch"
        optional
        hint="1 à 2 phrases : ce que dit la vidéo et pourquoi votre audience s'y intéresse."
      >
        <Textarea
          value={value.pitch}
          maxLength={1000}
          rows={2}
          autoResize
          onChange={(event) => onChange({ pitch: event.target.value })}
          placeholder="Ex. : j'explique ce qui change concrètement pour un étudiant, avec un exemple chiffré."
        />
      </Field>
    </div>
  );

  if (hideRadio) {
    return <div className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">{form}</div>;
  }

  return (
    <div className={cn("rounded-2xl border bg-surface shadow-card transition-[border-color] duration-200", checked ? "border-accent ring-1 ring-accent" : "border-line")}>
      <label className="flex cursor-pointer items-center gap-3 rounded-2xl p-5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus">
        <input
          type="radio"
          name={name}
          value={CUSTOM}
          checked={checked}
          onChange={onSelect}
          aria-labelledby={`${id}-title`}
          aria-describedby={`${id}-description`}
          className="sr-only"
        />
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
          <PenLine aria-hidden className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span id={`${id}-title`} className="block text-sm font-semibold text-ink">
            Mon propre angle
          </span>
          <span id={`${id}-description`} className="block text-xs leading-relaxed text-muted">
            Vous avez déjà une idée ? Décrivez-la : Claude écrit le script à partir de votre point de vue.
          </span>
        </span>
        <RadioMark checked={checked} />
      </label>
      {checked ? <div className="border-t border-line px-5 pb-5 pt-4 animate-fade-in">{form}</div> : null}
    </div>
  );
}
