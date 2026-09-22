# Annotations en français

Ce fichier n'existe pas dans le skill d'origine. Il traite le seul vrai point de fragilité de l'adaptation : **les modèles d'image écrivent mal le français.**

Le chinois s'en sortait avec 2 à 8 caractères par annotation, sur des glyphes que le modèle traite comme des formes. Le français impose un alphabet que le modèle croit savoir écrire : il produit des mots plausibles mais faux, des lettres doublées, des accents mal placés ou manquants. Un lecteur francophone repère une faute d'orthographe instantanément — c'est ce qui trahit le plus vite une image générée.

## Règle générale

**Moins d'annotations, plus courtes, plus communes.** Chaque mot supplémentaire est une occasion de faute.

- 5 annotations maximum par image ; 3 est le bon point d'équilibre.
- 1 à 3 mots par annotation. Quatre mots doivent se justifier.
- Préférer le nom seul au groupe verbal : « Rupture » plutôt que « Là ça casse ».
- Préférer les mots fréquents et courts : « Perte » passe mieux que « Déperdition ».

## Accents

C'est ce qui casse le plus souvent.

**Ne jamais retirer un accent pour contourner le problème.** « Entree », « Depart », « Piege » ne sont pas des versions simplifiées : ce sont des fautes, exactement au même titre qu'une lettre doublée. La solution n'est pas de dénaturer le mot, mais d'en choisir un autre.

Par ordre de préférence :

1. **Choisir un synonyme réellement sans accent.** C'est presque toujours possible, et c'est la stratégie la plus fiable : « Entrée » → « Ce qui rentre », « Piège » → « Trou » ou « Fosse », « Résultat » → « Ce qui sort », « Problème » → « Blocage ». Quand aucun synonyme ne convient, supprimer l'annotation et laisser la flèche orange porter le sens.
2. **Accepter l'accent sur un mot très courant et très court** — « Idée », « Créer », « Problème » — puis vérifier caractère par caractère après génération.
3. **Refuser l'accent sur un mot rare ou long.** Le modèle le déformera.

À éviter systématiquement : `ç`, `œ`, `ë`, `ï`, et les accents circonflexes. « Ça », « Cœur », « Coût » sont des pièges. Ne pas écrire « Cout » pour s'en sortir : écrire « Prix ».

## Ponctuation

- Éviter l'apostrophe : « L'entrée » → « Ce qui rentre ».
- Pas de tiret, pas de guillemets, pas de point final.
- La flèche orange remplace « donc », « vers », « ensuite ». Ne pas écrire ces mots.

## Formulation dans le prompt

Lister les annotations une par une, entre guillemets, et exiger une reproduction littérale :

```text
French handwritten labels, reproduce exactly these strings and nothing else:
"Trop plein" / "Tri" / "Ce qui sort" / "Blocage"
Do not invent additional words. Do not translate. Do not add a title.
No Chinese characters anywhere in the image.
```

`reproduce exactly these strings` améliore nettement la fidélité. `Do not invent additional words` évite les étiquettes hallucinées dans les zones vides.

Si une annotation porte un accent, l'isoler dans le prompt pour attirer l'attention du modèle :

```text
One label carries an accent and must be spelled exactly: "Idée"
```

## Après génération

Relire chaque mot de l'image.

1. **Une faute isolée** → retouche locale (voir `modele-prompt.md`, section édition).
2. **Deux fautes ou plus** → régénérer en supprimant une ou deux annotations. Réduire le nombre corrige mieux que réécrire.
3. **Le mot revient systématiquement faux** → le remplacer par un synonyme plus court, ou le supprimer. Si le dessin est bon, l'annotation est souvent superflue.

Une image avec trois mots justes vaut mieux qu'une image avec six mots dont deux sont faux.

## Réservoir d'annotations sûres

Courtes, fréquentes, sans aucun accent — donc écrites correctement telles quelles :

**Noms** — Sortie · Tri · Perte · Blocage · Rupture · Boucle · Vide · Poids · Signal · Bruit · Stock · Reste · Filtre · Passage · Retour · Doute · Preuve · Trou · Fosse · Source · Copie · Version · Trop plein · Angle mort

**Remarques** — Ce qui compte · Ce qui sort · Ce qui rentre · Rien ici · Toujours pareil · Encore · Plus tard · On recommence · Personne ne lit

La seconde colonne montre qu'une annotation peut être une remarque plutôt qu'une étiquette. C'est souvent ce qui rend l'image vivante — et c'est aussi ce qui remplace le mieux les jeux de mots chinois de la version d'origine, intraduisibles.
