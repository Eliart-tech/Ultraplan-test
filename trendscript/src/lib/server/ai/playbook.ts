/**
 * The editorial playbook (research/script_playbook.md, October 2026) sliced
 * into prompt material. This text IS the product: it is what turns a trend
 * into a script a French creator can shoot. Edited for prompts — sources and
 * confidence tags removed, rules and French examples kept — and injected
 * slice by slice (topic synthesis: select + risk + angles; script: hooks,
 * retention, one band per slider, one tone, one platform, one format, cta,
 * caption, facts, rubric).
 *
 * Plain strings with no runtime dependency; the per-band rows live in
 * `src/lib/script/levels.ts` (client-safe) and are reused here.
 */

import {
  PEDAGOGY_LEVELS,
  PEDAGOGY_PROMPT_ROWS,
  TONE_LABELS,
  TONE_PROMPT_ROWS,
  VIRALITY_LEVELS,
  VIRALITY_PROMPT_ROWS,
} from "../../script/levels";
import type { ScriptPlatform, Tone, VideoFormat } from "../../types";

const SELECT = `## Choisir un sujet de tendance

### Grille éditoriale (0 à 5 par critère)
- Pertinence niche (×3) : le sujet touche-t-il directement l'audience du créateur ? 0 = aucun lien ; 5 = conséquence directe et concrète pour cette audience.
- Timing (×2) : la fenêtre est-elle encore ouverte ? 0 = pic passé, déclin ; 5 = montée en cours ou événement daté à venir.
- Saturation inverse (×2) : reste-t-il de la place ? 0 = tout le monde dit déjà la même chose ; 5 = peu de vidéos, ou aucune dans la niche du créateur.
- Potentiel d'angle (×2) : existe-t-il un angle que les autres n'ont pas ? 0 = seule la paraphrase est possible ; 5 = angle propre (expertise, local, contre-pied sourcé).
- Partageabilité (×2) : « à qui l'envoie-t-on, avec quel message ? » 0 = aucune réponse ; 5 = évident (« envoie ça à ton coloc qui… »). Les envois en message privé sont un signal majeur pour toucher des non-abonnés.
- Valeur de recherche (×1) : les gens chercheront-ils ce sujet dans 1 à 4 semaines ? 0 = buzz pur ; 5 = requête « comment / pourquoi » durable.
Un sujet faible sur cette grille n'est pas proposé, même s'il est très recherché.

### Durée de vie
- Flash (24–72 h) : tendance de recherche apparue il y a moins de 24 h, encore active, en forte hausse, rafale d'articles. Publier en moins de 24 h, sinon abandonner. Format conseillé : 15–30 s, réaction ou explication éclair, production légère.
- Court (3–21 jours) : événement daté (sortie, match, procès, réforme applicable le X) ou tendance active plusieurs jours. Avant / pendant / après : 2 ou 3 vidéos. Format : 30–60 s, analyse ou conseil.
- Durable : intérêt stable ou saisonnier, requêtes « comment / pourquoi », sujet qui revient chaque année. Publier quand on veut, ressortir la vidéo au retour du pic. Format : 45–90 s, pédagogique, optimisé pour la recherche.

### Lire les données honnêtement
- Le volume Google Trends est une tranche (« 20 k+ »), pas un compte exact ; l'intérêt dans le temps est un indice relatif 0–100. N'écris jamais « 20 000 personnes ont cherché… ».
- Les vues, likes et abonnés sont des instantanés au moment de l'analyse.
- Les articles les plus lus de Wikipédia indiquent une curiosité massive d'hier, pas forcément une actualité.

### Saturation et pont vers la niche
- Test des 10 premiers : si les vidéos les plus vues des dernières 48 h avancent toutes la même thèse, il faut un autre angle ou une autre cible.
- Pont niche : « tendance × niche = qu'est-ce que ça change pour [audience] ? ». Exemple : une panne géante d'une messagerie devient, pour un compte « freelance » : « 3 réflexes pour ne pas perdre un client quand ton outil tombe ».
- Originalité obligatoire : Instagram ne recommande plus aux non-abonnés les comptes qui republient surtout le contenu d'autrui ; TikTok exclut du fil « Pour toi » le contenu réutilisé sans apport créatif. Chaque sujet doit permettre un apport propre : analyse, expérience, synthèse sourcée.`;

const RISK = `## Risques du news-jacking : feu vert / orange / rouge
- Tragédies (attentat, accident, décès, catastrophe) : humour, réaction, opinion et « chiffre choc » = ROUGE (interdits). Factuel utile (« ce qu'on sait / ce qu'on ignore », comment aider, sources officielles) = orange. Aucune spéculation, aucun appel commercial. Une information non vérifiée sur une crise n'est pas recommandée par TikTok.
- Santé : information générale uniquement, jamais de diagnostic ni de traitement. Sources institutionnelles (HAS, ANSM, Santé publique France, OMS). Toujours renvoyer vers un professionnel. La loi influenceurs de 2023 interdit par exemple de promouvoir la chirurgie esthétique ou l'abstention thérapeutique.
- Élections / politique : orange. Pas de pronostic présenté comme un fait. Silence de propagande à partir de la veille du scrutin à minuit, aucun sondage la veille ni le jour du vote. Instagram et Threads ne recommandent pas par défaut le contenu politique aux non-abonnés : portée réduite.
- Mineurs : ROUGE pour identifier un mineur (victime ou mis en cause), montrer son visage, citer son nom ou son école.
- Diffamation / présomption d'innocence : ne jamais imputer un fait non établi. Attribuer (« selon {média}, {date} »), écrire « mis en cause », employer le conditionnel. Pas d'insulte ni de procès d'intention.
- Droit d'auteur : extrait ou green screen = courte citation, source visible, analyse personnelle. Pas de clip ni de musique tiers dans un Short de plus de 60 s.
- IA / deepfake : visuel ou voix réaliste généré par IA = étiquette obligatoire (TikTok, Meta) et mention « Images virtuelles » en cas d'usage commercial.
- Brand safety (orange par défaut) : armes, crime, mort et conflits, drogues, alcool et tabac, sexe, haine, grossièreté, piratage, terrorisme, sujets sociaux clivants, désinformation.
Effet : vert = aucune contrainte. Orange = viralité plafonnée à 39, tons humoristique et provocateur interdits, passage « ce qu'on sait / ce qu'on ignore » obligatoire. Rouge = l'angle ou le traitement n'est jamais proposé.`;

const ANGLES = `## Les 10 angles (valeur du champ « type » entre parenthèses)
Exemple fil rouge, un sujet sûr et daté : le changement d'heure du dimanche 25 octobre 2026.
- Pédagogique / explication (pedagogique) : sujet flou pour le grand public ; durable. « Pourquoi on change encore d'heure en 2026, alors qu'on en annonçait la fin »
- Analyse (analyse) : sujet à enjeux (économie, société). « Changement d'heure : qui y gagne vraiment ? »
- Opinion / prise de position (opinion) : créateur légitime sur le sujet, débat sain. « Je suis pour l'heure d'été toute l'année, et voici mon argument principal »
- Storytelling (storytelling) : sujet qui s'incarne dans une personne ou un vécu. « J'ai passé la semaine du changement d'heure sans réveil. Jour 3 a tout changé »
- Humour (humour) : sujet léger, partagé par tous ; jamais sur un sujet sensible. « Les 5 types de personnes le lundi après le changement d'heure »
- Réaction (reaction) : contenu viral à commenter, avec un apport réel (sinon contenu non original). « Je réagis aux pires conseils pour “bien vivre” le changement d'heure »
- Conseil pratique (conseil) : l'audience doit faire quelque chose ; fort potentiel d'enregistrement. « 3 réglages à faire samedi soir avant le changement d'heure »
- Debunk / fact-check (debunk) : une idée reçue circule et on dispose de sources. « Le changement d'heure fait-il vraiment économiser de l'énergie ? Ce que disent les sources »
- « Ce que personne ne dit » / coulisses (coulisses) : sujet saturé avec un angle mort réel et sourcé. « Ce que personne ne dit sur le changement d'heure : tes objets connectés »
- Comparaison (comparaison) : deux options, deux pays, avant / après. « Heure d'été vs heure d'hiver : laquelle colle à ton horloge biologique ? »
Règle : chaque sujet reçoit 3 angles de types différents, dont au moins 1 à valeur durable (pedagogique, conseil ou debunk) et au plus 1 angle d'opinion.`;

const HOOKS = `## Hooks (0–3 s)
Règles :
- Une seconde pour accrocher. Les vidéos qui performent donnent leur message clé dans les 3 premières secondes ; les plateformes mesurent précisément qui décroche avant 3 s.
- Trois couches synchronisées : (1) mouvement dès la première image, jamais un plan fixe d'intro ni un logo ; (2) texte à l'écran de 7 mots maximum, présent dès la première image, dans la zone sûre ; (3) phrase parlée qui complète ce texte sans le répéter mot pour mot.
- Le mot-clé principal est dit et écrit dans les 5 premières secondes (référencement).
- Promesse tenue : le hook annonce un payoff réellement livré. Un hook trompeur est du clickbait, exclu des recommandations.
- Méthode : écris le hook et la dernière phrase d'abord, puis le milieu. Pour une viralité de 60 ou plus, structure en trois temps : contexte → interjection (« mais… ») → contre-pied.

Taxonomie (texte à l'écran entre crochets ; un {…} ne peut être rempli que par une donnée des sources fournies) :
1. Question : « Pourquoi ton forfait augmente alors que tu n'as rien changé ? » [Forfait plus cher : pourquoi ?] · « Tu sais ce que veut dire la ligne en bas de ta fiche de paie ? »
2. Chiffre choc (uniquement s'il est sourcé) : « {N} € : c'est ce que {population} perd chaque année à cause de {cause}, selon {source}. » [{N} € perdus par an] · « {N} % des {groupe} ignorent cette règle. Toi aussi ? »
3. Contre-intuitif : « Ranger ton bureau ne te rend pas plus productif. Pas comme tu crois. » · « Le meilleur moment pour réserver ton train n'est pas celui que tu penses. »
4. In medias res : « 23 h 12, la notif tombe : compte suspendu. » [Compte suspendu à 23 h] · « J'étais à deux clics de signer quand j'ai vu cette ligne. »
5. POV : « POV : tu découvres que ton appli bancaire te notait depuis le début. » · « POV : t'es manager et l'IA vient d'écrire ton entretien annuel. »
6. Erreur courante : « Tout le monde lit les sondages à l'envers. » · « Si tu écris encore tes mails comme ça, tu perds des réponses. »
7. Promesse / bénéfice : « En 40 secondes, tu comprends enfin la réforme dont tout le monde parle. » · « 3 réglages pour que ton téléphone tienne toute la journée. »
8. Polémique mesurée (on vise une idée, jamais une personne) : « Je vais dire un truc impopulaire sur la semaine de 4 jours. » · « Et si le vrai problème du Black Friday, ce n'était pas les prix ? »
9. « Arrêtez de… » : « Arrêtez de dire que l'IA va remplacer les profs. » · « Arrête de poster à 18 h juste parce qu'on te l'a dit. »
10. Liste : « 3 choses que l'article ne dit pas sur {sujet}. » · « Les 4 signes qu'une info virale est fausse. »`;

const RETENTION = `## Architecture de rétention
- Boucle ouverte : annoncer tôt ce qui sera livré plus tard (« le 3e point est celui que personne n'applique »). Toute boucle ouverte DOIT se refermer avant la fin, sinon c'est du clickbait.
- Rupture de rythme toutes les 3 à 5 secondes : changement de plan, zoom de 110 à 120 %, B-roll, texte animé, effet sonore, capture d'écran, geste. Annote-les dans le montage : [PLAN], [ZOOM], [B-ROLL : …], [TEXTE : …], [SFX].
- Relance à 40–50 % de la durée, puis toutes les 20–25 s au-delà de 60 s : « Mais le plus fou, c'est… », « Sauf que… ».
- Payoff avant le CTA, jamais l'inverse.
- Fin en boucle quand la viralité est de 40 ou plus : la dernière phrase s'enchaîne sur la première. Exemple : la vidéo finit sur « …et c'est exactement pour ça que » et commence par « on change encore d'heure en 2026 ». Le visionnage complet et les revisionnages nourrissent les signaux de temps de visionnage.
- À l'oral : 12 mots maximum par phrase, une idée par phrase, verbes concrets, pas de subordonnées en cascade. On écrit pour l'oreille, pas pour l'œil.`;

const PLATFORMS: Record<ScriptPlatform, string> = {
  instagram_reels: `## Instagram Reels
- Durée : les reels jusqu'à 3 min peuvent être recommandés ; au-delà, plus aux non-abonnés. Sur les comptes de marques en 2026, la tranche 45–60 s obtient les meilleures vues médianes, la tranche 0–30 s les plus faibles (données corrélationnelles).
- Signaux principaux : temps de visionnage, likes rapportés à la portée, envois en message privé rapportés à la portée (ces envois comptent un peu plus pour atteindre des non-abonnés). Meta prédit aussi le visionnage complet, le repartage, le commentaire et l'abonnement.
- Hashtags : 5 au maximum (plafond de la plateforme), peu nombreux et ciblés.
- Recherche : mots-clés dans la légende et les hashtags ; le contenu public des comptes professionnels est indexé par Google et Bing.
- Trial reels : diffusés d'abord aux non-abonnés — utile pour tester deux hooks sur le même sujet.
- Exclus des recommandations : contenu non original ou filigrané, appâts à engagement (« like si… », « commente un emoji »), contenu politique par défaut.`,
  tiktok: `## TikTok
- Durée : le Creator Rewards Program ne rémunère que les vidéos originales de plus d'1 min (originalité, durée de lecture, valeur de recherche, engagement). Si le créateur est monétisé : 61–90 s. Sinon : 20–45 s quand la viralité est élevée.
- Recommandation : le fil « Pour toi » apprend du temps regardé et du visionnage jusqu'au bout, des likes, partages et commentaires, et des recherches récentes.
- Non recommandé : contenu réutilisé sans apport créatif ou avec le filigrane d'un autre, contenu à peine monté, désinformation, information non vérifiée sur une crise ou un grand événement civique. Étiquette IA obligatoire pour une scène ou une personne réaliste générée par IA (une voix de synthèse générique n'en a pas besoin).
- Référencement : mot-clé DIT dans les 5 premières secondes, ÉCRIT à l'écran et dans la légende. Légende de 4 000 caractères maximum.
- Constats des publicités TikTok : message clé dans les 3 premières secondes, tournage vertical, s'adresser à la caméra et texte superposé améliorent le visionnage complet.`,
  youtube_shorts: `## YouTube Shorts
- Durée : jusqu'à 3 min. Un Short de plus d'1 min avec une seule réclamation Content ID active est bloqué partout (ni lecture, ni recommandation, ni monétisation) : aucun extrait ni musique tiers au-delà de 60 s.
- Mesure : chaque lecture ou relecture compte comme une vue ; le panneau « regardée vs balayée » mesure le hook — les meilleurs Shorts gardent 70 à 90 % des spectateurs au-delà de l'accroche.
- Hashtags : 1 à 3, en lien direct avec la vidéo (au-delà de 60, YouTube les ignore tous ; des hashtags hors sujet peuvent entraîner un retrait).
- Titre : 100 caractères maximum, mot-clé principal au début ; le champ « title » sert de titre YouTube.`,
};

const SCREEN_TEXT = `## Texte à l'écran et sous-titres
- Sous-titres incrustés sur toutes les vidéos : une grande partie du public Instagram regarde sans le son, TikTok se regarde plutôt avec le son — on sert les deux.
- Lisibilité (charte du sous-titrage) : 12 caractères pour 1 s affichée, 20 pour 2 s, 36 pour 3 s, 60 pour 4 s ; 2 lignes maximum.
- Zones sûres : laisser libres environ 14 % en haut, 35 % en bas et 6 % sur les côtés (interface de l'application).`;

const FORMATS: Record<VideoFormat, string> = {
  face_camera:
    "Face caméra (opinion, expertise, storytelling ; la confiance) : regard caméra dès la première image, jump cuts annotés, un B-roll toutes les 5 à 8 s pour relancer l'attention.",
  voice_over_broll:
    "Voix off + B-roll (explication, liste, sujet visuel) : un plan B-roll décrit par phrase, budget de mots strict, aucun plan sans lien avec la phrase dite.",
  green_screen:
    "Green screen sur article (actu flash, debunk) : titre, média et date de l'article visibles ; citation courte ; analyse personnelle pendant au moins 70 % du temps (originalité et droit de citation).",
  screen_tutorial:
    "Tutoriel écran (conseil pratique, outil) : étapes numérotées, zooms sur chaque clic, résultat final montré dès le hook.",
};

const CTA = `## CTA : un seul principal, placé après le payoff
- Partage « envoie à… » (envois en message privé, le signal fort pour les non-abonnés) : contenu utile à une personne précise, humour de situation. « Envoie ça à ton pote qui se réveille encore à l'heure d'été. » Désigner un destinataire précis.
- Enregistrement : tutoriel, liste, pédagogie de 60 ou plus. « Enregistre pour samedi soir. » Inutile en viralité 5 ou pédagogie 1.
- Commentaire, question ouverte : opinion, débat, viralité de 40 ou plus. « Toi, tu garderais quelle heure ? »
- Commentaire mot-clé (DM automatique) : offre ou ressource, contenu destiné aux abonnés. « Commente HEURE et je t'envoie le guide. » Instagram déconseille de demander un mot, un chiffre ou un emoji précis : à éviter sur un contenu pensé pour la portée.
- Abonnement : série ou format récurrent, avec une raison précise. « Je décrypte une tendance par jour, abonne-toi pour la suivante. »
- Lien en bio : source, outil ou ressource externe, un seul lien cohérent avec la vidéo. « Le texte officiel est en lien dans ma bio. »
Jamais d'appel mécanique du type « like si… » ou « tague 3 amis » : c'est un appât à engagement pénalisé.`;

const CAPTION = `## Légende et hashtags
1. Ligne 1 (environ 125 caractères visibles sur Instagram, 100–150 sur TikTok) : le hook reformulé + le mot-clé principal.
2. Corps : 1 à 3 phrases de contexte ou de valeur, sans répéter le script.
3. Ligne sources : « Sources : {média}, {date} · {institution}, {date} ».
4. Une question ouverte ou le CTA, identique à celui de la vidéo.
5. Hashtags (dans le champ dédié, pas dans la légende) : Instagram 3–5 (plafond 5), TikTok 3–5, YouTube 1–3. Composition : 1 sujet précis, 1 ou 2 de niche, 1 de format ou de communauté. Pas de hashtags génériques (#fyp, #viral) : aucun effet démontré.
6. Mentions légales : « Publicité » ou « Collaboration commerciale » en tête de légende s'il y a une contrepartie ; « Images retouchées » ou « Images virtuelles » si besoin ; étiquette IA de la plateforme.
7. Le mot-clé principal apparaît à l'oral (avant 5 s), à l'écran et dans la légende.`;

const FACTS = `## Discipline factuelle (non négociable)
1. Aucun chiffre, date, nom, citation ou statistique inventé. Seuls les éléments présents dans les PREUVES, la RECHERCHE WEB ou les TITRES DE PRESSE fournis sont autorisés. Sinon, reformule sans chiffre, ou écris {À VÉRIFIER : ce qu'il faut vérifier}.
2. Attribue à l'oral les faits clés : « selon {média}, le {date} ».
3. Marque l'incertitude : conditionnel, « d'après les premières informations », passage « ce qu'on sait / ce qu'on ignore ».
4. Date les faits par rapport au jour de rédaction : une actualité flash vieillit en quelques heures.
5. Vues, likes, abonnés : ce sont des instantanés ; écris « au moment où j'enregistre » ou « en ce moment », jamais un fait absolu.
6. Google Trends : tranches et indices relatifs, jamais des comptes de personnes.
7. Distingue l'opinion (« je pense que ») du fait.
8. Personnes : présomption d'innocence, aucun nom de mineur ni de victime.
9. Santé, droit, finance : information générale + renvoi vers un professionnel ou une source officielle.
10. Chaque affirmation factuelle du script va dans factsToVerify avec sa source (une URL fournie, recopiée à l'identique) et un niveau de confiance. Le créateur relit et valide : il garde la responsabilité éditoriale.`;

/** The 12 criteria of the self-check (playbook §11), in order. */
export const RUBRIC_CRITERIA = [
  "Hook : mouvement dès la 1re image, texte écran de 7 mots ou moins, sujet clair en 1 s",
  "Promesse tenue : payoff livré avant le CTA, toute boucle ouverte refermée",
  "Budget : voix off = budget de mots ±10 %",
  "Rythme : une rupture annotée toutes les 3–5 s, au moins une relance dès 30 s",
  "Angle unique : apporte ce que les 10 premières vidéos n'apportent pas",
  "Réglages respectés : marqueurs de la bande de viralité, de la bande de pédagogie et du ton",
  "Faits : 100 % des chiffres reliés à une source, incertitudes marquées, faits datés",
  "Risque : aucun élément rouge, contraintes orange appliquées, mentions pub/IA si besoin",
  "Plateforme : durée adaptée, hashtags sous le plafond, compatible Content ID",
  "SEO : mot-clé dit avant 5 s, écrit à l'écran et en ligne 1 de la légende",
  "CTA : un seul CTA principal, cohérent, sans appât à engagement",
  "Sans le son : sous-titres + texte écran suffisent, la fin boucle ou conclut nettement",
] as const;

const RUBRIC = `## Grille qualité (auto-contrôle, 12 points)
${RUBRIC_CRITERIA.map((criterion, i) => `${i + 1}. ${criterion}.`).join("\n")}
Réussite = 12/12, ou un critère non rempli expliqué honnêtement dans son commentaire.`;

const LEVELS = `## Niveaux de VIRALITÉ et de PÉDAGOGIE
Principe : la viralité change la forme, jamais les faits. La viralité règle l'emballage (hook, rythme, émotion, CTA) ; la pédagogie règle le contenu (densité, structure, preuves).

### Viralité
${VIRALITY_LEVELS.map((l) => `- V${l.band} ${l.label} (${l.min}–${l.max}) : ${VIRALITY_PROMPT_ROWS[l.band]}`).join("\n")}

### Pédagogie
${PEDAGOGY_LEVELS.map((l) => `- P${l.band} ${l.label} (${l.min}–${l.max}) : ${PEDAGOGY_PROMPT_ROWS[l.band]}`).join("\n")}`;

const TONES = `## Tons
${(Object.keys(TONE_PROMPT_ROWS) as Tone[]).map((tone) => `- ${TONE_LABELS[tone].label} : ${TONE_PROMPT_ROWS[tone]}`).join("\n")}`;

export const PLAYBOOK = {
  select: SELECT,
  risk: RISK,
  angles: ANGLES,
  hooks: HOOKS,
  retention: RETENTION,
  levels: LEVELS,
  tones: TONES,
  platforms: PLATFORMS,
  screenText: SCREEN_TEXT,
  formats: FORMATS,
  cta: CTA,
  caption: CAPTION,
  facts: FACTS,
  rubric: RUBRIC,
} as const;

export type Playbook = typeof PLAYBOOK;
