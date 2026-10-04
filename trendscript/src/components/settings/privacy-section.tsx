"use client";

import { Cookie, HardDrive, Newspaper, Play, Send, Sparkles, Users } from "lucide-react";
import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/ui/platform-icon";
import { useServerStatus } from "@/lib/client/use-server-status";
import { ExternalAnchor, inlineCodeClass } from "./rich-text";

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

/**
 * "Données et confidentialité": what stays in the browser, what goes to the
 * server and to Claude, cookies, source licences and links.
 */
export function PrivacySection() {
  const { status } = useServerStatus();
  const code = (text: string) => <code className={inlineCodeClass}>{text}</code>;

  return (
    <Card as="div" className="flex flex-col gap-6 px-5 py-5 sm:px-6 sm:py-6">
      <ul className="grid gap-6 md:grid-cols-2">
        <Item icon={<HardDrive />} title="Profil et historique : uniquement dans ce navigateur">
          Votre profil créateur, vos scripts, vos analyses et vos concurrents suivis sont stockés dans le stockage
          local de ce navigateur, jamais dans une base de données. Ils ne suivent pas d&apos;un appareil à l&apos;autre et disparaissent si vous
          effacez les données du site : exportez-les depuis l&apos;historique pour les garder. Le brouillon du Studio,
          lui, ne dure que le temps de l&apos;onglet.
          <span className="mt-2 block">
            <ButtonLink href="/historique" variant="soft" size="sm">
              Ouvrir l&apos;historique
            </ButtonLink>
          </span>
        </Item>
        <Item icon={<Send />} title="Ce qui quitte votre navigateur">
          Une analyse envoie au serveur le pays, la langue, la niche et vos mots-clés, qui sont transmis aux sources
          interrogées. Une génération envoie le sujet, ses preuves, vos réglages, votre profil et le résumé de vos concurrents
          sélectionnés au serveur, qui les transmet à Claude (Anthropic) pour écrire le script. L&apos;analyse
          d&apos;un concurrent envoie son pseudo et votre profil ; ses publications publiques sont lues par la source
          indiquée puis transmises à Claude. Le serveur ne garde qu&apos;un cache temporaire, en
          mémoire, des données de tendances.
        </Item>
        <Item icon={<Cookie />} title="Cookies">
          Aucun cookie publicitaire ni outil de mesure d&apos;audience. Seul un cookie de session ({code("ts_session")})
          est posé quand la protection par mot de passe est activée.
        </Item>
        <Item icon={<Newspaper />} title="Google Actualités : usage personnel uniquement">
          Les flux RSS de Google Actualités sont fournis pour un usage personnel et non commercial : TrendScript
          convient à un outil personnel de veille, pas à un service commercial qui revendrait ces données.
        </Item>
        <Item icon={<Play />} title="Statistiques YouTube : 30 jours maximum">
          Les règles de l&apos;API YouTube interdisent de conserver ses statistiques plus de 30 jours. Le serveur ne les
          garde en cache que quelques heures ; supprimez de votre historique les analyses de plus de 30 jours. Les
          chiffres des concurrents YouTube suivis sont effacés automatiquement après 30 jours, et les ratios dérivés
          (vues ÷ abonnés, engagement) des chaînes des autres ne s&apos;affichent que si votre accès à l&apos;API YouTube
          l&apos;autorise.{" "}
          <ExternalAnchor href="https://developers.google.com/youtube/terms/developer-policies">
            Règles de l&apos;API YouTube
          </ExternalAnchor>
        </Item>
        <Item icon={<Users />} title="Contenus des autres créateurs">
          Les vidéos, titres et chiffres affichés restent la propriété de leurs auteurs : servez-vous-en pour repérer
          les sujets, pas pour reprendre leurs contenus. Les données Instagram et TikTok collectées via Apify sont
          publiques, mais leur usage doit respecter les conditions de ces plateformes.
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
              <ExternalAnchor href="https://www.anthropic.com/legal/commercial-terms">
                Conditions de l&apos;API Anthropic
              </ExternalAnchor>
            </li>
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
