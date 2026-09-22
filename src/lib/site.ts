/**
 * Single source of truth for everything brand- and deployment-related.
 * Change these values and the whole site (metadata, footer, JSON-LD, CTAs) follows.
 */
export const site = {
  name: "Maiven",
  legalName: "Maiven Agency",
  domain: "maivenagency.com",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.maivenagency.com",
  locale: "fr_FR",
  description:
    "Maiven déploie des agents IA clé en main et des automatisations sur mesure pour les PME. Vos opérations répétitives tournent seules, 24/7.",
  tagline: "L'agence IA qui met vos opérations en pilote automatique",
  email: "contact@maivenagency.com",
  phone: "+33 1 84 80 00 00",
  phoneHref: "+33184800000",
  address: {
    street: "10 rue de la Paix",
    postalCode: "75002",
    city: "Paris",
    country: "FR",
  },
  bookingUrl: "https://cal.com/maiven/30min",
  socials: {
    linkedin: "https://www.linkedin.com/company/maivenagency",
    instagram: "https://www.instagram.com/maivenagency",
    youtube: "https://www.youtube.com/@maivenagency",
    x: "https://x.com/maivenagency",
  },
} as const;

export type NavItem = { label: string; href: string };

export const mainNav: NavItem[] = [
  { label: "Services", href: "/#services" },
  { label: "Méthode", href: "/#methode" },
  { label: "Cas d'usage", href: "/#cas-usage" },
  { label: "Tarifs", href: "/#tarifs" },
  { label: "FAQ", href: "/#faq" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Agence",
    items: [
      { label: "Services", href: "/#services" },
      { label: "Méthode", href: "/#methode" },
      { label: "Cas d'usage", href: "/#cas-usage" },
      { label: "Résultats", href: "/#resultats" },
    ],
  },
  {
    title: "Ressources",
    items: [
      { label: "Tarifs", href: "/#tarifs" },
      { label: "FAQ", href: "/#faq" },
      { label: "Nous contacter", href: "/contact" },
      { label: "Réserver un audit", href: "/contact#formulaire" },
    ],
  },
  {
    title: "Légal",
    items: [
      { label: "Mentions légales", href: "/mentions-legales" },
      { label: "Confidentialité", href: "/politique-de-confidentialite" },
      { label: "CGV", href: "/cgv" },
    ],
  },
];
