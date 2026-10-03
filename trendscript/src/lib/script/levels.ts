/**
 * French labels for every script setting (UI sliders, selects, badges) and
 * the matching playbook rows injected into the script prompt. Pure and
 * client-safe.
 *
 * The two sliders are orthogonal (playbook §5): virality changes the
 * packaging (hook, pace, emotion, CTA), pedagogy changes the payload
 * (density, structure, proof). Neither one may change the facts.
 */

import type {
  AngleType,
  CtaType,
  DurationSec,
  HookStyle,
  ScriptPlatform,
  SpeakingPace,
  Tone,
  VideoFormat,
} from "../types";

export interface LevelInfo {
  band: 1 | 2 | 3 | 4 | 5;
  min: number;
  max: number;
  label: string;
  description: string;
}

export interface LabelInfo {
  label: string;
  description: string;
}

type Band = LevelInfo["band"];

/** `band = min(5, floor(v / 20) + 1)` → 0–19, 20–39, 40–59, 60–79, 80–100. */
function bandOf(value: number): Band {
  const safe = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  return Math.min(5, Math.floor(safe / 20) + 1) as Band;
}

export const VIRALITY_LEVELS: LevelInfo[] = [
  {
    band: 1,
    min: 0,
    max: 19,
    label: "Sobre",
    description: "Informatif et posé : le sujet énoncé clairement, ton calme, aucun superlatif.",
  },
  {
    band: 2,
    min: 20,
    max: 39,
    label: "Engageant",
    description: "Une question ou un bénéfice concret en accroche, une boucle ouverte, de la curiosité.",
  },
  {
    band: 3,
    min: 40,
    max: 59,
    label: "Dynamique",
    description: "Accroche contre-intuitive, relance au milieu, fin qui boucle, une thèse tranchée et étayée.",
  },
  {
    band: 4,
    min: 60,
    max: 79,
    label: "Viral",
    description: "Rupture de schéma (POV, in medias res), coupes toutes les 2–3 s, émotion forte, prise de position.",
  },
  {
    band: 5,
    min: 80,
    max: 100,
    label: "Ultra-viral",
    description: "Arrêt du scroll dès la 1re seconde, chaque temps plus fort que le précédent — sans jamais exagérer les faits.",
  },
];

export const PEDAGOGY_LEVELS: LevelInfo[] = [
  {
    band: 1,
    min: 0,
    max: 19,
    label: "Divertissement pur",
    description: "Rien à retenir : sketch, histoire, chute.",
  },
  {
    band: 2,
    min: 20,
    max: 39,
    label: "Info-divertissement",
    description: "Un seul fait clé sourcé, façon « le saviez-vous ».",
  },
  {
    band: 3,
    min: 40,
    max: 59,
    label: "Explicatif",
    description: "Une notion et deux points, les termes techniques définis en une phrase.",
  },
  {
    band: 4,
    min: 60,
    max: 79,
    label: "Pédagogique",
    description: "Trois points maximum, chacun prouvé ou illustré, récap en une phrase.",
  },
  {
    band: 5,
    min: 80,
    max: 100,
    label: "Cours structuré",
    description: "Objectif annoncé, notion puis application et mini-quiz ; 45 s minimum ou format série.",
  },
];

export function viralityBand(v: number): LevelInfo {
  return VIRALITY_LEVELS[bandOf(v) - 1];
}

export function pedagogyBand(p: number): LevelInfo {
  return PEDAGOGY_LEVELS[bandOf(p) - 1];
}

// ---------------------------------------------------------------------------
// Prompt rows (playbook §5–6), one per band / tone
// ---------------------------------------------------------------------------

/** Observable markers of each virality band (playbook §5.1). */
export const VIRALITY_PROMPT_ROWS: Record<Band, string> = {
  1: "Hook : énoncé clair du sujet (« Ce qui change le 25 octobre »). Structure : linéaire, rupture visuelle toutes les 5–7 s, pas de boucle ouverte. Vocabulaire : neutre, précis. Émotion : calme. Affirmations : prudentes, nuancées, aucun superlatif. CTA : aucun, ou abonnement discret.",
  2: "Hook : question ou bénéfice concret. Structure : une boucle ouverte (annoncée tôt, refermée avant la fin). Vocabulaire : courant, une image ou une analogie. Émotion : curiosité. Affirmations : nettes, avec nuance. CTA : enregistrer, ou question ouverte.",
  3: "Hook : combiné (texte + visuel + parole), contre-intuitif ou chiffre sourcé. Structure : deux boucles ouvertes + une relance, rupture toutes les 3–4 s, fin qui boucle sur le début. Vocabulaire : phrases courtes, très oral. Émotion : surprise + identification. Affirmations : une thèse tranchée et étayée. CTA : partage ciblé « envoie ça à… ».",
  4: "Hook : rupture de schéma (in medias res, « arrêtez de… », POV). Structure : escalade, coupe toutes les 2–3 s, fin en boucle obligatoire. Vocabulaire : punchy, images fortes ; superlatifs seulement s'ils sont vrais. Émotion : forte (émerveillement, indignation mesurée, rire). Affirmations : prise de position assumée, nuance condensée en une phrase. CTA : partage + question qui fait débattre.",
  5: "Hook : arrêt du scroll dès la 1re seconde, visuel fort + texte écran de 3 à 5 mots. Structure : chaque temps plus fort que le précédent, aucun temps mort, fin en boucle. Vocabulaire : très oral, rythmé. Émotion : maximale, mais JAMAIS la peur ou la panique sur un sujet de crise. Affirmations : un seul chiffre fort, sourcé ; aucune exagération. CTA : intégré au récit, pas d'appel explicite à l'engagement.",
};

/** Observable markers of each pedagogy band (playbook §5.2). */
export const PEDAGOGY_PROMPT_ROWS: Record<Band, string> = {
  1: "Contenu : rien à retenir. Structure : sketch, histoire, chute. Vocabulaire : familier. Preuves : aucun fait non nécessaire. Fin : pas de récap ; viser le partage.",
  2: "Contenu : un seul fait clé (« le saviez-vous »). Structure : accroche → fait → chute. Vocabulaire : courant + une analogie. Preuves : le fait est sourcé (source en légende). Fin : pas de récap ; partage ou abonnement.",
  3: "Contenu : une notion + deux points. Structure : problème → explication → exemple. Vocabulaire : termes techniques définis en une phrase. Preuves : source citée à l'oral ou à l'écran. Fin : récap facultatif ; enregistrer.",
  4: "Contenu : trois points numérotés au maximum. Structure : chaque point = affirmation + preuve ou exemple ; corriger une erreur courante. Vocabulaire : définitions, exemples concrets. Preuves : chaque point est sourcé. Fin : récap en une phrase ; enregistrer.",
  5: "Contenu : objectif annoncé (« à la fin tu sauras… »). Structure : prérequis → notion → application → mini-quiz. Vocabulaire : rigoureux mais oral. Preuves : sources affichées à l'écran. Fin : récap + annonce d'une « partie 2 » ; enregistrer ou s'abonner. Si la durée est inférieure à 45 s, traiter un seul point et annoncer la suite en série.",
};

/** Tone rows (playbook §6). */
export const TONE_PROMPT_ROWS: Record<Tone, string> = {
  expert:
    "Adresse : vous (ou tu si la niche tutoie). Syntaxe : précise, termes définis, données. Marqueurs : « concrètement », « en pratique ». À éviter : jargon non défini, condescendance. Exemple : « Concrètement, la règle tient en une phrase : … »",
  decontracte:
    "Adresse : tu. Syntaxe : orale, élisions (« t'as »), phrases courtes. Marqueurs : « bon », « franchement ». À éviter : vulgarité gratuite. Exemple : « Franchement, personne ne t'explique ça. »",
  humoristique:
    "Adresse : tu. Syntaxe : exagération, rupture, chute. Marqueurs : répétition comique, autodérision. À éviter : se moquer d'une victime ou d'un groupe. Exemple : « Lundi 8 h : ton corps est encore à dimanche. »",
  inspirant:
    "Adresse : tu / nous. Syntaxe : verbes d'action, images positives. Marqueurs : « imagine », « tu peux ». À éviter : promesses irréalistes, injonctions. Exemple : « Tu n'as pas besoin de tout changer. Juste ça. »",
  provocateur:
    "Adresse : tu. Syntaxe : affirmation forte, contre-pied. Marqueurs : « arrêtez de », « on se ment ». À éviter : attaquer une personne, tordre les faits. Exemple : « On se ment sur la productivité. Voilà pourquoi. »",
  journalistique:
    "Adresse : vous / neutre. Syntaxe : factuelle, attribuée, datée. Marqueurs : « selon », « au {date} », conditionnel pour ce qui n'est pas établi. À éviter : opinion déguisée en fait. Exemple : « Selon {média}, au {date}, trois points sont confirmés. »",
};

/** "Combinaisons types" (playbook §5.3), or null for the middle of the grid. */
export function combinationAdvice(virality: number, pedagogy: number): string | null {
  const highV = virality >= 60;
  const lowV = virality < 40;
  const highP = pedagogy >= 60;
  const lowP = pedagogy < 40;
  if (highV && highP) {
    return "Edutainment : hook de bande V4/V5, contenu P4 découpé en points, chaque point avec son mini-payoff ; format série si la durée est inférieure à 45 s.";
  }
  if (lowV && highP) {
    return "Cours sobre : crédibilité maximale, idéal pour un sujet sensible ou une niche experte.";
  }
  if (highV && lowP) {
    return "Divertissement viral : humour ou réaction, mais avec un apport réel (sinon contenu non original) ; interdit sur un sujet sensible.";
  }
  if (lowV && lowP) {
    return "Ambiance / vlog : contenu de lien avec les abonnés, peu recommandé aux non-abonnés.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// UI labels
// ---------------------------------------------------------------------------

export const TONE_LABELS: Record<Tone, LabelInfo> = {
  expert: { label: "Expert", description: "Précis, termes définis, données à l'appui." },
  decontracte: { label: "Décontracté", description: "Tutoiement, oral, phrases courtes." },
  humoristique: {
    label: "Humoristique",
    description: "Exagération, rupture, chute. Désactivé sur les sujets sensibles.",
  },
  inspirant: { label: "Inspirant", description: "Verbes d'action, images positives, sans promesse irréaliste." },
  provocateur: {
    label: "Provocateur",
    description: "Contre-pied assumé : vise une idée, jamais une personne. Désactivé sur les sujets sensibles.",
  },
  journalistique: { label: "Journalistique", description: "Factuel, attribué, daté (« selon… »)." },
};

export const HOOK_STYLE_LABELS: Record<HookStyle, LabelInfo> = {
  auto: { label: "Automatique", description: "Claude choisit le style le plus adapté à l'angle et à la viralité." },
  question: { label: "Question", description: "« Pourquoi ton forfait augmente alors que tu n'as rien changé ? »" },
  chiffre_choc: {
    label: "Chiffre choc",
    description: "Uniquement avec un chiffre sourcé — sinon Claude choisit un autre style.",
  },
  contre_intuitif: {
    label: "Contre-intuitif",
    description: "« Ranger ton bureau ne te rend pas plus productif. Pas comme tu crois. »",
  },
  story: { label: "In medias res", description: "« 23 h 12, la notif tombe : compte suspendu. »" },
  pov: { label: "POV", description: "« POV : tu découvres que ton appli bancaire te notait depuis le début. »" },
  erreur_courante: { label: "Erreur courante", description: "« Tout le monde lit les sondages à l'envers. »" },
  promesse: {
    label: "Promesse / bénéfice",
    description: "« En 40 secondes, tu comprends enfin la réforme dont tout le monde parle. »",
  },
  polemique_mesuree: {
    label: "Polémique mesurée",
    description: "Vise une idée, jamais une personne : « Je vais dire un truc impopulaire sur… »",
  },
  liste: { label: "Liste", description: "« 3 choses que l'article ne dit pas sur… »" },
};

export const CTA_LABELS: Record<CtaType, LabelInfo> = {
  auto: { label: "Automatique", description: "Le CTA le plus cohérent avec l'angle, placé après le payoff." },
  comment_keyword: {
    label: "Commentaire mot-clé",
    description: "« Commente GUIDE et je t'envoie… » — Instagram peut le classer en appât à engagement.",
  },
  share: { label: "Partage « envoie à… »", description: "Le signal le plus fort pour toucher des non-abonnés." },
  save: { label: "Enregistrement", description: "Idéal pour un tuto, une liste, un contenu pédagogique." },
  follow: { label: "Abonnement", description: "Pour une série ou un format récurrent, avec une raison précise." },
  link_in_bio: { label: "Lien en bio", description: "Vers une source, un outil ou une ressource externe." },
  none: { label: "Aucun", description: "Pas d'appel à l'action : la vidéo se termine sur le payoff." },
};

export const FORMAT_LABELS: Record<VideoFormat, LabelInfo> = {
  face_camera: { label: "Face caméra", description: "Opinion, expertise, storytelling : la confiance passe par le regard." },
  voice_over_broll: { label: "Voix off + B-roll", description: "Explication ou liste illustrée plan par plan." },
  green_screen: {
    label: "Green screen sur article",
    description: "Actu ou debunk : article visible, analyse personnelle au moins 70 % du temps.",
  },
  screen_tutorial: { label: "Tutoriel écran", description: "Conseil pratique ou outil : étapes numérotées, zooms sur les clics." },
};

export const PLATFORM_LABELS: Record<ScriptPlatform, LabelInfo> = {
  instagram_reels: {
    label: "Instagram Reels",
    description: "5 hashtags maximum. Les envois en DM pèsent pour toucher les non-abonnés.",
  },
  tiktok: {
    label: "TikTok",
    description: "Mot-clé dit, écrit et en légende. Plus d'1 min pour le Creator Rewards Program.",
  },
  youtube_shorts: {
    label: "YouTube Shorts",
    description: "1 à 3 hashtags. Au-delà d'1 min, aucune musique ou extrait protégé (Content ID).",
  },
  linkedin: {
    label: "LinkedIn",
    description: "Vidéo native + texte du post : hook dans les 2 premières lignes, 3 hashtags maximum, sous-titres indispensables.",
  },
};

export const PACE_LABELS: Record<SpeakingPace, LabelInfo> = {
  pose: { label: "Posé", description: "≈ 2,2 mots par seconde : explications, sujets sérieux." },
  normal: { label: "Normal", description: "≈ 2,5 mots par seconde (150 mots/min), le débit courant." },
  dynamique: { label: "Dynamique", description: "≈ 2,8 mots par seconde : face caméra rythmé." },
};

export const ANGLE_TYPE_LABELS: Record<AngleType | "custom", string> = {
  pedagogique: "Pédagogique",
  analyse: "Analyse",
  opinion: "Opinion",
  storytelling: "Storytelling",
  humour: "Humour",
  reaction: "Réaction",
  conseil: "Conseil pratique",
  debunk: "Debunk / fact-check",
  coulisses: "Ce que personne ne dit",
  comparaison: "Comparaison",
  custom: "Angle personnalisé",
};

export const DURATION_LABELS: Record<DurationSec, string> = {
  15: "15 s · réaction éclair",
  30: "30 s · format standard",
  45: "45 s · explication",
  60: "60 s · trois points",
  90: "90 s · analyse",
};
