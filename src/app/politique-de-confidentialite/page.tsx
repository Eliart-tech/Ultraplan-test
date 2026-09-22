import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description:
    "Comment Maiven collecte, utilise et protège vos données personnelles, conformément au RGPD.",
  alternates: { canonical: "/politique-de-confidentialite" },
  robots: { index: false, follow: true },
};

export default function ConfidentialitePage() {
  return (
    <LegalPage title="Politique de confidentialité" updatedAt="1er septembre 2026">
      <p className="rounded-xl border border-brand-400/30 bg-brand-500/8 px-4 py-3 text-brand-100">
        <strong>À faire valider :</strong> ce document est un modèle de départ
        conforme à la structure attendue par le RGPD. Faites-le relire par votre
        conseil juridique et complétez les champs entre crochets avant la mise en
        ligne.
      </p>

      <section>
        <h2>1. Responsable du traitement</h2>
        <p>
          {site.legalName}, dont le siège est situé {site.address.street},{" "}
          {site.address.postalCode} {site.address.city}, est responsable des
          traitements décrits ci-dessous. Pour toute question relative à vos
          données : <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>
      </section>

      <section>
        <h2>2. Données collectées</h2>
        <p>Nous collectons uniquement les données que vous nous transmettez :</p>
        <ul>
          <li>
            <strong>Formulaire de contact :</strong> nom, adresse e-mail,
            entreprise, téléphone, objet de la demande et contenu du message.
          </li>
          <li>
            <strong>Échanges commerciaux :</strong> informations partagées lors
            des appels, audits et comptes rendus.
          </li>
          <li>
            <strong>Données techniques :</strong> adresse IP et journaux de
            connexion, conservés pour la sécurité du service et la limitation des
            envois abusifs.
          </li>
        </ul>
        <p>
          Aucun cookie publicitaire, aucun pixel de réseau social et aucun
          traceur tiers ne sont déposés sur ce site.
        </p>
      </section>

      <section>
        <h2>3. Finalités et bases légales</h2>
        <ul>
          <li>
            <strong>Répondre à votre demande</strong> — base légale : votre
            consentement, recueilli lors de l&apos;envoi du formulaire.
          </li>
          <li>
            <strong>Exécuter une mission</strong> — base légale : l&apos;exécution
            du contrat ou de mesures précontractuelles.
          </li>
          <li>
            <strong>Sécuriser le site et prévenir les abus</strong> — base légale :
            notre intérêt légitime.
          </li>
          <li>
            <strong>Respecter nos obligations comptables et fiscales</strong> —
            base légale : une obligation légale.
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Durées de conservation</h2>
        <ul>
          <li>Demandes sans suite commerciale : 3 ans à compter du dernier contact.</li>
          <li>Documents contractuels et comptables : 10 ans (obligation légale).</li>
          <li>Journaux techniques : 12 mois maximum.</li>
        </ul>
      </section>

      <section>
        <h2>5. Destinataires et sous-traitants</h2>
        <p>
          Vos données sont accessibles aux seuls membres de l&apos;équipe qui en
          ont besoin. Nous faisons appel à des sous-traitants techniques
          (hébergement, envoi d&apos;e-mails, outil de prise de rendez-vous,
          messagerie professionnelle) encadrés par des accords de traitement
          conformes à l&apos;article 28 du RGPD. La liste à jour est disponible
          sur simple demande.
        </p>
        <p>
          Nous privilégions un hébergement situé dans l&apos;Union européenne.
          Lorsqu&apos;un transfert hors UE est inévitable, il est encadré par les
          clauses contractuelles types de la Commission européenne.
        </p>
      </section>

      <section>
        <h2>6. Données confiées dans le cadre d&apos;une mission</h2>
        <p>
          Lorsque nous déployons un agent ou une automatisation, nous agissons en
          qualité de sous-traitant au sens du RGPD : vous restez responsable de
          traitement. Les données de vos clients ne sont jamais utilisées pour
          entraîner un modèle, ni réutilisées pour un autre client. Les modalités
          précises figurent dans l&apos;accord de traitement des données (DPA)
          signé avec la mission.
        </p>
      </section>

      <section>
        <h2>7. Vos droits</h2>
        <p>
          Vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement, de limitation, d&apos;opposition et de portabilité,
          ainsi que du droit de retirer votre consentement à tout moment.
          Adressez votre demande à{" "}
          <a href={`mailto:${site.email}`}>{site.email}</a> ; nous répondons sous
          un mois.
        </p>
        <p>
          Si la réponse ne vous satisfait pas, vous pouvez introduire une
          réclamation auprès de la CNIL (<a href="https://www.cnil.fr">cnil.fr</a>
          ), 3 place de Fontenoy, TSA 80715, 75334 Paris Cedex 07.
        </p>
      </section>

      <section>
        <h2>8. Sécurité</h2>
        <p>
          Chiffrement des échanges (HTTPS), accès nominatifs, authentification
          renforcée sur les outils internes, cloisonnement des environnements
          clients et revue régulière des accès. En cas de violation de données
          présentant un risque pour vos droits, nous vous informons dans les
          délais prévus par la réglementation.
        </p>
      </section>

      <section>
        <h2>9. Modifications</h2>
        <p>
          Cette politique peut évoluer. Toute modification substantielle est
          signalée sur cette page, avec mise à jour de la date figurant en
          en-tête.
        </p>
      </section>
    </LegalPage>
  );
}
