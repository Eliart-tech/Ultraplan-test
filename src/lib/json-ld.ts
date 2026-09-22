import { faq, services } from "./content";
import { site } from "./site";

/** Structured data helpers — all values come from our own static config. */

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    "@id": `${site.url}/#organization`,
    name: site.legalName,
    alternateName: site.name,
    url: site.url,
    description: site.description,
    email: site.email,
    telephone: site.phone,
    priceRange: "€€",
    areaServed: { "@type": "Country", name: "France" },
    address: {
      "@type": "PostalAddress",
      streetAddress: site.address.street,
      postalCode: site.address.postalCode,
      addressLocality: site.address.city,
      addressCountry: site.address.country,
    },
    sameAs: Object.values(site.socials),
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Services Maiven",
      itemListElement: services.items.map((service) => ({
        "@type": "Offer",
        itemOffered: {
          "@type": "Service",
          name: service.name,
          description: service.body,
        },
      })),
    },
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${site.url}/#website`,
    url: site.url,
    name: site.name,
    inLanguage: "fr-FR",
    publisher: { "@id": `${site.url}/#organization` },
  };
}

export function faqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}
