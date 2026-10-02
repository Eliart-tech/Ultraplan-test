import type { Metadata } from "next";
import { Database, Gauge, ShieldCheck, UserRound } from "lucide-react";
import { PrivacySection } from "@/components/settings/privacy-section";
import { ProfileForm } from "@/components/settings/profile-form";
import { ScoreExplainer } from "@/components/settings/score-explainer";
import { SettingsNav } from "@/components/settings/settings-nav";
import { SettingsSection } from "@/components/settings/settings-section";
import { SourcesPanel } from "@/components/settings/sources-panel";
import { Container, PageHeader } from "@/components/ui/container";

export const metadata: Metadata = {
  title: "Réglages",
  description: "Profil créateur, sources de données et clés d'API, calcul du score et confidentialité.",
};

export default function SettingsPage() {
  return (
    <Container className="py-8 sm:py-12">
      <PageHeader
        eyebrow="Configuration"
        title="Réglages"
        description="Votre profil de créateur, l'état des sources de données et des clés, la formule du score et ce qu'il advient de vos données."
      />

      <div className="mt-8 lg:mt-10 lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <SettingsNav />

        <div className="flex min-w-0 flex-col gap-14">
          <SettingsSection
            id="profil"
            icon={<UserRound />}
            title="Profil créateur"
            description="Envoyé avec chaque génération de script pour que le texte vous ressemble : niche, audience, façon de parler, sujets à éviter. Tous les champs sont facultatifs et restent dans ce navigateur."
          >
            <ProfileForm />
          </SettingsSection>

          <SettingsSection
            id="sources"
            icon={<Database />}
            title="Sources de données"
            description="TrendScript n'affiche que des données réelles. Une source sans clé est ignorée et signalée « non configurée » — jamais remplacée par des exemples."
          >
            <SourcesPanel />
          </SettingsSection>

          <SettingsSection
            id="score"
            icon={<Gauge />}
            title="Comment le score est calculé"
            description="Chaque sujet reçoit un score de 0 à 100, calculé dans le code à partir des métriques des sources pour pouvoir être expliqué et vérifié."
          >
            <ScoreExplainer />
          </SettingsSection>

          <SettingsSection
            id="confidentialite"
            icon={<ShieldCheck />}
            title="Données et confidentialité"
            description="Ce qui reste chez vous, ce qui est envoyé, et les règles d'usage des sources."
          >
            <PrivacySection />
          </SettingsSection>
        </div>
      </div>
    </Container>
  );
}
