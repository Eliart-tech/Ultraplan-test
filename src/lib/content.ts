/**
 * All editorial content lives here so the page components stay purely presentational.
 * Icon names refer to lucide-react exports, resolved in `src/components/ui/icon.tsx`.
 */
import type { IconName } from "@/components/ui/icon";

export const hero = {
  badge: "Agents IA & automatisation pour PME",
  title: "Vos opérations tournent seules.",
  titleAccent: "Vous vous concentrez sur la croissance.",
  subtitle:
    "Maiven conçoit, déploie et opère des agents IA et des automatisations sur mesure qui prennent en charge votre support, votre prospection et votre back-office — 24 h/24, sans embaucher.",
  primaryCta: "Réserver un audit gratuit",
  secondaryCta: "Voir nos cas d'usage",
  proof: [
    { value: "+120", label: "automatisations déployées" },
    { value: "18 h", label: "économisées par semaine et par équipe" },
    { value: "21 j", label: "pour un premier agent en production" },
  ],
};

export const clients = [
  "Novalis",
  "Groupe Ardec",
  "Belveo",
  "Kairos Santé",
  "Atelier Mira",
  "Forsend",
  "Orivia",
  "Lumen Conseil",
];

export const problem = {
  eyebrow: "Le constat",
  title: "Le problème n'est pas le manque d'IA. C'est le manque d'exécution.",
  body: "Les outils existent, les démos impressionnent, et pourtant rien ne tourne en production. Entre un POC qui prend la poussière et un process qui encaisse réellement votre volume, il y a un travail d'ingénierie que la plupart des équipes n'ont pas le temps de mener.",
  pains: [
    {
      icon: "Clock" as IconName,
      title: "Des heures perdues en tâches répétitives",
      body: "Ressaisie, relances, qualification de leads, reporting : vos meilleurs profils passent leurs journées sur ce qu'une machine ferait mieux.",
    },
    {
      icon: "Puzzle" as IconName,
      title: "Des outils qui ne se parlent pas",
      body: "CRM, facturation, support, tableur maison. Chaque intégration manquante devient un copier-coller quotidien et une source d'erreurs.",
    },
    {
      icon: "TrendingDown" as IconName,
      title: "Des POC qui ne passent jamais en production",
      body: "Un prototype convaincant ne survit pas au premier cas limite. Sans garde-fous, supervision et reprise sur erreur, il finit abandonné.",
    },
  ],
};

export const services = {
  eyebrow: "Nos services",
  title: "Quatre façons de mettre l'IA au travail chez vous",
  subtitle:
    "Du agent prêt à brancher au système sur mesure intégré à votre SI. On commence toujours par le cas d'usage qui rapporte le plus vite.",
  items: [
    {
      icon: "Bot" as IconName,
      name: "Agents IA clé en main",
      pitch: "Opérationnels en 48 h",
      body: "Support client, qualification de leads, prise de rendez-vous, FAQ interne. Des agents pré-entraînés que nous connectons à vos données et à vos outils, puis que nous supervisons.",
      bullets: [
        "Branchés sur votre base de connaissances",
        "Escalade vers un humain sur les cas sensibles",
        "Disponibles par chat, e-mail, WhatsApp ou téléphone",
      ],
    },
    {
      icon: "Workflow" as IconName,
      name: "Automatisations sur mesure",
      pitch: "Le cœur de notre métier",
      body: "Nous cartographions vos process, identifions les goulots d'étranglement et construisons les workflows qui les suppriment — avec journalisation, alertes et reprise sur erreur.",
      bullets: [
        "Intégration CRM, ERP, facturation, e-mail",
        "Tests de non-régression sur chaque flux",
        "Documentation et transfert de compétences",
      ],
    },
    {
      icon: "PhoneCall" as IconName,
      name: "Assistants vocaux IA",
      pitch: "Ne ratez plus un appel",
      body: "Un standard qui répond en moins d'une seconde, qualifie l'appel, prend le rendez-vous et renseigne votre CRM. En français naturel, avec votre ton de voix.",
      bullets: [
        "Prise de rendez-vous en direct dans l'agenda",
        "Transcription et résumé de chaque appel",
        "Transfert vers un conseiller quand il le faut",
      ],
    },
    {
      icon: "GraduationCap" as IconName,
      name: "Acculturation & IA interne",
      pitch: "Pour que ça tienne sans nous",
      body: "Formation des équipes, mise en place d'un assistant interne sur vos documents, cadrage de la gouvernance et des règles d'usage. L'autonomie plutôt que la dépendance.",
      bullets: [
        "Ateliers par métier, pas des slides génériques",
        "Assistant interne sur vos documents privés",
        "Charte d'usage et cadrage RGPD",
      ],
    },
  ],
};

export const method = {
  eyebrow: "Notre méthode",
  title: "Du premier appel à la production, en quatre étapes",
  subtitle:
    "Pas de tunnel de six mois. Chaque étape produit quelque chose d'utilisable, et vous décidez si on passe à la suivante.",
  steps: [
    {
      number: "01",
      title: "Audit des opérations",
      duration: "Semaine 1",
      body: "Deux demi-journées avec vos équipes pour cartographier les process, mesurer le temps réellement passé et chiffrer le gain possible. Vous repartez avec la cartographie, que vous travailliez avec nous ou non.",
    },
    {
      number: "02",
      title: "Cadrage et priorisation",
      duration: "Semaine 2",
      body: "On classe les cas d'usage par rapport impact / effort, on choisit le premier chantier et on fixe les critères de réussite chiffrés. Périmètre figé, budget figé.",
    },
    {
      number: "03",
      title: "Construction et mise en production",
      duration: "Semaines 3 à 5",
      body: "Développement, intégration à vos outils, tests sur données réelles, garde-fous et supervision. Vous voyez le système tourner chaque semaine, pas à la livraison finale.",
    },
    {
      number: "04",
      title: "Exploitation et amélioration",
      duration: "En continu",
      body: "Monitoring, correction des cas limites, extension à de nouveaux process. Un point mensuel avec les chiffres réels : volume traité, taux de reprise, heures économisées.",
    },
  ],
};

export const useCases = {
  eyebrow: "Cas d'usage",
  title: "Ce que nos clients ont mis en pilote automatique",
  subtitle:
    "Des chantiers concrets, livrés en quelques semaines, qui se remboursent en général sur le premier trimestre.",
  items: [
    {
      icon: "Headset" as IconName,
      sector: "Support client",
      title: "Réponse de niveau 1 automatisée",
      body: "Un agent traite les demandes récurrentes à partir de votre base de connaissances et n'escalade que ce qui le mérite.",
      metric: "68 % des tickets clos sans intervention humaine",
    },
    {
      icon: "Target" as IconName,
      sector: "Commercial",
      title: "Qualification et relance des leads",
      body: "Chaque formulaire entrant est enrichi, scoré, routé vers le bon commercial et relancé automatiquement s'il reste sans réponse.",
      metric: "Délai de premier contact ramené à 4 minutes",
    },
    {
      icon: "ReceiptText" as IconName,
      sector: "Administratif",
      title: "Traitement des factures fournisseurs",
      body: "Extraction des données depuis les PDF, rapprochement avec les bons de commande, préparation du règlement et signalement des écarts.",
      metric: "12 h de saisie supprimées par mois",
    },
    {
      icon: "Users" as IconName,
      sector: "Ressources humaines",
      title: "Tri et pré-entretien des candidatures",
      body: "Analyse des CV sur vos critères, pré-entretien asynchrone, synthèse structurée pour le manager, réponse envoyée à chaque candidat.",
      metric: "3 semaines gagnées par recrutement",
    },
    {
      icon: "FileBarChart" as IconName,
      sector: "Direction",
      title: "Reporting consolidé automatique",
      body: "Vos données commerciales, financières et opérationnelles agrégées chaque lundi matin, avec les écarts commentés en langage clair.",
      metric: "Comité hebdo préparé en 0 minute",
    },
    {
      icon: "PenLine" as IconName,
      sector: "Marketing",
      title: "Production de contenu à la chaîne",
      body: "Veille sectorielle, rédaction d'un premier jet à votre ligne éditoriale, déclinaison par réseau, validation humaine avant publication.",
      metric: "4× plus de publications, à effectif constant",
    },
  ],
};

export const results = {
  eyebrow: "Résultats",
  title: "Ce que ça change, en chiffres",
  subtitle:
    "Moyennes constatées sur nos douze derniers déploiements, mesurées avant/après sur les mêmes process.",
  stats: [
    { value: "18 h", label: "économisées par semaine", detail: "par équipe équipée" },
    { value: "-41 %", label: "de coût de traitement", detail: "sur les process automatisés" },
    { value: "4 min", label: "de délai de réponse", detail: "contre 9 h en moyenne avant" },
    { value: "21 j", label: "avant la mise en production", detail: "du premier agent" },
  ],
};

export const testimonials = {
  eyebrow: "Témoignages",
  title: "Ils ne reviendraient pas en arrière",
  items: [
    {
      quote:
        "On avait déjà testé trois outils d'IA en interne, sans rien mettre en production. Maiven a cadré un seul cas d'usage, l'a livré en trois semaines, et c'est le seul truc qui tourne encore un an après.",
      author: "Claire Vasseur",
      role: "Directrice des opérations, Novalis",
    },
    {
      quote:
        "Notre standard décroche maintenant en moins d'une seconde, y compris le samedi. On a arrêté de perdre des demandes de devis parce que personne n'était disponible pour répondre.",
      author: "Mehdi Laroussi",
      role: "Gérant, Groupe Ardec",
    },
    {
      quote:
        "Ce qui m'a convaincu, c'est l'audit. Ils sont arrivés avec des chiffres sur notre propre process, pas avec un discours sur l'intelligence artificielle. La décision a été facile à prendre.",
      author: "Sophie Berthier",
      role: "Cofondatrice, Belveo",
    },
  ],
};

export const pricing = {
  eyebrow: "Tarifs",
  title: "Des formules lisibles, sans surprise",
  subtitle:
    "Pas de licence cachée ni de facturation à l'usage opaque. Vous savez ce que vous payez et ce que ça vous rapporte.",
  plans: [
    {
      name: "Démarrage",
      price: "2 400 €",
      period: "puis 490 €/mois",
      description: "Un premier agent en production, supervisé par nos soins.",
      features: [
        "Audit des opérations (2 demi-journées)",
        "1 agent IA déployé et intégré",
        "Connexion à 3 outils existants",
        "Supervision et corrections incluses",
        "Support par e-mail sous 24 h ouvrées",
      ],
      cta: "Réserver un audit",
      highlighted: false,
    },
    {
      name: "Croissance",
      price: "6 900 €",
      period: "puis 1 290 €/mois",
      description: "Le choix de la majorité de nos clients PME.",
      features: [
        "Tout le contenu de Démarrage",
        "Jusqu'à 4 process automatisés",
        "Assistant vocal IA inclus",
        "Intégrations illimitées",
        "Tableau de bord des gains mesurés",
        "Point mensuel avec votre référent",
      ],
      cta: "Réserver un audit",
      highlighted: true,
    },
    {
      name: "Sur mesure",
      price: "Sur devis",
      period: "engagement annuel",
      description: "Pour les organisations multi-sites ou à forte contrainte.",
      features: [
        "Architecture dédiée et hébergement souverain",
        "Traitement de données sensibles (DPA, RGPD)",
        "Environnement de test et de recette",
        "Formation des équipes internes",
        "Astreinte et SLA contractuel",
      ],
      cta: "Parler à un expert",
      highlighted: false,
    },
  ],
  note: "Tarifs hors taxes. L'audit initial est déduit de la prestation si vous nous confiez le chantier.",
};

export const faq = {
  eyebrow: "Questions fréquentes",
  title: "Ce qu'on nous demande avant de signer",
  items: [
    {
      q: "Combien de temps avant de voir un résultat concret ?",
      a: "Comptez trois semaines entre le lancement et le premier agent en production sur un périmètre cadré. L'audit, lui, vous donne une cartographie chiffrée dès la première semaine — vous savez donc très vite si le jeu en vaut la chandelle.",
    },
    {
      q: "Faut-il changer nos outils actuels ?",
      a: "Non, et c'est volontaire. Nous nous branchons sur ce que vous utilisez déjà : CRM, ERP, messagerie, facturation, tableurs. Remplacer un outil qui fonctionne est rarement le meilleur investissement, et ça ralentit tout le projet.",
    },
    {
      q: "Que deviennent nos données ?",
      a: "Elles restent les vôtres. Nous travaillons avec des hébergements situés dans l'Union européenne, nous signons un accord de traitement (DPA), et nous ne les utilisons jamais pour entraîner un modèle. Sur les projets sensibles, nous pouvons déployer sur votre propre infrastructure.",
    },
    {
      q: "Que se passe-t-il si l'agent se trompe ?",
      a: "Chaque système est livré avec des garde-fous : périmètre de réponse limité, seuil de confiance, escalade automatique vers un humain et journalisation complète. Les cas limites remontent dans un tableau de bord et sont corrigés dans le cadre de l'abonnement.",
    },
    {
      q: "Sommes-nous trop petits pour ce type de projet ?",
      a: "Nos clients vont de 5 à 250 personnes. En dessous d'une dizaine de salariés, un seul agent bien choisi suffit souvent — et c'est précisément ce que couvre la formule Démarrage. Si nous estimons que le retour sur investissement n'est pas là, nous vous le disons à l'issue de l'audit.",
    },
    {
      q: "Restons-nous dépendants de votre agence ?",
      a: "Non. Tout ce que nous construisons est documenté et vous appartient. Nous formons vos équipes à l'exploitation courante, et un certain nombre de nos clients finissent par gérer eux-mêmes leurs automatisations. Nous restons alors en appui ponctuel.",
    },
  ],
};

export const finalCta = {
  title: "Et si on regardait ce qui peut tourner sans vous ?",
  subtitle:
    "30 minutes d'échange, sans engagement. Vous repartez avec au moins deux automatisations activables dans le mois, même si nous ne travaillons pas ensemble.",
  primary: "Réserver un audit gratuit",
  secondary: "Écrire à l'équipe",
};
