import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/prose";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Mentions légales",
  description: `Mentions légales du site ${site.domain} — éditeur, hébergeur, propriété intellectuelle.`,
  alternates: { canonical: "/mentions-legales" },
  robots: { index: false, follow: true },
};

export default function MentionsLegalesPage() {
  return (
    <LegalPage title="Mentions légales" updatedAt="1er septembre 2026">
      <p className="rounded-2xl border border-blush-300 bg-blush-100 px-4 py-3 text-ink-800">
        <strong>À compléter avant la mise en ligne :</strong> les champs entre
        crochets doivent être renseignés avec les informations réelles de la
        société (forme juridique, capital, RCS, SIRET, TVA, directeur de la
        publication, hébergeur).
      </p>

      <section>
        <h2>Éditeur du site</h2>
        <p>
          Le site {site.domain} est édité par {site.legalName}, [forme juridique]
          au capital de [montant] €, immatriculée au RCS de [ville] sous le
          numéro [numéro RCS], dont le siège social est situé{" "}
          {site.address.street}, {site.address.postalCode} {site.address.city},
          France.
        </p>
        <ul>
          <li>Numéro de TVA intracommunautaire : [numéro de TVA]</li>
          <li>
            Adresse e-mail : <a href={`mailto:${site.email}`}>{site.email}</a>
          </li>
          <li>
            Téléphone : <a href={`tel:${site.phoneHref}`}>{site.phone}</a>
          </li>
          <li>Directeur de la publication : [nom du directeur de publication]</li>
        </ul>
      </section>

      <section>
        <h2>Hébergement</h2>
        <p>
          Le site est hébergé par [nom de l&apos;hébergeur], [adresse de
          l&apos;hébergeur], [téléphone de l&apos;hébergeur].
        </p>
      </section>

      <section>
        <h2>Propriété intellectuelle</h2>
        <p>
          L&apos;ensemble des éléments composant ce site — textes, éléments
          graphiques, logo, charte, code source et arborescence — est la
          propriété exclusive de {site.legalName}, sauf mention contraire. Toute
          reproduction, représentation, adaptation ou exploitation, totale ou
          partielle, par quelque procédé que ce soit et sur quelque support que
          ce soit, est interdite sans autorisation écrite préalable.
        </p>
        <p>
          Les marques et logos de tiers éventuellement cités restent la
          propriété de leurs détenteurs respectifs.
        </p>
      </section>

      <section>
        <h2>Responsabilité</h2>
        <p>
          {site.legalName} s&apos;efforce d&apos;assurer l&apos;exactitude et la
          mise à jour des informations publiées sur ce site, sans pouvoir en
          garantir l&apos;exhaustivité. Les informations présentées ont une
          valeur indicative et ne constituent ni un conseil, ni une offre
          contractuelle. Les chiffres de résultats mentionnés correspondent à
          des moyennes constatées sur des missions passées et ne constituent pas
          un engagement de performance.
        </p>
        <p>
          Les liens sortants vers des sites tiers sont fournis pour information ;
          {site.legalName} n&apos;exerce aucun contrôle sur leur contenu et
          décline toute responsabilité à cet égard.
        </p>
      </section>

      <section>
        <h2>Données personnelles et cookies</h2>
        <p>
          Le traitement des données personnelles est décrit dans notre{" "}
          <a href="/politique-de-confidentialite">
            politique de confidentialité
          </a>
          . Ce site ne dépose aucun cookie publicitaire ni traceur tiers.
        </p>
      </section>

      <section>
        <h2>Droit applicable</h2>
        <p>
          Les présentes mentions légales sont soumises au droit français. En cas
          de litige, et à défaut de résolution amiable, compétence est attribuée
          aux tribunaux français compétents.
        </p>
      </section>
    </LegalPage>
  );
}
