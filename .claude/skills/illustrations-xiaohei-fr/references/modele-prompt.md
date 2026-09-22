# Gabarit de prompt

Une image à la fois. Remplacer les variables à partir du contenu de l'article. Ne jamais assembler plusieurs schémas dans une même génération.

Le prompt reste rédigé en anglais : c'est la langue que les modèles d'image comprennent le mieux pour les consignes de style. Seules les annotations à dessiner sont en français.

## Génération

```text
Generate one standalone 16:9 horizontal editorial illustration for a French article.

Visual DNA:
Pure white background. Minimalist black hand-drawn line art. Slightly wobbly pen lines. Lots of empty white space. Sparse red/orange/blue handwritten French annotations. Clean absurd product-sketch feeling. No gradients, no shadows, no paper texture, no complex background, no commercial vector style, no PPT infographic look, no cute mascot poster, no children's illustration, no realistic UI.

Recurring character, required:
Xiaohei, a small solid-black absurd creature with white dot eyes, tiny thin legs, blank serious expression, slightly uneven hand-drawn body shape. Xiaohei must perform the core conceptual action, not decorate the scene. Serious, deadpan, slightly bizarre. Not cute.

Theme:
{sujet de l'illustration}

Structure type:
{flux de travail / fragment de système / avant-après / état d'un rôle / métaphore conceptuelle / empilement de méthode / carte et itinéraire / petite bande dessinée}

Core idea:
{l'idée que cette image doit porter}

Composition:
{où est Xiaohei, ce qu'il fait, quels sont les objets principaux, comment circule l'information}

Suggested elements:
{élément 1} / {élément 2} / {élément 3}

French handwritten labels, reproduce exactly these strings and nothing else:
"{annotation 1}" / "{annotation 2}" / "{annotation 3}" / "{annotation 4 facultative}"
Do not invent additional words. Do not translate these labels. Do not add a title.

Color use:
Black for main line art and Xiaohei. Orange for the main flow, path and arrows. Red only for key warnings, problems or results. Blue only for secondary notes, feedback or system state.

Constraints:
One image explains one core structure only. Main subject covers 40%-60% of the canvas. At least 35% blank white space. At most 5 short handwritten French labels. No title in the top-left corner. Never write the structure type on the image. No Chinese characters or any CJK glyphs anywhere in the image. Not a formal diagram, not a course slide, not a dense explainer. Do not copy prior examples; invent a fresh visual metaphor for this specific article. Clear but not instructional, interesting but not childish, strange but clean.
```

## Édition d'une image existante

### Retirer un titre en haut à gauche

```text
Edit the provided image. Remove only the handwritten title "{texte à supprimer}" and its underline from the top-left corner. Fill that area with the same clean white background, matching the surrounding blank paper. Preserve everything else exactly: characters, labels, paths, line style, composition, aspect ratio, and image quality. Do not add any new text or objects.
```

### Corriger une faute d'orthographe

```text
Edit the provided image. The handwritten French label currently reads "{texte errone}". Replace it with exactly "{texte correct}", in the same handwriting style, same color, same position, same size. Change nothing else in the image: no new words, no layout change, no restyling.
```

Si deux corrections ou plus sont nécessaires, régénérer l'image avec moins d'annotations plutôt que d'enchaîner les retouches : chaque passe d'édition dégrade légèrement le reste du dessin.

### Renforcer la présence de Xiaohei

```text
Regenerate this illustration with the same core meaning and the same simple layout, but make Xiaohei more central to the conceptual action. Xiaohei should be doing the strange work that explains the idea, not standing beside the diagram. Keep it clean, sparse, hand-drawn, and not cute.
```

### Alléger une image trop chargée

```text
Regenerate this illustration keeping only the single core action and at most three handwritten French labels. Remove secondary nodes, extra arrows and decorative objects. Increase blank white space to at least half of the canvas. Keep the same hand-drawn black line style and the same character.
```
