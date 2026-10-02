/**
 * `@/lib/client/export` for the HTML edition: the real module, except
 * `downloadFile`. A blob link does nothing inside the claude.ai viewer, so
 * exports go through the `downloads` capability (the viewer confirms the
 * file), and fall back to the clipboard with a clear message.
 */

import { copyText } from "@/components/ui/copy-button";
import { getDownloads, type DownloadsNamespace } from "./capabilities";
import { pushNotice } from "./notices";

// Everything else is the app's own export code.
export * from "../../src/lib/client/export";

/** `undefined` while `use("downloads")` has not answered yet, `null` when absent. */
let downloads: DownloadsNamespace | null | undefined;
// `use()` is free: resolve it early so a click can usually act without waiting.
void getDownloads().then((value) => {
  downloads = value;
});

const DOWNLOAD_ERRORS: Record<string, string> = {
  rejected_extension: "ce type de fichier n'est pas accepté ici",
  extension_not_enabled: "ce format n'est pas disponible dans cette vue",
  too_large: "fichier trop volumineux",
  rate_limited: "une autre demande d'enregistrement est déjà ouverte",
};

function errorCode(error: unknown): string {
  return error && typeof error === "object" && typeof (error as { code?: unknown }).code === "string"
    ? (error as { code: string }).code
    : "unavailable";
}

async function copyInstead(name: string, content: string, why: string): Promise<void> {
  const ok = await copyText(content);
  pushNotice(
    ok ? "info" : "warning",
    ok
      ? `${why} : le contenu de « ${name} » a été copié dans le presse-papiers — collez-le dans un fichier ou une note.`
      : `${why}, et la copie dans le presse-papiers a échoué.`,
    9_000,
  );
}

/**
 * Offers `content` as a file. Call from a click handler. Same signature as
 * the app's version (fire-and-forget); the outcome (saved, copied, refused)
 * is reported by a toast in the polite live region.
 */
export function downloadFile(name: string, content: string, mime = "text/plain"): void {
  void mime; // the platform derives the type from the extension
  if (downloads === null) {
    // Clipboard right away, while the click's user activation is still fresh.
    void copyInstead(name, content, "Téléchargement indisponible dans cette vue");
    return;
  }
  // Not answered yet: wait for it (claude.ai's save confirmation needs no fresh click).
  const ready = downloads ? Promise.resolve(downloads) : getDownloads();
  void ready.then((namespace) => {
    if (!namespace) {
      void copyInstead(name, content, "Téléchargement indisponible dans cette vue");
      return;
    }
    namespace.save({ filename: name, data: content }).then(
      (result) => {
        if (result.status === "saved") pushNotice("success", `« ${name} » enregistré.`);
      },
      (error: unknown) => {
        const code = errorCode(error);
        if (code === "declined") {
          pushNotice("info", `Enregistrement de « ${name} » annulé.`, 4_000);
          return;
        }
        void copyInstead(name, content, `Enregistrement impossible (${DOWNLOAD_ERRORS[code] ?? "indisponible dans cette vue"})`);
      },
    );
  });
}
