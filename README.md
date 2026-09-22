# Maiven Agency — site web

Site vitrine de **Maiven**, agence d'agents IA et d'automatisation pour PME.
Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4.

---

## Démarrer

```bash
npm install
cp .env.example .env.local   # puis renseignez les valeurs
npm run dev                  # http://localhost:3000
```

Scripts disponibles :

| Commande             | Rôle                                              |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | Serveur de développement (Turbopack)              |
| `npm run build`      | Build de production                               |
| `npm run start`      | Sert le build de production                       |
| `npm run lint`       | ESLint                                            |
| `npm run typecheck`  | Vérification TypeScript sans émission             |
| `npm run check`      | `lint` + `typecheck` + `build` — à lancer avant de pousser |

## Variables d'environnement

Voir `.env.example`. Aucune n'est obligatoire pour faire tourner le site.

| Variable               | Rôle                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | URL canonique — alimente les métadonnées, le sitemap et le JSON-LD.   |
| `RESEND_API_KEY`       | Active l'envoi d'e-mails du formulaire. Sans elle, les demandes sont journalisées au lieu d'être envoyées : le formulaire ne casse jamais en préproduction. |
| `CONTACT_TO_EMAIL`     | Destinataire des demandes.                                            |
| `CONTACT_FROM_EMAIL`   | Expéditeur (doit être un domaine vérifié chez votre fournisseur).     |

## Structure

```
src/
  app/                 Routes, métadonnées, sitemap, robots, OG image, API
    api/contact/       Route handler du formulaire (validation + anti-spam)
  components/
    layout/            En-tête, pied de page, logo
    sections/          Une section de page d'accueil par fichier
    ui/                Primitives partagées (bouton, carte, section, reveal…)
  lib/
    site.ts            Configuration de marque — nom, URL, contacts, navigation
    content.ts         Tout le contenu éditorial de la page d'accueil
    contact-schema.ts  Schéma Zod partagé entre le navigateur et le serveur
    json-ld.ts         Données structurées schema.org
```

### Modifier le contenu

- **Textes de la page d'accueil** → `src/lib/content.ts`
- **Coordonnées, réseaux sociaux, navigation** → `src/lib/site.ts`
- **Couleurs, typographie, animations** → tokens `@theme` dans `src/app/globals.css`

Aucun texte n'est codé en dur dans les composants de section : ils lisent tous
`content.ts`.

## Ce qui est déjà en place

- **SEO** : métadonnées complètes, balises canoniques, Open Graph et Twitter Card,
  `sitemap.xml`, `robots.txt`, `manifest.webmanifest`, données structurées
  `ProfessionalService`, `WebSite` et `FAQPage`.
- **Images sociales générées** : `opengraph-image` et `icon` sont produits par
  `next/og` — ils suivent la charte sans fichier à maintenir.
- **Accessibilité** : audit axe-core (WCAG 2.1 AA) à **0 violation** sur les cinq
  pages ; lien d'évitement, navigation au clavier, `prefers-reduced-motion`
  respecté, accordéon FAQ en `<details>` natif.
- **Formulaire de contact** : validation partagée client/serveur (Zod), pot de
  miel anti-bot, limitation de débit, messages d'erreur annoncés aux lecteurs
  d'écran, envoi via Resend optionnel.
- **Sécurité** : en-têtes `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS ; `X-Powered-By` désactivé.
- **Pages légales** : mentions légales, politique de confidentialité, CGV.

## À compléter avant la mise en ligne

1. **Informations légales** — les champs entre crochets dans
   `/mentions-legales` et `/cgv` (forme juridique, capital, RCS, TVA, directeur
   de la publication, hébergeur, tribunal compétent). Faites relire les CGV et la
   politique de confidentialité par un conseil juridique.
2. **Coordonnées réelles** dans `src/lib/site.ts` — l'adresse, le téléphone, les
   liens sociaux et l'URL de prise de rendez-vous sont des valeurs de départ.
3. **Contenu de preuve** — les noms de clients, témoignages et chiffres de
   `src/lib/content.ts` sont des exemples. Remplacez-les par vos données réelles :
   publier des témoignages inventés vous expose commercialement et juridiquement.
4. **Envoi d'e-mails** — créez une clé Resend (ou branchez un autre fournisseur
   dans `src/app/api/contact/route.ts`) et vérifiez votre domaine d'envoi.
5. **Domaine** — renseignez `NEXT_PUBLIC_SITE_URL` avec l'URL finale.

## Déploiement

Le projet se déploie tel quel sur Vercel : importez le dépôt, ajoutez les
variables d'environnement, le reste est détecté automatiquement. Tout autre
hébergeur supportant Node.js 20.9+ convient (`npm run build` puis `npm run start`).

Toutes les pages sont pré-rendues statiquement ; seule `/api/contact` est
dynamique.
