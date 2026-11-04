# 0046 — Les glyphes d'interface sont des masques extraits des captures

- Statut : Accepté
- Date : 2026-11-04
- Décideurs : Muhammed Cavus
- Amende : ADR 0036 (§6 marque)

## Contexte et problématique

L'app iOS dessine ses icônes d'interface avec des SF Symbols : maison de la barre d'onglets, loupe, cloche, chevrons, réglages. Ceux de Twitch ont un trait différent, et l'écart se voit à côté des captures de `docs/reference-ui/`. La décision Q4 de `plans/ios-design-fidelite.md` demande les glyphes de Twitch « sans retouche », comme le Glitch de l'ADR 0037.

`docs/brand/` ne contient que le Glitch et l'illustration de l'ADR 0040. Aucun fichier vectoriel officiel n'existe pour les icônes d'interface.

Problématique : d'où viennent les glyphes d'interface, et comment les rend-on sans les redessiner ?

## Facteurs de décision

- **Fidélité** (ADR 0036) : un glyphe redessiné se distingue de celui de la capture.
- **Sans retouche** : comme pour le Glitch, aucun trait n'est dessiné à la main.
- **Provenance** : chaque glyphe remonte à une capture précise.
- **Projet Xcode** : aucune modification des `.xcodeproj`. Seules les ressources d'un paquet SwiftPM sont permises.

## Options envisagées

### Option A — SVG officiels fournis par le décideur

- Avantages : vectoriel et net à toutes les échelles.
- Inconvénients : ces fichiers n'existent pas dans le dépôt.
- **Écartée** pour l'instant. Elle reste la cible si ces fichiers arrivent.

### Option B — Masques extraits des captures @3x

- Avantages : le glyphe est celui de la capture, pixel pour pixel à @3x, et sa provenance est exacte.
- Inconvénients : une résolution figée à @3x et des bords lissés d'origine.
- **Retenue.**

### Option C — Glyphes redessinés en vectoriel d'après les captures

- Avantages : nets à toutes les échelles.
- Inconvénients : c'est une retouche, donc contraire à la décision Q4.
- **Écartée.**

## Décision

### 1. Extraction

Chaque glyphe est découpé dans une capture de `docs/reference-ui/` en pleine résolution (@3x). La découpe suit la boîte du glyphe, plus sa marge visible.

L'opacité de chaque pixel vient de son écart à la couleur de fond relevée autour du glyphe. La couleur du masque est unie. Le traitement n'ajoute, n'efface ni ne déplace aucun pixel.

Une variante pleine et une variante au trait se prennent sur deux captures : l'onglet actif et l'onglet inactif.

### 2. Rangement et provenance

Les masques sont des ressources du paquet `Core/DesignSystem`, déclarées dans `Package.swift`, en PNG @3x. Un manifeste versionné à côté des masques donne pour chacun la capture d'origine et le rectangle de découpe. Un test vérifie que chaque masque a son entrée dans le manifeste, et l'inverse.

### 3. Rendu

Le DesignSystem expose les glyphes par un point d'entrée unique. Ils s'affichent en mode gabarit : leur couleur vient d'un `ColorRole` (ADR 0019), jamais du fichier.

Tant que cet ADR n'est pas accepté, ce point d'entrée rend les SF Symbols. Le passage aux masques se fait ensuite dans une PR à part.

## Conséquences

### Positives

- Les icônes ressemblent à celles des captures.
- Chaque glyphe remonte à une capture et à un rectangle.

### Négatives

- **Écrans @2x** (iPhone SE, XR, 11) : le système réduit le masque @3x, ce qui adoucit un trait de 1 pt. Le glyphe reste lisible mais moins net qu'un SF Symbol.
- **Agrandissement** : le masque ne suit pas le Dynamic Type au-delà de sa taille d'origine sans flou.
- **Dépôt public** : les masques sont des éléments graphiques de Twitch.

### Risques et mitigations

- **Masque retouché par mégarde.** Mitigation : le manifeste permet de refaire l'extraction depuis la capture et de comparer le résultat.
- **Glyphe absent des captures.** Mitigation : l'écran garde son SF Symbol, et l'écart est noté dans la PR. Aucun glyphe n'est inventé.

## Notes d'implémentation

1. Le point d'entrée unique des glyphes dans `Core/DesignSystem` rend les SF Symbols tant que l'ADR est `Proposé`.
2. Après acceptation, une PR ajoute les masques, leur manifeste et leur test, puis fait pointer le point d'entrée vers les masques. Elle commence par la barre d'onglets (`profil/menu-compte--defaut.png` et `accueil/flux-suivis--aucun-live.png`).

## Liens

- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles relevées sur l'app iOS Twitch ; cet ADR amende son §6 pour les glyphes d'interface.
- [ADR 0037](0037-logo-twitch-repris-depuis-le-svg-officiel.md) — le Glitch, repris sans retouche.
- [ADR 0040](0040-illustration-inscription-terminee-reprise-telle-quelle.md) — illustration reprise telle quelle.
- [ADR 0019](0019-package-design-tokens.md) — design tokens.
