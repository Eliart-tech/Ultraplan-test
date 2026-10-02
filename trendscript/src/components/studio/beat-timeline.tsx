import { cn } from "@/lib/cn";
import type { ScriptBeat } from "@/lib/types";

function timeRange(beat: ScriptBeat): string {
  return `${Math.round(beat.startSec)}–${Math.round(beat.endSec)} s`;
}

function ScreenText({ text }: { text: string }) {
  if (!text) return <span className="text-faint">—</span>;
  return (
    <span className="inline rounded bg-ink px-1.5 py-0.5 text-xs font-semibold leading-relaxed text-canvas [box-decoration-break:clone]">
      {text}
    </span>
  );
}

/** Proportional bar of the beats over the video duration (visual summary only). */
function BeatBar({ beats }: { beats: ScriptBeat[] }) {
  return (
    <div aria-hidden className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
      {beats.map((beat, index) => {
        const width = Math.max(0, beat.endSec - beat.startSec);
        return (
          <span
            key={index}
            title={`${timeRange(beat)} · ${beat.label}`}
            className={cn("h-full first:rounded-l-full last:rounded-r-full", index === 0 ? "bg-hot" : index % 2 ? "bg-accent" : "bg-accent/55")}
            style={{ flexGrow: width || 1, flexBasis: 0 }}
          />
        );
      })}
    </div>
  );
}

export interface BeatTimelineProps {
  beats: ScriptBeat[];
}

/**
 * Beat-by-beat plan: a table on desktop (Temps | Voix off | Texte à l'écran
 * | Visuel | Montage), stacked cards on phones. The first beat (the hook) is
 * highlighted.
 */
export function BeatTimeline({ beats }: BeatTimelineProps) {
  if (beats.length === 0) return <p className="text-sm text-muted">Aucun déroulé dans ce script.</p>;
  return (
    <div className="space-y-4">
      <BeatBar beats={beats} />

      <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
        <table className="w-full min-w-[44rem] border-collapse text-left text-sm">
          <caption className="sr-only">Déroulé seconde par seconde</caption>
          <thead className="bg-surface-2 text-xs font-semibold uppercase tracking-[0.04em] text-muted">
            <tr>
              <th scope="col" className="w-28 px-3.5 py-2.5">
                Temps
              </th>
              <th scope="col" className="px-3.5 py-2.5">
                Voix off
              </th>
              <th scope="col" className="w-44 px-3.5 py-2.5">
                Texte à l&apos;écran
              </th>
              <th scope="col" className="w-44 px-3.5 py-2.5">
                Visuel
              </th>
              <th scope="col" className="w-36 px-3.5 py-2.5">
                Montage
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {beats.map((beat, index) => (
              <tr key={index} className={cn("align-top", index === 0 && "bg-hot-soft/40")}>
                <th scope="row" className="px-3.5 py-3 font-normal">
                  <span className="block font-semibold tabular-nums text-ink">{timeRange(beat)}</span>
                  <span className="mt-0.5 block text-xs text-muted">{beat.label}</span>
                </th>
                <td className="px-3.5 py-3 leading-relaxed text-ink">{beat.voiceover || <span className="text-faint">—</span>}</td>
                <td className="px-3.5 py-3">
                  <ScreenText text={beat.onScreenText} />
                </td>
                <td className="px-3.5 py-3 text-xs leading-relaxed text-muted">{beat.visual || "—"}</td>
                <td className="px-3.5 py-3 text-xs leading-relaxed text-muted">{beat.editing || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="space-y-3 md:hidden" aria-label="Déroulé seconde par seconde">
        {beats.map((beat, index) => (
          <li
            key={index}
            className={cn("rounded-xl border p-4", index === 0 ? "border-hot/30 bg-hot-soft/40" : "border-line bg-surface")}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold tabular-nums text-ink">{timeRange(beat)}</span>
              <span className="truncate text-xs font-medium text-muted">{beat.label}</span>
            </div>
            {beat.voiceover ? <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink">{beat.voiceover}</p> : null}
            <dl className="mt-3 space-y-2 text-xs leading-relaxed">
              {beat.onScreenText ? (
                <div>
                  <dt className="font-medium text-muted">Texte à l&apos;écran</dt>
                  <dd className="mt-1">
                    <ScreenText text={beat.onScreenText} />
                  </dd>
                </div>
              ) : null}
              {beat.visual ? (
                <div>
                  <dt className="font-medium text-muted">Visuel</dt>
                  <dd className="text-ink/80">{beat.visual}</dd>
                </div>
              ) : null}
              {beat.editing ? (
                <div>
                  <dt className="font-medium text-muted">Montage</dt>
                  <dd className="text-ink/80">{beat.editing}</dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
