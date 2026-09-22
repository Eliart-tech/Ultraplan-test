import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Conditions générales de vente",
  description: `Conditions générales de vente des prestations ${site.legalName} : agents IA, automatisation et accompagnement.`,
  alternates: { canonical: "/cgv" },
  robots: { index: false, follow: true },
};

export default function CgvPage() {
  return (
    <LegalPage
      title="Conditions générales de vente"
      updatedAt="1er septembre 2026"
    >
      <p className="rounded-xl border border-brand-400/30 bg-brand-500/8 px-4 py-3 text-brand-100">
        <strong>À faire valider :</strong> modèle de départ destiné à des
        prestations de services entre professionnels. Faites-le adapter par votre
        conseil juridique avant toute utilisation commerciale.
      </p>

      <section>
        <h2>1. Objet et champ d&apos;application</h2>
        <p>
          Les présentes conditions régissent les prestations de services fournies
          par {site.legalName} (« le Prestataire ») à ses clients
          professionnels (« le Client ») : audit des opérations, conception et
          déploiement d&apos;agents conversationnels et vocaux, automatisation de
          processus, intégration, formation et maintenance associée. Elles
          prévalent sur tout document contraire du Client, sauf dérogation
          écrite.
        </p>
      </section>

      <section>
        <h2>2. Devis et commande</h2>
        <p>
          Chaque prestation fait l&apos;objet d&apos;un devis détaillant le
          périmètre, les livrables, le calendrier et le prix. Le devis est valable
          30 jours. La commande est formée à sa signature, accompagnée le cas
          échéant du versement de l&apos;acompte prévu.
        </p>
      </section>

      <section>
        <h2>3. Prix et modalités de paiement</h2>
        <ul>
          <li>Les prix sont exprimés en euros hors taxes.</li>
          <li>
            Les prestations forfaitaires sont facturées à hauteur de 40 % à la
            commande et du solde à la livraison, sauf stipulation contraire.
          </li>
          <li>Les abonnements sont facturés mensuellement, à terme à échoir.</li>
          <li>
            Le règlement intervient à 30 jours date de facture. Tout retard
            entraîne de plein droit des pénalités au taux d&apos;intérêt de la
            Banque centrale européenne majoré de 10 points, ainsi qu&apos;une
            indemnité forfaitaire de recouvrement de 40 € (articles L. 441-10 et
            D. 441-5 du code de commerce).
          </li>
        </ul>
      </section>

      <section>
        <h2>4. Obligations du Client</h2>
        <p>
          La réussite de la mission suppose la collaboration active du Client :
          désignation d&apos;un interlocuteur référent, fourniture des accès,
          données et documents nécessaires dans des délais raisonnables, et
          validation des livrables intermédiaires. Le Client garantit détenir les
          droits sur les contenus et données qu&apos;il transmet.
        </p>
      </section>

      <section>
        <h2>5. Nature des obligations du Prestataire</h2>
        <p>
          Le Prestataire est tenu d&apos;une obligation de moyens renforcée. Les
          systèmes reposant sur des modèles d&apos;intelligence artificielle, le
          Prestataire ne garantit pas l&apos;exactitude de chaque réponse produite
          et met en place des garde-fous, une supervision et des mécanismes
          d&apos;escalade vers un opérateur humain. Le Client demeure responsable
          de l&apos;usage final qu&apos;il fait des systèmes livrés.
        </p>
      </section>

      <section>
        <h2>6. Recette et réversibilité</h2>
        <p>
          Les livrables sont réputés acceptés à défaut de réserve écrite et
          motivée du Client dans les 10 jours ouvrés suivant leur mise à
          disposition. À la fin de la relation, le Prestataire remet la
          documentation technique et, sur demande, exporte les configurations
          permettant la reprise de l&apos;exploitation.
        </p>
      </section>

      <section>
        <h2>7. Propriété intellectuelle</h2>
        <p>
          Les développements spécifiques réalisés pour le Client lui sont cédés à
          compter du paiement intégral. Le Prestataire conserve la propriété de
          ses outils, briques logicielles préexistantes, méthodes et savoir-faire,
          et concède au Client une licence d&apos;utilisation non exclusive et non
          cessible pour la durée d&apos;exploitation de la solution.
        </p>
      </section>

      <section>
        <h2>8. Confidentialité et données</h2>
        <p>
          Chaque partie s&apos;engage à préserver la confidentialité des
          informations échangées, pendant la durée du contrat et cinq ans après
          son terme. Le traitement des données à caractère personnel est encadré
          par un accord de traitement annexé au contrat et par notre{" "}
          <a href="/politique-de-confidentialite">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section>
        <h2>9. Responsabilité</h2>
        <p>
          La responsabilité du Prestataire est limitée aux dommages directs et
          plafonnée au montant hors taxes effectivement réglé par le Client au
          titre des douze mois précédant le fait générateur. Sont exclus les
          dommages indirects, notamment la perte de chiffre d&apos;affaires, de
          clientèle ou de données dont le Client n&apos;aurait pas assuré la
          sauvegarde.
        </p>
      </section>

      <section>
        <h2>10. Durée, résiliation et force majeure</h2>
        <p>
          Les abonnements sont conclus pour une durée initiale de douze mois,
          renouvelable par tacite reconduction, résiliable par l&apos;une ou
          l&apos;autre des parties moyennant un préavis de deux mois. En cas de
          manquement grave non réparé dans les 30 jours suivant mise en demeure,
          la partie lésée peut résilier de plein droit. Aucune partie n&apos;est
          responsable d&apos;un manquement dû à un cas de force majeure au sens de
          l&apos;article 1218 du code civil.
        </p>
      </section>

      <section>
        <h2>11. Droit applicable et juridiction</h2>
        <p>
          Les présentes conditions sont soumises au droit français. À défaut de
          résolution amiable dans les 30 jours suivant la notification du
          différend, compétence exclusive est attribuée au tribunal de commerce de
          [ville du ressort].
        </p>
      </section>
    </LegalPage>
  );
}
