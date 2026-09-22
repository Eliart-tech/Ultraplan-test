/**
 * All editorial content for the home page, in the order the sections appear.
 * Page components stay presentational and read everything from here.
 */

export const hero = {
  rating: "4,9",
  ratingOutOf: "/5",
  ratingCaption: "+100 solutions IA déployées",
  titleBefore: "Agents IA",
  titleAfter: "autonomes au service de votre entreprise",
  subtitle:
    "Nous déployons des agents IA et des automatisations qui orchestrent vos opérations.",
  cta: "Réserver un appel",
};

/** Replace with your own client list before publishing. */
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

export const services = {
  eyebrow: "Services",
  title: "Des solutions IA sur mesure pour votre entreprise",
  items: [
    {
      number: "01",
      name: "Agent IA — Plug & Play",
      body: "Nous créons des agents IA spécialisés pour vos fonctions clés : contenu, vente, RH, support… Prêts à déployer, personnalisés et intégrés à vos outils.",
      bullets: [
        "Agents pré-entraînés pour vos fonctions essentielles",
        "Plus rapides et moins chers qu'un salarié",
        "Plug & play sur tous vos outils",
        "Sans code, sans complexité",
        "Évolutifs avec votre croissance",
      ],
      cta: "Obtenir mon agent IA",
      visual: "connect" as const,
      visualTitle: "Se connecte à",
      visualItems: ["Salesforce", "LinkedIn", "HubSpot", "Slack"],
    },
    {
      number: "02",
      name: "Automatisations",
      body: "Des automatisations sur mesure pour gagner du temps, réduire les erreurs et booster vos conversions. Du lead à la livraison, votre activité en pilote automatique.",
      bullets: [
        "Workflows 100 % sur mesure",
        "Processus automatisés de bout en bout",
        "Intégration à vos outils existants",
        "Mise en place et maintenance complètes",
        "Interfaces simples et intuitives",
      ],
      cta: "Automatiser mon activité",
      visual: "flow" as const,
      visualTitle: "Workflow actif",
      visualItems: ["Lead entrant", "Qualification", "CRM", "Relance"],
    },
    {
      number: "03",
      name: "Conseil et audit IA",
      body: "Nous auditons vos opérations, vos outils et votre organisation pour révéler les opportunités IA à fort impact. Objectif : vous aider à optimiser et scaler avec clarté.",
      bullets: [
        "Analyse approfondie de vos workflows",
        "Cartographie des processus de l'entreprise",
        "Diagnostic de vos outils et systèmes",
        "Rapport d'audit stratégique complet",
        "Feuille de route IA sur mesure",
      ],
      cta: "Demander mon audit",
      visual: "report" as const,
      visualTitle: "Rapport d'analyse IA",
      visualCaption: "+30 % de ROI sur les tâches répétitives",
    },
    {
      number: "04",
      name: "Formation IA générative",
      body: "Nous formons vos équipes à maîtriser l'IA générative et à en exploiter tout le potentiel. Objectif : leur permettre de travailler plus intelligemment et plus vite.",
      bullets: [
        "Formation pratique aux outils d'IA générative",
        "Cas d'usage sur mesure pour votre activité",
        "Bonnes pratiques d'efficacité et de créativité",
        "Ateliers pour intégrer l'IA au quotidien",
        "Playbooks et ressources pour une adoption durable",
      ],
      cta: "Réserver ma formation",
      visual: "training" as const,
      visualTitle: "Parcours de formation",
      visualCaption: "+50 h de formation IA",
    },
  ],
};

export const statement = {
  lead: "Maiven déploie des solutions IA",
  rest: "de l'agent plug & play à l'automatisation sur mesure.",
  lead2: "Nous sommes spécialisés",
  rest2:
    "dans les intégrations concrètes, l'automatisation des PME et les systèmes évolutifs",
  tail: "pour devenir AI-first.",
};

export const agents = {
  eyebrow: "Agents IA",
  title: "Des agents IA prêts à travailler",
  cta: "Réserver une démo",
  items: [
    {
      name: "David",
      role: "Commercial IA",
      accent: "#dbe7ff",
      body: "David est votre commercial infatigable. Il contacte, qualifie, gère les objections et garde votre pipeline chaud, 24 h/24.",
      bullets: [
        "Qualifie vos leads par e-mail, LinkedIn ou WhatsApp",
        "Réserve les rendez-vous dans votre agenda",
        "Relance et closing autonome sur les petits deals",
        "Personnalise selon le profil du lead",
        "Met à jour le CRM à chaque échange",
      ],
    },
    {
      name: "Lina",
      role: "Créatrice de contenu IA",
      accent: "#f9e2dc",
      body: "Lina écrit comme une pro et ne rate jamais une échéance. Elle génère du contenu percutant, calé sur votre stratégie et votre ton.",
      bullets: [
        "Rédige posts LinkedIn, légendes Instagram et newsletters",
        "Planifie et tient votre calendrier éditorial",
        "Adapte le message selon le ton et l'audience",
        "Génère des articles à partir de mots-clés ou de briefs",
        "Suggère des accroches et des angles par sujet",
      ],
    },
    {
      name: "Alex",
      role: "Support client IA",
      accent: "#d8f0e6",
      body: "Alex répond à vos clients instantanément, à toute heure. Il résout les problèmes, suit les commandes et rend le support fluide.",
      bullets: [
        "Répond aux questions courantes par chat, WhatsApp ou e-mail",
        "Escalade les cas complexes aux équipes humaines",
        "Suit les commandes et informe les clients en temps réel",
        "Collecte les retours après chaque interaction",
        "Guide les clients avec des instructions claires",
      ],
    },
    {
      name: "Maya",
      role: "Coordinatrice RH IA",
      accent: "#ece1fb",
      body: "Maya fluidifie votre recrutement, votre intégration et vos process RH internes. Candidats comme salariés se sentent toujours accompagnés.",
      bullets: [
        "Trie les CV et classe les candidats par pertinence",
        "Envoie invitations d'entretien et relances",
        "Intègre les nouveaux avec checklists et documents",
        "Répond aux questions RH internes par chat",
        "Collecte les retours salariés via des sondages automatisés",
      ],
    },
    {
      name: "Leo",
      role: "Setter & closer IA",
      accent: "#ffe6cc",
      body: "Leo est votre machine de vente, focalisée sur le début et la fin du tunnel. Il qualifie, réserve, relance et conclut même les deals moyens en autonomie.",
      bullets: [
        "Engage la conversation via LinkedIn, e-mail ou WhatsApp",
        "Qualifie les leads avec des questions pertinentes",
        "Réserve les appels avec votre équipe ou lui-même",
        "Relance au bon moment, avec le bon ton",
        "Gère les objections et conclut sous un seuil défini",
      ],
    },
    {
      name: "Sophia",
      role: "Assistante de direction IA",
      accent: "#cfe9f7",
      body: "Sophia est votre assistante intelligente, discrète et infatigable. Elle synthétise, organise et vous alerte sur l'essentiel.",
      bullets: [
        "Synthétise vos réunions, e-mails et rapports",
        "Prépare vos reportings et points d'équipe",
        "Gère vos tâches et envoie des rappels intelligents",
        "Met en forme vos documents et présentations internes",
        "Fait ressortir les enseignements clés de vos données",
      ],
    },
  ],
};

/**
 * PLACEHOLDERS. These are illustrative, not real clients. Replace every name,
 * handle and quote with genuine, authorised testimonials before publishing:
 * attributing an invented quote to a named person is a legal exposure, not a
 * copywriting shortcut.
 */
export const testimonials = {
  eyebrow: "Témoignages",
  title: "La parole à nos clients",
  items: [
    {
      quote:
        "Lina nous aide à produire du contenu quotidien sur trois plateformes sans équipe dédiée. C'est comme avoir un rédacteur à plein temps qui ne manque jamais d'idées.",
      author: "Nom du client",
      handle: "@entreprise",
    },
    {
      quote:
        "Maiven simplifie l'automatisation IA comme aucune autre approche : plus de scalabilité, moins de coûts, et des opérations quotidiennes optimisées sans effort.",
      author: "Nom du client",
      handle: "@entreprise",
    },
    {
      quote:
        "De l'automatisation des tâches à l'optimisation des workflows, Maiven a rendu notre activité plus efficace que jamais en éliminant le travail manuel.",
      author: "Nom du client",
      handle: "@entreprise",
    },
    {
      quote:
        "Alex gère désormais plus de 70 % de nos demandes clients, plus vite et mieux qu'avant. Notre équipe support ne traite plus que les cas complexes.",
      author: "Nom du client",
      handle: "@entreprise",
    },
    {
      quote:
        "David a transformé notre prospection. Nous sommes passés de relances irrégulières à une machine de vente entièrement automatisée.",
      author: "Nom du client",
      handle: "@entreprise",
    },
    {
      quote:
        "Maiven a transformé notre workflow grâce à l'automatisation IA, nous faisant gagner un temps précieux chaque semaine et améliorant l'efficacité de l'équipe.",
      author: "Nom du client",
      handle: "@entreprise",
    },
  ],
  featured: {
    quote:
      "L'automatisation a transformé notre workflow. C'est intuitif, efficace et hautement personnalisable.",
    author: "Nom du client",
    role: "Fondateur, Entreprise",
  },
};

export const process = {
  eyebrow: "Comment ça marche",
  title: "Comment fonctionnent nos solutions IA",
  steps: [
    {
      title: "Choisir et auditer",
      body: "Vous nous parlez de votre activité. Nous vous associons aux agents IA plug & play les plus pertinents et identifions où l'automatisation sur mesure crée une vraie valeur.",
    },
    {
      title: "Déployer et ajuster",
      body: "Nos agents préconçus s'adaptent rapidement à vos outils, vos workflows et votre ton de voix. Pour vos besoins d'automatisation, nous concevons des workflows sur mesure qui tournent en arrière-plan.",
    },
    {
      title: "Accompagner et scaler",
      body: "Nous veillons à ce que vos agents soient toujours performants et vous aidons à scaler en ajoutant de nouvelles automatisations ou des capacités IA plus avancées au fil du temps.",
    },
  ],
};

export const about = {
  eyebrow: "À propos",
  title: "Découvrez notre parcours d'expertise IA",
  body: "Chez Maiven, nous sommes convaincus que l'IA doit être un moteur de croissance, pas un mot à la mode. Notre mission est simple : aider les entreprises à automatiser, à scaler et à devenir AI-first. Nous bâtissons un écosystème complet alliant implémentation, automatisation et formation, pour que toute entreprise, quelle que soit sa taille, puisse exploiter la puissance de l'IA.",
  cta: "Réserver un appel",
  stats: [
    { value: 50, label: "Agents IA actifs" },
    { value: 100, label: "Automatisations déployées" },
    { value: 33, label: "Clients satisfaits" },
    { value: 47, label: "Décisions pilotées par l'IA" },
  ],
};

export const faq = {
  eyebrow: "FAQ",
  title: "Les réponses à vos questions fréquentes",
  items: [
    {
      q: "Quels types d'agents IA proposez-vous ?",
      a: "Nous proposons des agents IA prêts à l'emploi pour des fonctions précises de votre entreprise : vente, RH, service client, création de contenu et assistance de direction. Chaque agent est personnalisable et s'intègre à vos outils et workflows existants.",
    },
    {
      q: "Faut-il des compétences techniques pour utiliser vos solutions ?",
      a: "Non. Nous prenons en charge l'intégration, la configuration et la maintenance. Vos équipes utilisent des interfaces simples, et nous les formons à l'exploitation courante. Aucune ligne de code n'est requise de votre côté.",
    },
    {
      q: "Puis-je revendre vos agents IA et systèmes d'automatisation ?",
      a: "Oui, sous conditions. Nous proposons un cadre de partenariat pour les agences et les intégrateurs qui souhaitent déployer nos agents chez leurs propres clients. Contactez-nous pour en discuter.",
    },
    {
      q: "Combien de temps faut-il pour déployer un agent IA ou une automatisation ?",
      a: "Un agent plug & play est opérationnel en 48 à 72 heures. Une automatisation sur mesure demande généralement deux à quatre semaines entre le cadrage et la mise en production, selon le nombre d'outils à connecter.",
    },
    {
      q: "Que deviennent nos données ?",
      a: "Elles restent les vôtres. Nous travaillons avec des hébergements situés dans l'Union européenne, nous signons un accord de traitement (DPA) et nous ne les utilisons jamais pour entraîner un modèle. Sur les projets sensibles, nous pouvons déployer sur votre propre infrastructure.",
    },
  ],
};

export const finalCta = {
  title: "Devenez une entreprise AI-first avec Maiven",
  cta: "Réserver un appel",
};
