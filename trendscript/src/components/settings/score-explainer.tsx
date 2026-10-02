import { Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { SCORE_EXPLANATION } from "@/lib/analysis/scoring";
import { parseScoreItems, parseScoreWeights, type ScoreWeight } from "./score-explanation";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function WeightCell({ value }: { value: number | undefined }) {
  if (value === undefined) return <td className="px-3 py-2.5 text-right text-muted">—</td>;
  return (
    <td className="px-3 py-2.5">
      <div className="flex items-center justify-end gap-2.5">
        <span aria-hidden className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-3 sm:block">
          <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, value * 2)}%` }} />
        </span>
        <span className="w-10 text-right font-semibold tabular-nums text-ink">{value} %</span>
      </div>
    </td>
  );
}

function WeightsTable({ weights }: { weights: ScoreWeight[] }) {
  const hasAlt = weights.some((weight) => weight.withoutNiche !== undefined);
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[18rem] border-collapse text-sm">
        <caption className="sr-only">Pondération du score total selon que l&apos;analyse a une niche ou non</caption>
        <thead>
          <tr className="border-b border-line bg-surface-2 text-left text-xs font-medium text-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              Composante
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Avec niche
            </th>
            {hasAlt ? (
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Sans niche
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {weights.map((weight) => (
            <tr key={weight.label} className="border-b border-line last:border-b-0">
              <th scope="row" className="px-3 py-2.5 text-left font-medium text-ink">
                {capitalize(weight.label)}
              </th>
              <WeightCell value={weight.withNiche} />
              {hasAlt ? <WeightCell value={weight.withoutNiche} /> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * "Comment le score est calculé": the scoring module's own explanation
 * (`SCORE_EXPLANATION`) as readable cards, the weights as a table, and how
 * to read the score ring.
 */
export function ScoreExplainer() {
  const items = parseScoreItems(SCORE_EXPLANATION);
  const totalItem = items.find((item) => item.label.toLowerCase() === "score total");
  const weights = totalItem ? parseScoreWeights(totalItem.text) : [];
  const [base, ...components] = items.filter((item) => item !== totalItem || weights.length === 0);

  return (
    <Card as="div" className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">
      {base ? (
        <div className="rounded-xl bg-accent-soft px-4 py-3.5 text-sm leading-relaxed text-ink">
          {base.label ? <p className="font-semibold">{base.label}</p> : null}
          <p className="mt-0.5 text-ink/80">{base.text}</p>
        </div>
      ) : null}

      {components.length ? (
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {components.map((item) => (
            <div key={item.label || item.text} className="border-l-2 border-line pl-3.5">
              {item.label ? <dt className="text-sm font-semibold text-ink">{item.label}</dt> : null}
              <dd className="mt-0.5 text-sm leading-relaxed text-muted">{item.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {weights.length ? (
        <div>
          <h3 className="text-sm font-semibold text-ink">Pondération du score total</h3>
          <p className="mt-0.5 mb-3 text-sm text-muted">
            Sans niche ni mots-clés, la pertinence ne peut pas être évaluée : son poids est redistribué.
          </p>
          <WeightsTable weights={weights} />
        </div>
      ) : null}

      <div className="flex flex-col gap-4 rounded-xl border border-line px-4 py-4 sm:flex-row sm:items-center">
        <div className="flex shrink-0 items-center gap-2" aria-hidden>
          <ScoreRing value={82} size={36} />
          <ScoreRing value={58} size={36} />
          <ScoreRing value={30} size={36} />
        </div>
        <p className="text-[0.8125rem] leading-relaxed text-muted">
          <span className="font-medium text-ink">Lire l&apos;anneau :</span> corail à partir de 70, violet de 45 à 69,
          gris en dessous. Les scores sont relatifs à une analyse : comparez les sujets d&apos;une même analyse entre
          eux, pas d&apos;une analyse à l&apos;autre.
        </p>
      </div>

      <p className="flex items-start gap-2 text-[0.8125rem] leading-relaxed text-muted">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-faint" />
        Tous les chiffres viennent des métriques réelles des sources ; seule la pertinence pour votre niche est estimée
        par Claude (ou par recouvrement de mots-clés en mode sans IA).
      </p>
    </Card>
  );
}
