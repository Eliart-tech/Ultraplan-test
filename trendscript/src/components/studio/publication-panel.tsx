import { Hash, Megaphone, Text } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/client/format";
import { PLATFORM_LABELS } from "@/lib/script/levels";
import type { ScriptPlatform } from "@/lib/types";
import { CAPTION_LIMITS } from "./studio-options";
import { hashtagLine } from "./studio-utils";

function Block({
  icon,
  title,
  aside,
  actions,
  children,
}: {
  icon: ReactNode;
  title: string;
  aside?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink [&_svg]:size-4">
          <span aria-hidden className="text-accent">
            {icon}
          </span>
          {title}
        </h3>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

export interface PublicationPanelProps {
  caption: string;
  hashtags: string[];
  cta: string;
  platform: ScriptPlatform;
}

/** Caption, hashtags and CTA, each with its own copy button. */
export function PublicationPanel({ caption, hashtags, cta, platform }: PublicationPanelProps) {
  const tags = hashtagLine(hashtags);
  const limit = CAPTION_LIMITS[platform];
  const over = caption.length > limit;
  const tagList = tags ? tags.split(" ") : [];

  return (
    <div className="space-y-4">
      <Block
        icon={<Text />}
        title="Légende"
        aside={
          <span className={cn("text-xs tabular-nums", over ? "font-semibold text-danger-ink" : "text-muted")}>
            {formatNumber(caption.length)} / {formatNumber(limit)} caractères ({PLATFORM_LABELS[platform].label})
          </span>
        }
        actions={
          <>
            <CopyButton text={caption} label="Copier la légende" disabled={!caption} />
            {tags ? <CopyButton text={`${caption.trim()}\n\n${tags}`} label="Copier légende + hashtags" variant="ghost" /> : null}
          </>
        }
      >
        {caption ? (
          <p className="whitespace-pre-wrap rounded-lg bg-surface-2/60 p-3.5 text-sm leading-relaxed text-ink">{caption}</p>
        ) : (
          <p className="text-sm text-muted">Pas de légende dans ce script.</p>
        )}
      </Block>

      <Block
        icon={<Hash />}
        title={`Hashtags (${tagList.length})`}
        actions={tags ? <CopyButton text={tags} label="Copier les hashtags" /> : null}
      >
        {tagList.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {tagList.map((tag, index) => (
              <li key={`${index}-${tag}`} className="rounded-lg bg-accent-soft px-2 py-1 text-xs font-medium text-accent-ink">
                {tag}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Aucun hashtag proposé.</p>
        )}
      </Block>

      <Block icon={<Megaphone />} title="Appel à l'action" actions={cta ? <CopyButton text={cta} label="Copier le CTA" /> : null}>
        <p className="text-sm leading-relaxed text-ink">{cta || <span className="text-muted">Pas d&apos;appel à l&apos;action.</span>}</p>
      </Block>
    </div>
  );
}
