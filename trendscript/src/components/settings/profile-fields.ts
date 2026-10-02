import type { CreatorProfile } from "@/lib/types";

/** One field of the creator profile form. */
export interface ProfileFieldDef {
  key: keyof CreatorProfile;
  label: string;
  placeholder: string;
  /** How the field shapes the generated scripts. */
  hint: string;
  /** Same limits as `creatorProfileSchema` (a longer value would be rejected by /api/script). */
  maxLength: number;
  /** Rows for a textarea; absent → single-line input. */
  rows?: number;
  /** Takes the full width of the two-column grid. */
  wide?: boolean;
  autoComplete?: string;
}

/** Order, copy and limits of the "Profil créateur" form. */
export const PROFILE_FIELDS: ProfileFieldDef[] = [
  {
    key: "name",
    label: "Nom ou pseudo",
    placeholder: "Ex. : Léa · Budget Malin",
    hint: "Pour les moments où le script vous fait vous présenter ou signer une série. Laissez vide si vous ne vous nommez jamais.",
    maxLength: 100,
    autoComplete: "nickname",
  },
  {
    key: "niche",
    label: "Niche",
    placeholder: "Ex. : finance personnelle pour jeunes actifs",
    hint: "Le thème central de votre compte : Claude choisit les exemples, le vocabulaire et les angles en fonction de cette niche.",
    maxLength: 300,
    autoComplete: "off",
  },
  {
    key: "audience",
    label: "Audience cible",
    placeholder: "Ex. : 22–30 ans, premier CDI, vivent en ville, débutants en placements",
    hint: "Âge, situation, niveau de connaissance du sujet : règle le niveau d'explication et les références utilisées dans le script.",
    maxLength: 500,
    rows: 2,
    wide: true,
  },
  {
    key: "positioning",
    label: "Positionnement",
    placeholder: "Ex. : l'ex-conseillère bancaire qui explique sans jargon ce que les banques ne disent pas",
    hint: "Ce qui vous distingue des autres créateurs de la niche : oriente le point de vue, la crédibilité mise en avant et les prises de position.",
    maxLength: 500,
    rows: 2,
    wide: true,
  },
  {
    key: "voice",
    label: "Voix et style à l'oral",
    placeholder:
      "Ex. : je tutoie, phrases courtes, un peu d'autodérision ; j'ouvre souvent par « Bon. » et je dis « concrètement » plutôt que « en fait »",
    hint: "Tutoiement ou vouvoiement, expressions fétiches, tics de langage, niveau de langue : le script doit sonner comme vous quand vous le lisez à voix haute.",
    maxLength: 1000,
    rows: 3,
    wide: true,
  },
  {
    key: "avoid",
    label: "À éviter absolument",
    placeholder: "Ex. : crypto, conseils d'investissement personnalisés, les mots « incroyable » et « dingue »",
    hint: "Sujets, mots ou formulations que le script ne doit jamais contenir. Séparez les éléments par des virgules.",
    maxLength: 500,
    rows: 2,
  },
  {
    key: "defaultCta",
    label: "Appel à l'action habituel",
    placeholder: "Ex. : Abonne-toi pour ton décryptage finance du lundi",
    hint: "Repris quand le CTA du Studio est sur « Automatique » et qu'il colle à l'angle de la vidéo.",
    maxLength: 300,
    rows: 2,
  },
];
