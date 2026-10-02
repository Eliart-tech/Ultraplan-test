"use client";

import { Eye, EyeOff, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, IconButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ApiError, errorMessage, isAbortError, login } from "@/lib/client/api";
import { safeNextPath } from "./safe-next";

type LoginState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "redirecting" }
  /** 401: shown under the field. */
  | { kind: "wrong-password"; message: string }
  /** 429, network, server: shown as an alert. */
  | { kind: "failed"; message: string; throttled: boolean };

/**
 * Password form of /login. Reads `?next=` (must render inside <Suspense>),
 * POSTs /api/auth/login, then replaces the URL with the sanitised `next`
 * (same-origin path only) so "back" doesn't return to the login page.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  return <LoginFormView next={next} />;
}

/**
 * Placeholder rendered by the Suspense boundary (prerendered HTML) until
 * the search params are known: same layout, inert.
 */
export function LoginFormFallback() {
  return <LoginFormView next="/" disabled />;
}

function LoginFormView({ next, disabled = false }: { next: string; disabled?: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<LoginState>({ kind: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = state.kind === "submitting" || state.kind === "redirecting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    // Never let the browser submit natively: the password must not end up in a URL.
    event.preventDefault();
    if (disabled || busy) return;
    if (!password) {
      setState({ kind: "wrong-password", message: "Saisissez le mot de passe." });
      inputRef.current?.focus();
      return;
    }
    setState({ kind: "submitting" });
    try {
      await login(password);
      setState({ kind: "redirecting" });
      router.replace(next);
    } catch (error) {
      if (isAbortError(error)) {
        setState({ kind: "idle" });
        return;
      }
      if (error instanceof ApiError && error.status === 401) {
        setState({ kind: "wrong-password", message: error.message || "Mot de passe incorrect." });
        // Ready to retype: select what was typed.
        requestAnimationFrame(() => inputRef.current?.select());
        return;
      }
      const throttled = error instanceof ApiError && error.status === 429;
      setState({ kind: "failed", message: errorMessage(error), throttled });
    }
  }

  const fieldError = state.kind === "wrong-password" ? state.message : undefined;

  return (
    <form method="post" onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label="Connexion">
      {state.kind === "failed" ? (
        <Alert tone="danger" title={state.throttled ? "Trop de tentatives" : "Connexion impossible"} size="sm">
          {state.message}
        </Alert>
      ) : null}

      <Field label="Mot de passe" error={fieldError} required>
        <Input
          ref={inputRef}
          name="password"
          type={visible ? "text" : "password"}
          size="lg"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            if (state.kind === "wrong-password") setState({ kind: "idle" });
          }}
          autoComplete="current-password"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          // The only field of the page: focusing it is what the user came for.
          autoFocus
          // readOnly rather than disabled while sending: the field keeps the focus.
          readOnly={busy}
          disabled={disabled}
          rightSlot={
            <IconButton
              label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={visible}
              size="sm"
              icon={visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
              onClick={() => setVisible((value) => !value)}
              disabled={disabled}
            />
          }
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={disabled}
        loading={busy}
        loadingText={state.kind === "redirecting" ? "Connecté, redirection…" : "Connexion…"}
        leftIcon={<LogIn aria-hidden className="size-4" />}
      >
        Se connecter
      </Button>

      <p role="status" className="sr-only">
        {state.kind === "redirecting" ? "Connexion réussie, ouverture de l'application." : ""}
      </p>
    </form>
  );
}
