---
name: illustrations-xiaohei-fr
description: Génère des illustrations d'article en français, style croquis manuscrit noir sur fond blanc, autour du personnage Xiaohei. À utiliser quand l'utilisateur demande des visuels, illustrations, schémas, croquis, dessins, images d'illustration, "shot list", propositions de visuels ou retouches d'image pour un article, un billet de blog, une newsletter, un post LinkedIn, une page Notion, une documentation de workflow, une méthodologie, un processus, une structure, un état ou une métaphore. Style par défaut : 16:9, fond blanc pur, trait noir tremblé, quelques annotations manuscrites rouge/orange/bleu en français, épuré mais loufoque.
---

# Illustrations d'article — style Xiaohei, version française

## Positionnement

Concevoir et générer des illustrations 16:9 pour le corps d'un article en français. L'objectif n'est ni l'illustration commerciale, ni l'infographie PowerPoint, ni le dessin animé mignon : il s'agit de transformer un jugement, un processus, une structure, un état ou une métaphore du texte en **un croquis explicatif tracé à la main, épuré, étrange, lisible — mais jamais didactique**.

Le personnage récurrent est **Xiaohei** : petite créature noire pleine, yeux en points blancs, jambes fines, expression vide et sérieuse, occupée à faire très consciencieusement quelque chose d'absurde mais qui tient debout. Xiaohei doit porter l'action centrale de l'image. Jamais figurer à côté en décoration.

## Références à lire

À charger selon le besoin de la tâche, pas toutes d'un coup :

- `references/adn-visuel.md` — ADN du style, couleurs, texte, interdits.
- `references/personnage-xiaohei.md` — silhouette, caractère, répertoire d'actions, interdits.
- `references/motifs-composition.md` — types de structure, fabrication de métaphores originales, règle anti-copie.
- `references/modele-prompt.md` — gabarit de prompt pour une image.
- `references/annotations-francaises.md` — **spécifique à cette adaptation** : comment écrire les annotations en français pour qu'un modèle d'image les rende correctement.
- `references/checklist-qa.md` — contrôle après génération et règles d'itération.
- `assets/examples/` — **facultatif et absent par défaut.** Calibration visuelle basse fréquence uniquement : ne pas ouvrir sans raison, ne jamais recopier les compositions, objets ou annotations. Ces images viennent du skill d'origine et portent des annotations chinoises ; elles ne servent qu'à jauger la densité de trait et le vide, jamais le texte. Pour les récupérer : `git clone https://github.com/helloianneo/ian-xiaohei-illustrations` puis copier `ian-xiaohei-illustrations/assets/examples/` ici.

## Déroulé

### 1. Digérer le texte

Lire l'article, le lien, la page Notion, le fichier Markdown ou la capture fournie. En extraire :

- l'idée directrice ;
- les paragraphes qui portent un basculement de compréhension ;
- ce qui gagne à être expliqué par une image ;
- ce qui ne mérite que du texte.

Ne pas illustrer uniformément. Viser les **ancres cognitives** : le jugement central, les deux points de rupture, la boucle entrée-sortie, un aiguillage, un avant/après, « une matière, plusieurs usages », le chemin de reprise, les pièges classiques, le changement d'état d'un rôle.

### 2. Proposer d'abord une stratégie

Si l'utilisateur demande seulement d'analyser où placer des visuels, livrer une **shot list** avant toute génération. Pour chaque image :

- après quel paragraphe elle se place ;
- son sujet ;
- l'idée qu'elle porte ;
- le type de structure ;
- ce que fait Xiaohei ;
- les éléments suggérés ;
- les annotations françaises proposées.

Par défaut 4 à 8 images. Article court : 1 à 3. Article long : ne pas dépasser 9 sans raison. Assez vaut mieux que trop — le corps de texte n'est pas un album.

### 3. Générer image par image

Si l'utilisateur demande explicitement de générer, ne pas s'arrêter pour confirmation : générer chaque image **séparément** avec l'outil de génération d'images disponible dans la session. Ne jamais assembler plusieurs schémas dans une seule image.

Chaque image ne traite qu'une structure. Le prompt doit contenir :

- illustration d'article 16:9, horizontale ;
- fond blanc pur ;
- trait noir dessiné à la main ;
- quelques annotations manuscrites **en français**, rouge / orange / bleu ;
- beaucoup de vide ;
- Xiaohei en sujet de l'action centrale ;
- interdiction : PowerPoint, illustration commerciale, style enfantin, architecture complexe, titre en haut à gauche ;
- interdiction supplémentaire propre à cette version : **aucun caractère chinois dans l'image**.

Ne pas reproduire les cas passés. Les exemples ne donnent qu'une densité de style et une manière d'impliquer Xiaohei ; ils n'autorisent pas à réutiliser le convoyeur à deux ruptures, Xiaohei tirant un levier, le poisson-matière, la boîte à outils à tampons ou le chemin des pièges — sauf demande explicite de reproduction. Réinventer à chaque fois une métaphore bizarre mais juste, à partir de cet article-là.

### 4. Contrôler et itérer

Après génération, passer `references/checklist-qa.md`. Régénérer ou retoucher en priorité si :

- Xiaohei n'est que décoratif ;
- l'image est trop chargée ;
- elle ressemble à un organigramme ou à une diapositive ;
- il y a trop de texte, ou des fautes d'orthographe ;
- un titre type « Les pièges classiques » / « Workflow » apparaît en haut à gauche ;
- le style devient mignon, enfantin ou rigide ;
- le fond n'est pas blanc et propre ;
- des caractères chinois se sont glissés dans l'image.

### 5. Livrer

Si le travail se fait dans un espace de travail, copier les images finales dans :

```text
assets/<slug-de-l-article>-illustrations/
```

Nommées dans l'ordre :

```text
01-sujet.png
02-sujet.png
```

Conserver les fichiers d'origine ; ne pas écraser des ressources existantes sans demande explicite.

## Forme de la réponse

Avant génération, la stratégie doit être courte et précise. Après génération, livrer :

- combien d'images ont été produites ;
- à quoi sert chacune ;
- le chemin d'enregistrement ;
- lesquelles sont les plus solides, lesquelles sont optionnelles.

Pas de dissertation sur la théorie du style. Les images parlent d'elles-mêmes.

---

*Adaptation française de [ian-xiaohei-illustrations](https://github.com/helloianneo/ian-xiaohei-illustrations) de Ian (helloianneo), sous licence MIT. Voir `NOTICE.md`.*
