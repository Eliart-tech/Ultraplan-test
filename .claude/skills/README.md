# Skills du dépôt

Les dossiers présents ici sont chargés automatiquement par Claude Code dans toute
session ouverte sur ce dépôt — en local comme sur claude.ai/code. Rien à installer.

## illustrations-xiaohei-fr

Génération d'illustrations d'article : 16:9, fond blanc, trait noir manuscrit,
quelques annotations françaises rouge/orange/bleu, autour du personnage Xiaohei.

Adaptation française de
[ian-xiaohei-illustrations](https://github.com/helloianneo/ian-xiaohei-illustrations)
de Ian (helloianneo), sous licence MIT. Voir `illustrations-xiaohei-fr/NOTICE.md`
pour l'attribution et le détail des écarts avec la version d'origine.

Les images de calibration ne sont volontairement pas versionnées ici. Pour les
ajouter en local :

```bash
git clone https://github.com/helloianneo/ian-xiaohei-illustrations /tmp/ixi
cp -R /tmp/ixi/ian-xiaohei-illustrations/assets/examples \
      .claude/skills/illustrations-xiaohei-fr/assets/
```

## Rendre un skill disponible partout, pas seulement sur ce dépôt

Deux options :

**Sur une machine** — copier le dossier dans le répertoire personnel :

```bash
cp -R .claude/skills/illustrations-xiaohei-fr ~/.claude/skills/
```

**Sur le compte Claude, toutes sessions et toutes applications confondues** —
compresser le dossier et le téléverser depuis claude.ai :
Réglages → Capacités → Skills → Téléverser.

```bash
cd .claude/skills && zip -r illustrations-xiaohei-fr.zip illustrations-xiaohei-fr
```
