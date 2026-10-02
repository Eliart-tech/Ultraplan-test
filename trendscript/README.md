# TrendScript

**Des vraies tendances (Google, actualité, Wikipédia, YouTube, Instagram, TikTok) au script de vidéo courte prêt à tourner.**

TrendScript est un outil personnel pour créateur de contenu francophone. En quatre étapes :

1. **Radar** — vous choisissez le pays, la langue, votre niche, vos mots-clés et les sources à interroger. L'application récupère les données réelles de chaque source, en direct.
2. **Sujets** — les signaux sont regroupés en sujets, classés par un score transparent (momentum, portée, présence multi-plateforme, fraîcheur, pertinence pour votre niche), avec les preuves (articles, recherches, vidéos, chiffres) et un niveau de sensibilité.
3. **Angle** — Claude propose trois angles différents par sujet (dont au moins un à valeur durable), ou vous écrivez le vôtre.
4. **Script** — Claude écrit un script complet : trois accroches au choix, découpage seconde par seconde (voix off, texte écran, visuel, montage), texte prompteur, légende, hashtags, appel à l'action, auto-évaluation et **liste des faits à vérifier**. Deux curseurs règlent la **viralité** (emballage : accroche, rythme, émotion, CTA) et la **pédagogie** (fond : densité, structure, preuves) ; la viralité ne modifie jamais les faits.

Tout reste dans votre navigateur (profil, historique) ; le serveur ne stocke rien d'autre qu'un cache mémoire de quelques minutes à quelques heures.

---

## Honnêteté sur les données

**Aucune donnée n'est inventée.** Une source sans clé est affichée « non configurée » et ignorée ; elle n'est jamais remplacée par des exemples. Sans clé Claude, l'analyse fonctionne en **mode sans IA** (regroupement automatique des mêmes données réelles, sans angles) et la génération de script est désactivée avec un message explicite.

Chaque source mesure quelque chose de précis — et seulement ça :

| Source | Accès | Ce qu'elle mesure vraiment | Limites à connaître |
|---|---|---|---|
| **Google Trends — Tendances du moment** | Gratuit, sans clé | Recherches Google en forte hausse dans le pays sur 24 h : volume approximatif (« 20 k+ »), % de hausse, tendance en cours ou terminée, articles liés. | Point d'accès **interne et non documenté** de Google (≈ 100 tendances) : il peut changer sans préavis. Dans ce cas, repli automatique sur le flux RSS officiel, qui ne donne que les **10 tendances les plus récentes** (signalé par un avertissement). Mesure la curiosité, pas la viralité sur les réseaux. |
| **Google Actualités** | Gratuit, sans clé | Articles à la une dans le pays, et articles des 2 derniers jours pour chacun de vos mots-clés. | Mesure la **couverture médiatique**, pas l'audience. Licence des flux RSS Google : **usage personnel et non commercial uniquement** — adapté à un outil personnel, pas à un service commercial. |
| **Wikipédia — articles les plus lus** | Gratuit, sans clé | Articles les plus consultés la veille dans la langue choisie, et leur hausse sur l'avant-veille. | **Un jour de décalage** ; agrégé pour toute la langue (tous pays francophones confondus). |
| **YouTube – chaînes d'actualité (RSS)** | Gratuit, sans clé | Vidéos et Shorts des 72 dernières heures d'une sélection de chaînes d'info françaises (HugoDécrypte, franceinfo, Le Monde, BFMTV, Brut…), avec vues et likes publics. | Montre ce que couvrent **ces** médias, pas ce que regarde tout YouTube. Liste modifiable avec `YOUTUBE_RSS_CHANNELS`. |
| **YouTube (API officielle)** | Gratuit, clé Google | Vidéos et Shorts les plus vus des 7 derniers jours sur vos mots-clés dans votre pays, avec vraies statistiques ; plus le classement « Populaire ». | Quota : **100 recherches par jour** (une analyse en consomme une, mise en cache 6 h). Depuis juillet 2025, « Populaire » ne couvre plus que musique, films et jeux : signal faible pour l'actualité. |
| **SerpApi — Google Trends** | Payant (offre gratuite 250 recherches/mois) | Même liste « Tendances du moment » via un fournisseur sous licence, plus les recherches associées **en forte hausse** sur 7 jours pour vos 3 premiers mots-clés. | Une analyse consomme 1 + 1 par mot-clé (3 max) ; cache 1 h. |
| **Instagram Reels (Apify)** | Payant à l'usage (5 $ de crédit gratuit/mois) | Reels des 30 derniers jours sous vos hashtags de niche, avec vraies vues, likes et commentaires. | **Instagram ne publie aucun classement de reels tendance** (aucune API, officielle ou non) : TrendScript repère les reels qui sortent du lot en comparant leurs vues à celles des autres. Nécessite des mots-clés. Collecte de données publiques par un tiers, hors API officielle (contraire aux conditions d'Instagram ; les pseudos et légendes sont des données personnelles). ≈ 0,26 $ par analyse. |
| **Instagram (API officielle Meta)** | Gratuit, configuration longue | Reels récents des comptes Créateur/Entreprise que vous surveillez, avec vues, likes et **nombre d'abonnés** (repère les reels qui dépassent l'audience de leur auteur). En option : publications populaires de vos hashtags. | La recherche par hashtag exige l'autorisation Meta « Instagram Public Content Access » et ne donne ni vues ni auteur. Jeton à renouveler tous les 60 jours. 30 hashtags différents max par 7 jours. |
| **TikTok (Apify)** | Payant à l'usage (même jeton Apify) | Hashtags tendance du TikTok Creative Center pour votre pays sur 7 jours, et, avec vos mots-clés, les vidéos les plus likées de la semaine. | TikTok n'ouvre pas son API de tendances aux usages commerciaux : données publiques collectées via Apify. ≈ 0,20 à 0,50 $ par analyse. |

Autres limites, en toute transparence :

- **Pas d'historique côté serveur** : le « momentum » est calculé à partir de ce que les sources disent au moment de l'analyse (hausse en %, fraîcheur, vidéos virales), pas à partir de relevés successifs.
- **Claude n'utilise que les signaux fournis** pour former les sujets : il ne doit ni inventer de tendance ni compléter avec ses connaissances. Les sujets sans preuve sont écartés automatiquement.
- **Scripts** : tout chiffre doit venir des preuves ou de la recherche web ; sinon il apparaît dans « Faits à vérifier » avec une confiance « faible » ou sous la forme `{À VÉRIFIER : …}`. Relisez toujours cette liste avant de tourner.
- Les sujets sensibles (drames, politique, justice, santé…) sont signalés ; les réglages du script sont alors bridés (viralité plafonnée, ton journalistique, séquence « ce qu'on sait / ce qu'on ignore »).

---

## Démarrage en local

Prérequis : **Node.js 20.9 ou plus récent** (22 recommandé) et npm.

```bash
cd trendscript
npm install
cp .env.example .env.local   # puis remplissez les clés voulues (toutes facultatives)
npm run dev
```

Ouvrez http://localhost:3000. Sans aucune clé, les sources gratuites (Google Trends, Google Actualités, Wikipédia, chaînes YouTube) fonctionnent déjà, en mode sans IA.

Après toute modification de `.env.local`, **redémarrez** `npm run dev`. La page **Réglages** de l'application montre l'état de chaque source, les variables à définir et les étapes détaillées.

### Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` puis `npm start` | Build et serveur de production |
| `npm run lint` | ESLint (règles Next.js 16 + React Compiler) |
| `npm run typecheck` | Génère les types de routes (`next typegen`) puis `tsc --noEmit` |
| `npm test` | Tests unitaires (Vitest), sans réseau, sur des réponses réelles enregistrées |
| `npm run test:live` | Tests de fumée contre les vraies sources gratuites (réseau requis) |
| `npm run check` | lint + typecheck + tests + build |

---

## Configurer les clés, pas à pas

Toutes les variables sont documentées dans [`.env.example`](./.env.example). Les étapes complètes, tenues à jour, sont aussi affichées dans **Réglages → Sources & clés**.

### Claude (indispensable pour les angles et les scripts)

1. Créez un compte sur https://console.anthropic.com et ajoutez des crédits (facturation à l'usage).
2. **Settings → API Keys → Create Key**, copiez la clé (`sk-ant-…`).
3. `ANTHROPIC_API_KEY=sk-ant-…` dans `.env.local`, redémarrez.
4. Facultatif : `ANTHROPIC_MODEL` pour changer de modèle (défaut : `claude-opus-5-5`).

Coût indicatif : une analyse = un appel (≈ 160 signaux résumés) ; un script = un appel, plus une recherche web si l'option est cochée (plus lent et plus cher, mais faits sourcés et datés).

### SerpApi (Google Trends sous licence)

1. Compte sur https://serpapi.com (offre gratuite : 250 recherches/mois, 50/heure).
2. Copiez la clé sur https://serpapi.com/manage-api-key.
3. `SERPAPI_API_KEY=…`, redémarrez.

### YouTube Data API

1. https://console.cloud.google.com → créez un projet.
2. **API et services → Bibliothèque** → « YouTube Data API v3 » → **Activer**.
3. **API et services → Identifiants → Créer des identifiants → Clé API**.
4. **Restreindre la clé** : uniquement « YouTube Data API v3 » (pas de restriction par site : la clé est utilisée par le serveur).
5. `YOUTUBE_API_KEY=AIza…`, redémarrez.

### Apify (Instagram Reels et TikTok)

1. Compte sur https://apify.com (5 $ de crédit offert chaque mois).
2. https://console.apify.com → **Settings → API & Integrations** → copiez le « Personal API token » (`apify_api_…`).
3. `APIFY_TOKEN=apify_api_…`, redémarrez.
4. Facultatif : `APIFY_MAX_CHARGE_USD` plafonne le coût de chaque exécution (0,50 $ par défaut).

Les sources Apify ont besoin de **mots-clés de niche** (transformés en hashtags pour Instagram).

### Instagram — API officielle Meta (facultatif, gratuit)

Plus long à configurer (compte professionnel relié à une Page Facebook, app Meta, jeton longue durée). Suivez les étapes de **Réglages → Instagram (API officielle Meta)**, puis renseignez `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID` (identifiant `1784…`) et `INSTAGRAM_WATCH_ACCOUNTS` (comptes à surveiller, séparés par des virgules).

---

## Déployer sur Vercel

1. Importez le dépôt dans Vercel (**Add New → Project**).
2. **Root Directory : `trendscript`** (le reste du dépôt est un autre site). Framework : Next.js (détecté). Commandes par défaut.
3. **Settings → Environment Variables** : ajoutez au minimum `APP_PASSWORD` et `AUTH_SECRET` (voir Sécurité), puis les clés voulues. Redéployez après chaque changement de variable.
4. Durée des fonctions : les routes d'analyse et de script déclarent `maxDuration = 300` (5 min), le maximum de l'offre Hobby (jusqu'à 800 s sur Pro). Une analyse avec les sources Apify peut prendre 1 à 2 minutes, un script avec recherche web plusieurs minutes.
5. Le cache est en mémoire, propre à chaque instance : deux analyses identiques à quelques minutes d'intervalle peuvent ne pas partager le cache. Ce n'est qu'une optimisation (quotas, coûts).

Tout hébergeur Node.js (≥ 20.9) convient aussi : `npm run build && npm start`. Derrière nginx, laissez passer le streaming (l'application envoie déjà `X-Accel-Buffering: no`).

---

## Sécurité

- **Mot de passe d'accès** : définissez `APP_PASSWORD` dès que l'application est en ligne. Sans lui, n'importe qui peut lancer des analyses et des scripts **à vos frais** ; l'interface affiche alors un avertissement en production.
- **Sessions** : cookie `ts_session` HttpOnly, `Secure` en production, `SameSite=Lax`, valable 30 jours, signé HMAC-SHA-256 (Web Crypto). Définissez `AUTH_SECRET` (`openssl rand -base64 32`) : sans lui, la clé de signature dérive du mot de passe, ce qui permettrait à quelqu'un qui volerait un cookie de tenter de deviner un mot de passe faible hors ligne.
- **Défense en profondeur** : `src/proxy.ts` redirige vers `/login` (pages) ou répond 401 (API), et **chaque route API revérifie la session** elle-même.
- Comparaisons à temps constant, délai fixe et limitation des tentatives de connexion (10 échecs / 15 min par adresse IP, par instance).
- Les clés ne quittent jamais le serveur : `/api/sources` ne renvoie que des booléens, et les messages d'erreur des sources sont nettoyés de tout jeton.
- Toutes les entrées sont validées (zod) avant traitement ; les réponses de Claude aussi.
- En-têtes de sécurité (`nosniff`, anti-iframe, HSTS, `Referrer-Policy`, `Permissions-Policy`).

---

## Architecture

Next.js 16 (App Router, Turbopack), React 19.2, TypeScript strict, Tailwind CSS 4, zod 4, SDK Anthropic, fast-xml-parser, Vitest.

```
src/
  proxy.ts                  Porte d'entrée : mot de passe (si APP_PASSWORD)
  app/
    page.tsx …              Studio (Radar → Sujets → Angle → Script), Historique, Réglages, Connexion
    api/analyze/            POST, flux SSE : sources → signaux → sujets
    api/script/             POST, flux SSE : recherche → écriture → contrôles
    api/sources/            GET : état de configuration (jamais de secret)
    api/auth/login|logout/  Session
  lib/
    types.ts, schemas.ts    Modèle de données partagé + validation zod
    sse.ts                  Server-Sent Events (serveur + navigateur)
    analysis/               Texte, scoring, sensibilité, regroupement sans IA
    script/                 Niveaux viralité/pédagogie, garde-fous, budget de mots, contrôles, prompt
    server/
      sources/              Un connecteur par source (+ fixtures réelles pour les tests)
      ai/                   Client Claude, playbook éditorial, synthèse des sujets, recherche web, script
      analyze.ts            Orchestration d'une analyse
      auth.ts, cache.ts, http.ts
    client/                 Stockage navigateur, appels API, export Markdown/texte
```

Déroulé d'une analyse (`src/lib/server/analyze.ts`) :

1. Toutes les sources demandées sont interrogées **en parallèle** (2 min 30 max chacune). Chaque résultat est mis en cache selon la source (10 min pour Google, 6 h pour YouTube API et Apify…). Les sources non configurées ou sans mots-clés sont signalées, jamais simulées.
2. Les signaux sont fusionnés et dédoublonnés (même URL, ou même titre dans une même source), puis notés.
3. Avec une clé Claude : les 160 signaux les plus forts (au moins les 25 meilleurs de chaque plateforme) sont envoyés à Claude, qui forme les sujets en citant leurs preuves, juge la pertinence pour votre niche et propose 3 angles. En cas d'échec, repli automatique sur le regroupement sans IA, avec une note.
4. Le navigateur reçoit la progression source par source, puis le résultat.

---

## Comment le score est calculé

Tous les chiffres affichés sont calculés dans le code à partir des métriques réelles (Claude n'évalue que la pertinence pour votre niche) :

- **Force d'un signal** : rang percentile de son audience (volume de recherche, vues) parmi les signaux de la même source, pondéré par sa fraîcheur. Les articles sans audience mesurée sont classés par fraîcheur et position.
- **Momentum** : fraîcheur, présence dans les recherches en forte hausse, pourcentage de hausse, vidéos virales (3× la médiane ou 2× l'audience du compte).
- **Portée** : force des 3 meilleurs signaux du sujet.
- **Multi-plateforme** : nombre de plateformes où le sujet apparaît.
- **Fraîcheur** : demi-vie de 24 h sur le signal le plus récent.
- **Pertinence niche** : évaluée par Claude au regard de votre niche (ou recouvrement de mots-clés en mode sans IA).
- **Score total** : 25 % momentum, 20 % portée, 15 % multi-plateforme, 10 % fraîcheur, 30 % pertinence niche (sans niche : 35 / 30 / 20 / 15).

---

## Feuille de route

- **Multi-utilisateur** : comptes, base de données, historique synchronisé (aujourd'hui : un seul mot de passe, données dans le navigateur).
- **Relevés planifiés** : instantanés réguliers des tendances pour mesurer une vraie accélération dans le temps.
- **Sons tendance Instagram** via l'API officielle `/ig_audio` (Meta, juin 2026).
- **API officielle Google Trends** (alpha sur candidature) pour l'historique des recherches.
- **Fournisseur d'actualités sous licence commerciale**, si l'outil devient un service commercial (les flux Google Actualités ne le permettent pas).
- Sources gratuites supplémentaires (tendances Mastodon/Bluesky francophones).
