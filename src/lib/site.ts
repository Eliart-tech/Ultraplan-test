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
    "Maiven aide les PME à automatiser leurs opérations grâce à des agents IA clé en main et des automatisations sur mesure. Pour scaler plus vite, réduire vos coûts et devenir une entreprise AI-first.",
  tagline: "Agence IA pour l'automatisation et la croissance",
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
  { label: "Agents IA", href: "/#agents" },
  { label: "Témoignages", href: "/#temoignages" },
  { label: "Processus", href: "/#processus" },
];

export const footerNav: { title: string; items: NavItem[] }[] = [
  {
    title: "Liens rapides",
    items: [
      { label: "À propos", href: "/#a-propos" },
      { label: "Services", href: "/#services" },
      { label: "Témoignages", href: "/#temoignages" },
      { label: "Mentions légales", href: "/mentions-legales" },
    ],
  },
  {
    title: "Services",
    items: [
      { label: "Agent IA plug & play", href: "/#services" },
      { label: "Automatisation sur mesure", href: "/#services" },
      { label: "Conseil et audit IA", href: "/#services" },
      { label: "Formation IA générative", href: "/#services" },
    ],
  },
  {
    title: "Légal",
    items: [
      { label: "Mentions légales", href: "/mentions-legales" },
      { label: "Confidentialité", href: "/politique-de-confidentialite" },
      { label: "CGV", href: "/cgv" },
      { label: "Contact", href: "/contact" },
    ],
  },
];
