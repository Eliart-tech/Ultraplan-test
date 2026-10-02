import { ExternalLink, Link2, SearchCheck } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { cn } from "@/lib/cn";
import type { FactToVerify, RelatedLink, ResearchBrief } from "@/lib/types";
import { hostnameOf, safeHref } from "./studio-utils";

const CONFIDENCE: Record<FactToVerify["confidence"], { label: string; tone: BadgeTone }> = {
  haute: { label: "Confiance haute", tone: "success" },
  moyenne: { label: "Confiance moyenne", tone: "neutral" },
  faible: { label: "Confiance faible", tone: "warning" },
};

function dedupeLinks(links: RelatedLink[]): RelatedLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    const href = safeHref(link.url);
    if (!href || seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

export interface FactsPanelProps {
  facts: FactToVerify[];
  sources: RelatedLink[];
  research?: ResearchBrief;
}

/**
 * Facts to check before publishing (low confidence highlighted), the
 * sources cited by the script and the web research notes.
 */
export function FactsPanel({ facts, sources, research }: FactsPanelProps) {
  const links = dedupeLinks([...sources, ...(research?.sources ?? [])]);
  const weak = facts.filter((fact) => fact.confidence === "faible").length;
  const ordered = [...facts].sort(
    (a, b) => ["faible", "moyenne", "haute"].indexOf(a.confidence) - ["faible", "moyenne", "haute"].indexOf(b.confidence),
  );

  return (
    <div className="space-y-6">
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-ink">Faits à vérifier ({facts.length})</h3>
          {weak > 0 ? (
            <span className="text-xs font-medium text-warning-ink">
              {weak} à confiance faible : à vérifier en priorité
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Vérifiez chaque chiffre et chaque date avant de publier : Claude peut se tromper, les sources font foi.
        </p>
        {ordered.length ? (
          <ul className="mt-3 space-y-2">
            {ordered.map((fact, index) => {
              const href = safeHref(fact.sourceUrl);
              const confidence = CONFIDENCE[fact.confidence] ?? CONFIDENCE.moyenne;
              return (
                <li
                  key={index}
                  className={cn(
                    "rounded-xl border p-3.5",
                    fact.confidence === "faible" ? "border-warning/45 bg-warning-soft" : "border-line bg-surface",
                  )}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <p className="text-sm leading-relaxed text-ink">{fact.claim}</p>
                    <Badge size="sm" tone={confidence.tone} variant={fact.confidence === "faible" ? "solid" : "soft"} className="self-start">
                      {confidence.label}
                    </Badge>
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex max-w-full items-center gap-1.5 text-xs font-medium text-accent-ink underline-offset-2 hover:underline"
                    >
                      <Link2 aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{hostnameOf(href)}</span>
                      <span className="sr-only"> (source, nouvel onglet)</span>
                    </a>
                  ) : (
                    <p className="mt-2 text-xs font-medium text-warning-ink">
                      {fact.sourceUrl ? `Source : ${fact.sourceUrl}` : "Sans source : à vérifier vous-même."}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">Aucun fait signalé comme à vérifier.</p>
        )}
      </section>

      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <SearchCheck aria-hidden className="size-4 text-accent" />
          Sources de la recherche ({links.length})
        </h3>
        {links.length ? (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
            {links.map((link) => (
              <li key={link.url} className="px-4 py-2.5">
                <a
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start justify-between gap-3 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block font-medium leading-snug text-ink underline-offset-2 group-hover:text-accent-ink group-hover:underline">
                      {link.title || hostnameOf(link.url)}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {link.source ? `${link.source} · ` : ""}
                      {hostnameOf(link.url)}
                    </span>
                  </span>
                  <ExternalLink aria-hidden className="mt-0.5 size-3.5 shrink-0 text-faint group-hover:text-accent-ink" />
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Aucune source externe : activez la recherche web dans les réglages pour des faits sourcés et datés.
          </p>
        )}

        {research?.facts.trim() ? (
          <Disclosure summary="Voir la note de recherche" openSummary="Masquer la note de recherche" className="mt-4">
            <div className="whitespace-pre-wrap rounded-xl border border-line bg-surface-2/60 p-4 text-sm leading-relaxed text-ink">
              {research.facts.trim()}
            </div>
          </Disclosure>
        ) : null}
      </section>
    </div>
  );
}
