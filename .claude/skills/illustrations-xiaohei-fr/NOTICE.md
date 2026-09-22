# Notice et attribution

Ce skill est une **adaptation française** de [Ian Xiaohei Illustrations](https://github.com/helloianneo/ian-xiaohei-illustrations), créé par **Ian (helloianneo)** et publié sous licence MIT. Le fichier `LICENSE` d'origine est conservé ici.

Le personnage récurrent « Xiaohei » (小黑) fait partie du langage visuel de Ian. L'adaptation conserve le nom du personnage, l'ADN visuel et la méthode ; conformément à la notice d'origine, l'attribution à Ian est maintenue.

Liens de l'auteur :

- GitHub : <https://github.com/helloianneo>
- Site : <https://www.ianneo.xyz/opc>
- X : <https://x.com/ianneo_ai>

## Ce que l'adaptation modifie

- **Langue des consignes** : l'intégralité du `SKILL.md` et des références est passée du chinois au français.
- **Langue des annotations dessinées** : les étiquettes manuscrites dans les images sont en français, plus en chinois.
- **Nouveau fichier `references/annotations-francaises.md`** : sans équivalent en amont. Il traite la fragilité propre au français — orthographe et accentuation rendues par les modèles d'image — et fournit un réservoir d'annotations courtes vérifiées sans accent.
- **Contrainte ajoutée** : interdiction explicite de tout glyphe CJK dans l'image, et romanisation de « Xiaohei » dans les prompts pour éviter que le modèle ne recopie les idéogrammes sur le dessin.
- **Contrôle qualité étendu** : la checklist inclut désormais la vérification orthographique mot à mot.
- **Retiré** : `agents/openai.yaml`, spécifique à Codex et sans effet ici.
- **Inchangé** : les images de `assets/examples/`, qui restent les originaux de Ian. Elles servent uniquement à calibrer la densité de trait et le vide — leurs annotations sont en chinois et ne doivent pas être reprises.

## Skill d'origine

La version chinoise reste installée en parallèle sous le nom `ian-xiaohei-illustrations` et fonctionne pour les articles en chinois.
