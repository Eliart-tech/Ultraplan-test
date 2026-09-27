# Bannière LinkedIn — Maiven

Bannière de profil personnel aux couleurs du site : bleu marine `#253066`,
bleu ciel, accent pêche `#f6d6cf`, typographie Inter.

| Fichier                           | Rôle                                              |
| --------------------------------- | ------------------------------------------------- |
| `banniere-linkedin.png`           | Version sombre, 1584 × 396 (format LinkedIn)      |
| `banniere-linkedin@2x.png`        | Version sombre, 3168 × 792, plus nette sur Retina |
| `banniere-linkedin-clair.png`     | Version claire, 1584 × 396                        |
| `banniere-linkedin-clair@2x.png`  | Version claire, 3168 × 792                        |
| `apercu-profil.png`               | Simulation des deux versions sur un profil        |
| `banniere.html`                   | Source de la bannière (texte, couleurs, mise en page) |
| `apercu.html`                     | Source de la simulation de profil                 |
| `render.mjs`                      | Export PNG avec Playwright                        |

## Mettre en ligne

LinkedIn → votre profil → icône crayon sur la bannière → importer
`banniere-linkedin@2x.png` (ou la version 1584 × 396). Le cadrage proposé par
LinkedIn peut être validé tel quel : le visuel est déjà au bon ratio 4:1.

## Modifier

1. Éditez le texte dans `banniere.html` et ouvrez-la dans un navigateur.
   `banniere.html?theme=clair` affiche la variante claire.
2. `banniere.html?zones=1` superpose les zones masquées par la photo de profil
   (rouge : ordinateur, orange : mobile). Laissez-les vides.
3. Régénérez les PNG : `node brand/linkedin/render.mjs`.
