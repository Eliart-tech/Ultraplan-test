# TrendScript — édition HTML

Un seul fichier, `dist/trendscript.html`, qui fait tourner **la vraie interface de TrendScript** (Studio en 4 étapes, Historique, Réglages) directement dans claude.ai, sans rien installer : publié comme Artifact, il s'ouvre dans le navigateur et utilise votre compte claude.ai.

Ce n'est pas une maquette : les composants React de l'application sont réutilisés tels quels, et le « serveur » (connecteurs, score, regroupement, pipeline Claude, contrôles du script) est le même code que celui de la version Next.js, exécuté dans la page.

## Ce qui est réel, ce qui est en direct

| Source | Dans l'édition HTML |
| --- | --- |
| Google Trends — Tendances du moment | **Instantané réel** (liste complète, ~100+ tendances, capturée en France) **+ les 10 tendances les plus récentes en direct** (flux RSS officiel lu par votre connecteur Firecrawl ; en cas de doublon, la donnée en direct l'emporte) |
| Google Actualités | **En direct** via votre connecteur Firecrawl (à la une + un flux par mot-clé de niche) ; sans Firecrawl, articles à la une de l'instantané (et pas de recherche par mots-clés) |
| Wikipédia — articles les plus lus | Instantané réel (français) |
| YouTube — chaînes d'actualité (RSS) | Instantané réel |
| YouTube API, Instagram (Meta, Apify), TikTok (Apify), SerpApi | **Non configurées**, exactement comme un serveur sans clés : elles nécessitent la version serveur (clés API côté serveur, voir `../README.md`) |

Chaque avertissement de source indique la date et l'heure de l'instantané (heure de Paris). À l'étape Sujets, un encadré qu'on ne peut pas masquer donne la date de l'instantané et son âge, et une pastille « Instantané du … » accompagne le nombre de signaux. Quand l'instantané a plus de 48 h au moment de l'analyse, les sujets sans aucune donnée en direct sont datés : « Pourquoi maintenant » commence par « Au moment de l'instantané du … » et le badge de timing devient « Flash (à l'instantané) », sans le conseil « publiez aujourd'hui » ; si tous les sujets sont dans ce cas, le titre de l'étape devient « Les sujets qui montaient le … ». Pour un autre pays que la France, l'instantané Google Trends / Google Actualités n'est pas utilisé (seules les données en direct le sont) ; Wikipédia et YouTube suivent les mêmes règles de langue que la version serveur. Aucune donnée n'est inventée ni retouchée : une source dont la capture a échoué est signalée comme manquante.

## Les capacités claude.ai utilisées

- **`sample` — Claude sur votre compte claude.ai.** Regroupement des signaux en sujets avec 3 angles, puis écriture du script : mêmes consignes, même schéma de sortie, même validation (zod) et mêmes contrôles que la version serveur. La consigne de format JSON est ajoutée au message (pas de « structured outputs » ici). La première analyse vous demande l'autorisation ; sans Claude (fichier ouvert hors de claude.ai, accès refusé), l'analyse passe en mode sans IA (regroupement automatique) et la génération de script répond « indisponible », comme le serveur sans clé.
- **`mcp` — votre connecteur Firecrawl.** `firecrawl_scrape` lit les flux RSS Google (1 crédit par flux : au plus 1 flux Tendances + 1 flux « À la une » + 8 flux de mots-clés par analyse, **+ 1 flux Google Actualités par script** pour les titres de presse récents sur le sujet, même sans recherche web ; résultats gardés 10 minutes) ; `firecrawl_search` sert à la recherche web de vérification des faits (5 recherches au maximum par script, Claude n'utilise que les URL réellement renvoyées). Au chargement, la page appelle seulement `listTools("Firecrawl")`, gratuit et sans demande d'autorisation : s'il montre que Firecrawl n'est pas connecté, la page le dit tout de suite. Tant qu'aucun appel n'a abouti, la page écrit « en direct si votre connecteur Firecrawl est connecté », jamais « en direct » tout court. Les appels payants ne partent que sur « Analyser » et « Générer ».
- **`downloads` — exports.** « Exporter .md / .txt » et l'export JSON de l'historique passent par la boîte d'enregistrement de claude.ai ; à défaut, le contenu est copié dans le presse-papiers avec un message.

Le profil, l'historique et le brouillon du Studio restent dans le stockage de votre navigateur (comme dans la version serveur).

## Reconstruire

Depuis le dossier `trendscript/` :

```bash
npm run artifact:snapshot   # capture un nouvel instantané réel (France, fr) dans artifact/snapshot.json
npm run artifact:build      # construit artifact/dist/trendscript.html
```

- `capture-snapshot.ts` appelle les connecteurs serveur (Google Trends par la liste complète, Google Actualités à la une, Wikipédia, YouTube RSS) depuis Node, puis écrit `snapshot.json` tel quel.
- `build.mjs` compile le CSS Tailwind v4 de l'application (`src/app/globals.css`, mêmes sources de classes), regroupe `src/main.tsx` avec esbuild et insère tout — script, styles, instantané — dans un seul fichier conforme au contrat des Artifacts (pas de balises `<html>/<head>/<body>`, `<title>` en tête, police Inter depuis Google Fonts).

## Comment c'est branché

| Fichier | Rôle |
| --- | --- |
| `src/main.tsx` | Remplace la mise en page racine de Next : en-tête, bandeau de l'édition, page de la route (`#studio`, `#historique`, `#reglages`), pied de page |
| `src/fake-server.ts` | Enveloppe `window.fetch` : `/api/sources`, `/api/analyze`, `/api/script` sont servis dans la page par `runAnalysis` / `generateScript` (validation zod et flux SSE identiques) ; les flux RSS Google passent par Firecrawl |
| `src/connectors.ts` | Connecteurs de l'édition (instantané + direct), sur les mêmes analyseurs que le serveur |
| `src/sample-client.ts` | Le sous-ensemble du SDK Anthropic utilisé par le pipeline (`beta.messages.stream` → `sample`) |
| `src/research.ts` | Vérification des faits : Claude + outil `web_search` (Firecrawl) |
| `src/next-link.tsx`, `src/next-navigation.ts`, `src/router.ts` | `next/link` et `next/navigation` sur des routes en `#` (les paramètres `?script=` restent en mémoire) |
| `src/export-shim.ts` | `downloadFile` via la capacité `downloads` (attend la réponse de `use()` si elle n'est pas encore arrivée), repli presse-papiers |
| `src/edition-text.ts`, `src/edition-ui.tsx` | Textes de l'édition (Claude refusé / absent, Firecrawl en direct ou non) et composants insérés dans l'interface au build (datation de l'instantané à l'étape Sujets, note de Réglages) |
| `src/settings/` | Carte Claude et section confidentialité propres à l'édition |
| `src/anthropic-stub.ts` | Remplace le SDK Anthropic dans le bundle (jamais appelé ici) |

Adaptations faites au moment du build, sans modifier `src/` (`build.mjs` → `EDITION_PATCHES`, chaque texte remplacé est vérifié : si le composant change, le build échoue) :

- tous les textes qui demandent d'ajouter `ANTHROPIC_API_KEY` ou de redémarrer (en-tête, Radar, Sujets, Angle, Script) disent ce qui s'applique ici : accès à Claude refusé (rechargez et acceptez), Claude non disponible dans cette vue ou pour ce compte, ou page ouverte hors de claude.ai (`src/edition-text.ts`, `src/edition-ui.tsx`) ;
- Réglages : la carte Claude (`src/settings/claude-card.tsx`) et la section confidentialité (`src/settings/privacy-section.tsx`) sont remplacées par des versions propres à l'édition (abonnement claude.ai, crédits Firecrawl, pas de serveur ni de cookie) ; la tuile « Accès », la carte « Protection par mot de passe » et l'avertissement « accès non protégé » sont retirés ; la note de l'édition suit l'état réel de Claude et de Firecrawl ;
- Historique : l'annonce « téléchargé » destinée aux lecteurs d'écran est retirée, le message de l'édition (enregistré, copié ou annulé) l'annonce à la place.

## Limites

- Wikipédia et YouTube ne sont pas lus en direct (seul Firecrawl est disponible comme accès réseau dans claude.ai, et ces sources ne sont pas branchées dessus) : leur instantané vieillit, relancez `npm run artifact:snapshot` puis `npm run artifact:build` pour le rafraîchir.
- Les miniatures des vidéos et articles viennent de domaines bloqués par claude.ai : l'édition ne les demande pas et affiche l'icône de la plateforme.
- Les sources « à configurer » (YouTube API, Instagram, TikTok, SerpApi) et leurs étapes avec des clés décrivent la version serveur.
- Ouvert hors de claude.ai (fichier local), la page fonctionne en mode sans IA, sur l'instantané seul.
