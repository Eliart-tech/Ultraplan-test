"use client";

/**
 * Edition version of src/components/settings/privacy-section.tsx (swapped
 * in at build time): there is no TrendScript server here. What leaves the
 * browser goes to the viewer's Firecrawl connector (Google feed addresses,
 * web searches) and to Claude through claude.ai.
 */

import { Cookie, HardDrive, Newspaper, Send, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ExternalAnchor } from "@/components/settings/rich-text";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { useServerStatus } from "@/lib/client/use-server-status";

function Item({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted [&_svg]:size-[18px]"
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <div className="mt-1 text-sm leading-relaxed text-muted">{children}</div>
      </div>
    </li>
  );
}

export function PrivacySection() {
  const { status } = useServerStatus();

  return (
    <Card as="div" className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">
      <ul className="grid gap-6 md:grid-cols-2">
        <Item icon={<HardDrive />} title="Profil et historique : uniquement dans ce navigateur">
          Votre profil créateur, vos scripts et vos analyses sont stockés dans le stockage local de ce navigateur,
          jamais dans une base de données. Ils ne suivent pas d&apos;un appareil à l&apos;autre et disparaissent si vous
          effacez les données du site : exportez-les depuis l&apos;historique pour les garder. Le brouillon du Studio,
          lui, ne dure que le temps de l&apos;onglet.
          <span className="mt-2 block">
            <ButtonLink href="/historique" variant="soft" size="sm">
              Ouvrir l&apos;historique
            </ButtonLink>
          </span>
        </Item>
        <Item icon={<Send />} title="Ce qui quitte votre navigateur">
          Il n&apos;y a pas de serveur TrendScript : tout tourne dans cette page. Une analyse envoie à votre connecteur
          Firecrawl les adresses des flux Google Trends et Google Actualités, qui contiennent le pays, la langue et vos
          mots-clés de niche. Les signaux collectés, votre niche et vos mots-clés vont à Claude via claude.ai pour
          former les sujets. Une génération envoie à Claude, via claude.ai, le sujet, ses preuves, vos réglages et votre
          profil ; elle envoie aussi le sujet à Firecrawl (titres de presse récents), et ses recherches web quand la
          vérification des faits est activée.
        </Item>
        <Item icon={<Cookie />} title="Cookies">
          Aucun : cette page ne pose ni cookie de session, ni cookie publicitaire, ni outil de mesure d&apos;audience.
        </Item>
        <Item icon={<Newspaper />} title="Google Actualités : usage personnel uniquement">
          Les flux RSS de Google Actualités sont fournis pour un usage personnel et non commercial : TrendScript
          convient à un outil personnel de veille, pas à un service commercial qui revendrait ces données.
        </Item>
        <Item icon={<Users />} title="Contenus des autres créateurs">
          Les vidéos, titres et chiffres affichés restent la propriété de leurs auteurs : servez-vous-en pour repérer
          les sujets, pas pour reprendre leurs contenus.
        </Item>
      </ul>

      {status?.sources.length ? (
        <div className="border-t border-line pt-5">
          <h3 className="text-sm font-semibold text-ink">Sources des données</h3>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {status.sources.map((source) => (
              <li key={source.id} className="flex min-w-0 items-center gap-2.5 text-sm">
                <PlatformIcon platform={source.platform} size="xs" decorative />
                {source.docsUrl ? (
                  <ExternalAnchor href={source.docsUrl} className="min-w-0 truncate">
                    {source.label}
                  </ExternalAnchor>
                ) : (
                  <span className="truncate text-ink">{source.label}</span>
                )}
              </li>
            ))}
            <li className="flex min-w-0 items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="flex size-5 items-center justify-center rounded-md bg-accent-soft text-accent-ink"
              >
                <Sparkles className="size-3" />
              </span>
              <ExternalAnchor href="https://www.anthropic.com/legal/consumer-terms">
                Conditions d&apos;utilisation de claude.ai
              </ExternalAnchor>
            </li>
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
