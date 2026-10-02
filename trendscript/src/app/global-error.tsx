"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Last-resort boundary (the root layout itself failed): renders its own
 * document, without the header or next/font (system font stack).
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="fr">
      <body className="flex min-h-screen items-center justify-center px-4">
        <title>Erreur · TrendScript</title>
        <main className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-semibold text-accent-ink">TrendScript</p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-ink">L&apos;application n&apos;a pas pu démarrer</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Une erreur inattendue est survenue. Réessayez ; si le problème persiste, rechargez la page.
          </p>
          {error.digest ? <p className="mt-3 text-xs text-faint">Référence : {error.digest}</p> : null}
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => retry()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink transition-colors duration-150 hover:bg-surface-2"
            >
              Recharger la page
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
