"use client";

import { Cloud, Laptop, RefreshCw, ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardFooter } from "@/components/ui/card";
import { CopyButton } from "@/components/ui/copy-button";
import { inlineCodeClass } from "./rich-text";

function Step({ index, children }: { index: number; children: ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed text-ink/85">
      <span
        aria-hidden
        className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.6875rem] font-semibold tabular-nums text-accent-ink"
      >
        {index}
      </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  );
}

function Column({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2/60 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <span aria-hidden className="text-accent [&_svg]:size-4">
          {icon}
        </span>
        {title}
      </h4>
      <ol className="mt-3 flex flex-col gap-2.5">{children}</ol>
    </div>
  );
}

export interface KeyHowToProps {
  /** `.env.local` lines for what is missing ("" when nothing is). */
  template: string;
  onReload: () => void;
  reloading: boolean;
}

/**
 * "Comment ajouter une clé": local (.env.local + restart) vs hosted
 * (dashboard + redeploy), a copyable template of the missing variables, and
 * the rules for keeping keys secret.
 */
export function KeyHowTo({ template, onReload, reloading }: KeyHowToProps) {
  const code = (text: string) => <code className={inlineCodeClass}>{text}</code>;
  return (
    <Card as="section" aria-labelledby="ajouter-une-cle">
      <div className="flex flex-col gap-5 px-5 pt-5 pb-5 sm:px-6">
        <div>
          <h3 id="ajouter-une-cle" className="text-base font-semibold text-ink">
            Comment ajouter une clé
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Les clés sont lues par le serveur au démarrage, jamais par le navigateur : elles ne se saisissent pas dans
            cette page.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Column icon={<Laptop />} title="En local (sur votre ordinateur)">
            <Step index={1}>
              Dans le dossier {code("trendscript")}, créez le fichier {code(".env.local")} à côté de{" "}
              {code("package.json")} (ou copiez {code(".env.example")}).
            </Step>
            <Step index={2}>
              Ajoutez une ligne par variable : {code("NOM=valeur")}, sans guillemets ni espace autour du {code("=")}.
            </Step>
            <Step index={3}>
              Arrêtez le serveur ({code("Ctrl + C")}) puis relancez {code("npm run dev")} : les variables ne sont lues
              qu&apos;au démarrage.
            </Step>
          </Column>
          <Column icon={<Cloud />} title="En ligne (Vercel ou autre hébergeur)">
            <Step index={1}>
              Ouvrez le tableau de bord de l&apos;hébergeur → paramètres du projet → variables d&apos;environnement («
              Environment Variables » sur Vercel).
            </Step>
            <Step index={2}>
              Ajoutez chaque variable avec son nom exact et sa valeur, pour l&apos;environnement de production.
            </Step>
            <Step index={3}>
              Redéployez : les nouvelles valeurs ne s&apos;appliquent qu&apos;au déploiement suivant.
            </Step>
          </Column>
        </div>

        <Alert tone="warning" title="Une clé API est un secret" icon={<ShieldAlert />} role="none">
          Ne la collez jamais dans un chat (y compris avec une IA), un e-mail, une capture d&apos;écran ou un ticket, et
          ne la commitez pas : {code(".env.local")} est ignoré par git. En cas de fuite, révoquez-la chez le fournisseur
          et créez-en une nouvelle.
        </Alert>
      </div>

      <CardFooter className="justify-between gap-3">
        <p className="min-w-0 flex-1 basis-56 text-[0.8125rem] text-muted">
          {template
            ? "Copiez les noms des variables manquantes, puis complétez les valeurs dans votre fichier."
            : "Toutes les variables utiles sont définies sur ce serveur."}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {template ? <CopyButton text={template} label="Copier les variables manquantes" /> : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={onReload}
            loading={reloading}
            loadingText="Actualisation…"
            leftIcon={<RefreshCw aria-hidden className="size-4" />}
          >
            Actualiser le statut
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
