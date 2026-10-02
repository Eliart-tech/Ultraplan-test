import type { ServerStatus } from "@/lib/client/api";

/**
 * `.env.local` lines for everything the server is missing, grouped by
 * feature, names only (`NAME=`), each variable once — for the "Copier les
 * variables manquantes" button. Empty string when nothing is missing.
 */
export function missingEnvTemplate(status: ServerStatus): string {
  const seen = new Set<string>();
  const groups: string[][] = [];

  const add = (title: string, names: string[]) => {
    const fresh = names.filter((name) => !seen.has(name));
    if (fresh.length === 0) return;
    fresh.forEach((name) => seen.add(name));
    groups.push([`# ${title}`, ...fresh.map((name) => `${name}=`)]);
  };

  if (!status.ai.configured) add("Claude (Anthropic) : analyse IA et écriture des scripts", ["ANTHROPIC_API_KEY"]);
  for (const source of status.sources) {
    if (!source.configured) add(source.label, source.envVars);
  }
  if (!status.auth.enabled)
    add("Protection par mot de passe (indispensable une fois en ligne)", ["APP_PASSWORD", "AUTH_SECRET"]);

  if (groups.length === 0) return "";
  const header = "# TrendScript : variables à renseigner dans .env.local (en local) ou chez l'hébergeur";
  return `${[header, ...groups.map((lines) => lines.join("\n"))].join("\n\n")}\n`;
}
