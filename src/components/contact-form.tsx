"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { contactSchema, subjectLabels } from "@/lib/contact-schema";
import { site } from "@/lib/site";
import { Button } from "@/components/ui/button";

type Status = "idle" | "sending" | "sent" | "error";

const fieldClass =
  "w-full rounded-2xl border border-line bg-white px-4 py-3 text-sm text-ink-800 " +
  "placeholder:text-ink-400/70 transition focus:border-ink-800 focus:outline-none " +
  "focus:ring-2 focus:ring-sky-300";

function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm text-ink-800">
        {label}
        {required ? (
          <span aria-hidden className="ml-1 text-blush-400">
            *
          </span>
        ) : (
          <span className="ml-2 text-xs text-ink-400">
            (facultatif)
          </span>
        )}
      </label>
      {children}
      {hint && !error ? (
        <p className="text-xs text-ink-400">{hint}</p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ContactForm() {
  const uid = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const id = (name: string) => `${uid}-${name}`;
  const describedBy = (name: string) =>
    errors[name] ? `${id(name)}-error` : undefined;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const raw = Object.fromEntries(new FormData(form));

    const candidate = {
      ...raw,
      // Checkboxes are absent from FormData when unchecked.
      consent: raw.consent === "on",
    };

    const parsed = contactSchema.safeParse(candidate);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        next[field] ??= issue.message;
      }
      setErrors(next);
      setFormError("Vérifiez les champs signalés ci-dessous.");
      setStatus("error");
      // Send focus to the first field the user has to fix.
      form.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus();
      return;
    }

    setErrors({});
    setFormError(null);
    setStatus("sending");

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = (await response.json()) as {
        ok: boolean;
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok || !result.ok) {
        setErrors(result.fields ?? {});
        setFormError(
          result.error ??
            `L'envoi a échoué. Écrivez-nous directement à ${site.email}.`,
        );
        setStatus("error");
        return;
      }

      form.reset();
      setStatus("sent");
    } catch {
      setFormError(
        `Connexion impossible. Réessayez ou écrivez-nous à ${site.email}.`,
      );
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <div
        role="status"
        className="rounded-4xl border border-line bg-sky-100 p-10 text-center"
      >
        <span
          aria-hidden
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ink-800"
        >
          <svg viewBox="0 0 16 16" className="h-6 w-6" fill="none">
            <path
              d="M3.5 8.5 6.5 11.5 12.5 5"
              stroke="#fff"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <h3 className="mt-5 text-xl">
          Message bien reçu.
        </h3>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-400">
          Nous revenons vers vous sous 24 h ouvrées avec un créneau d&apos;audit
          et deux premières pistes d&apos;automatisation adaptées à votre
          activité.
        </p>
        <Button
          type="button"
          variant="white"
          className="mt-7"
          onClick={() => setStatus("idle")}
        >
          Envoyer une autre demande
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="rounded-4xl border border-line bg-sky-50 p-6 sm:p-8"
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom et prénom" htmlFor={id("name")} error={errors.name} required>
          <input
            id={id("name")}
            name="name"
            type="text"
            autoComplete="name"
            required
            placeholder="Camille Dubois"
            className={cn(fieldClass, errors.name && "border-red-500")}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy("name")}
          />
        </Field>

        <Field
          label="E-mail professionnel"
          htmlFor={id("email")}
          error={errors.email}
          required
        >
          <input
            id={id("email")}
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="camille@entreprise.fr"
            className={cn(fieldClass, errors.email && "border-red-500")}
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy("email")}
          />
        </Field>

        <Field label="Entreprise" htmlFor={id("company")} error={errors.company}>
          <input
            id={id("company")}
            name="company"
            type="text"
            autoComplete="organization"
            placeholder="Nom de votre société"
            className={cn(fieldClass, errors.company && "border-red-500")}
            aria-invalid={Boolean(errors.company)}
            aria-describedby={describedBy("company")}
          />
        </Field>

        <Field label="Téléphone" htmlFor={id("phone")} error={errors.phone}>
          <input
            id={id("phone")}
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="06 12 34 56 78"
            className={cn(fieldClass, errors.phone && "border-red-500")}
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy("phone")}
          />
        </Field>

        <div className="sm:col-span-2">
          <Field label="Votre demande" htmlFor={id("subject")} error={errors.subject} required>
            <select
              id={id("subject")}
              name="subject"
              defaultValue="audit"
              required
              className={cn(fieldClass, errors.subject && "border-red-500")}
              aria-invalid={Boolean(errors.subject)}
              aria-describedby={describedBy("subject")}
            >
              {Object.entries(subjectLabels).map(([value, label]) => (
                <option key={value} value={value} className="bg-white">
                  {label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="sm:col-span-2">
          <Field
            label="Décrivez votre besoin"
            htmlFor={id("message")}
            error={errors.message}
            hint="Quel process vous coûte le plus de temps aujourd'hui ? Quels outils utilisez-vous ?"
            required
          >
            <textarea
              id={id("message")}
              name="message"
              rows={6}
              required
              minLength={20}
              placeholder="Nous traitons environ 200 demandes de devis par mois, toutes saisies à la main dans notre CRM…"
              className={cn(fieldClass, "resize-y", errors.message && "border-red-500")}
              aria-invalid={Boolean(errors.message)}
              aria-describedby={describedBy("message")}
            />
          </Field>
        </div>
      </div>

      {/* Honeypot — hidden from humans and from assistive technology. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={id("website")}>Ne remplissez pas ce champ</label>
        <input id={id("website")} name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="mt-6 flex items-start gap-3">
        <input
          id={id("consent")}
          name="consent"
          type="checkbox"
          required
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-ink-400 bg-white accent-ink-800"
          aria-invalid={Boolean(errors.consent)}
          aria-describedby={describedBy("consent")}
        />
        <label htmlFor={id("consent")} className="text-sm leading-relaxed text-ink-400">
          J&apos;accepte que mes données soient utilisées pour répondre à ma
          demande, conformément à la{" "}
          <a
            href="/politique-de-confidentialite"
            className="text-ink-800 underline underline-offset-4 hover:text-sky-600"
          >
            politique de confidentialité
          </a>
          .
          {errors.consent ? (
            <span id={`${id("consent")}-error`} className="mt-1 block text-xs text-red-600">
              {errors.consent}
            </span>
          ) : null}
        </label>
      </div>

      {/* Live region so screen readers announce the outcome of a submission. */}
      <div aria-live="polite" className="min-h-6">
        {formError ? (
          <p className="mt-5 rounded-xl border border-red-400/30 bg-red-500/8 px-4 py-3 text-sm text-red-300">
            {formError}
          </p>
        ) : null}
      </div>

      <Button
        type="submit"
        size="lg"
        disabled={status === "sending"}
        arrow={status !== "sending"}
        className="mt-5"
      >
        {status === "sending" ? "Envoi en cours…" : "Envoyer ma demande"}
      </Button>

      <p className="mt-4 text-xs text-ink-400">
        Réponse sous 24 h ouvrées. Vos données ne sont ni revendues ni utilisées
        pour entraîner un modèle.
      </p>
    </form>
  );
}
