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

Chaque avertissement de source indique la date et l'heure de l'instantané. Pour un autre pays que la France, l'instantané Google Trends / Google Actualités n'est pas utilisé (seules les données en direct le sont) ; Wikipédia et YouTube suivent les mêmes règles de langue que la version serveur. Aucune donnée n'est inventée ni retouchée : une source dont la capture a échoué est signalée comme manquante.

## Les capacités claude.ai utilisées

- **`sample` — Claude sur votre compte claude.ai.** Regroupement des signaux en sujets avec 3 angles, puis écriture du script : mêmes consignes, même schéma de sortie, même validation (zod) et mêmes contrôles que la version serveur. La consigne de format JSON est ajoutée au message (pas de « structured outputs » ici). La première analyse vous demande l'autorisation ; sans Claude (fichier ouvert hors de claude.ai, accès refusé), l'analyse passe en mode sans IA (regroupement automatique) et la génération de script répond « indisponible », comme le serveur sans clé.
- **`mcp` — votre connecteur Firecrawl.** `firecrawl_scrape` lit les flux RSS Google (1 crédit par flux : au plus 1 flux Tendances + 1 flux « À la une » + 8 flux de mots-clés par analyse, résultats gardés 10 minutes) ; `firecrawl_search` sert à la recherche web de vérification des faits (5 recherches au maximum par script, Claude n'utilise que les URL réellement renvoyées). Aucun appel n'est fait au chargement : uniquement sur « Analyser » et « Générer ».
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
| `src/export-shim.ts` | `downloadFile` via la capacité `downloads`, repli presse-papiers |
| `src/anthropic-stub.ts` | Remplace le SDK Anthropic dans le bundle (jamais appelé ici) |

Adaptations faites au moment du build (sans modifier `src/`) : l'avertissement « accès non protégé » de l'en-tête (`APP_PASSWORD`) est désactivé — il n'y a pas de serveur à protéger.

## Limites

- Wikipédia et YouTube ne sont pas lus en direct (seul Firecrawl est disponible comme accès réseau dans claude.ai, et ces sources ne sont pas branchées dessus) : leur instantané vieillit, relancez `npm run artifact:snapshot` puis `npm run artifact:build` pour le rafraîchir.
- Les miniatures des vidéos et articles viennent de domaines bloqués par claude.ai : l'interface affiche l'icône de la plateforme à la place.
- Le texte de l'interface qui parle de clés (`ANTHROPIC_API_KEY`, `APP_PASSWORD`…) décrit la version serveur ; le bandeau en haut de la page résume ce qui s'applique ici.
- Ouvert hors de claude.ai (fichier local), la page fonctionne en mode sans IA, sur l'instantané seul.
