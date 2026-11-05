---
paths:
  - "apps/ios/**"
  - "**/*.swift"
  - "packages/design-tokens/tokens/**"
  - "docs/new-reference-ui/**"
  - "docs/reference-ui/**"
---

# Référence UI : l'app iOS Twitch

La référence du design est `docs/new-reference-ui/` : les captures de l'app iOS Twitch prises sur iPhone par l'utilisateur, en 1179×2556 à @3x, interface en français. Les fichiers gardent le nom de l'iPhone (`IMG_96xx.PNG`). L'index [`docs/new-reference-ui/README.md`](../../docs/new-reference-ui/README.md) donne, pour chaque capture, l'écran, l'état et ce qu'elle montre, regroupés par zone, ainsi que la navigation entre les écrans.

`docs/reference-ui/` (index [`docs/reference-ui/README.md`](../../docs/reference-ui/README.md)) sert seulement pour un écran absent de `docs/new-reference-ui/`. Quand un écran figure dans les deux, `docs/new-reference-ui/` fait foi.

## Avant de construire un écran

1. Ouvre l'index de `docs/new-reference-ui/` et repère les captures de la zone concernée. Si l'écran n'y est pas, cherche-le dans l'index de `docs/reference-ui/`.
2. Regarde **toutes** les captures de l'écran, pas seulement l'état par défaut : les états vide, défilé, hors ligne ou feuille ouverte font partie de la référence.
3. Cite les captures suivies dans la PR (`docs/new-reference-ui/IMG_9624.PNG`) : le relecteur compare sur pièces.

## Ce qu'on reprend

Tout, à l'identique (ADR 0036) : structure, hiérarchie, disposition, navigation, enchaînement des étapes, états affichés, libellés, comportements, **et valeurs visuelles** (couleurs, espacements, rayons, typographie).

Une valeur visuelle passe toujours par les design tokens (ADR 0019), via `Core/DesignSystem` (ADR 0010), jamais en dur dans un écran :

1. Cherche le token qui porte déjà la valeur.
2. S'il n'existe pas, mesure-la sur la capture en pleine résolution (1179×2556 à @3x : divise les pixels par 3 pour obtenir des points), puis ajoute-la dans `packages/design-tokens/tokens/` avec la provenance « Relevé sur les captures de l'app iOS Twitch (docs/new-reference-ui/IMG_96xx) », dans les deux thèmes, avec sa paire dans `contrast-pairs.json`.
3. Si la mesure s'écarte de quelques unités d'une valeur de la charte twitch.tv (texte lissé, profil colorimétrique), garde la valeur de la charte et cite la mesure.

Ne se mesurent pas : la barre d'état de l'iPhone (heure, réseau, batterie) et le contenu des tiers (miniatures, avatars, pochettes de catégories).

On ne reprend pas :

- le wordmark Twitch. Le Glitch, lui, est repris depuis le SVG officiel, sans retouche (ADR 0037) ;
- une fonctionnalité hors du périmètre de l'ADR 0021. Un écran présent dans la référence n'entre pas au produit pour autant.

Quand un écran du produit s'écarte de la référence, l'écart se décide avec le développeur : n'invente pas de variante.

## Ajouter une capture

Dépose la capture iPhone dans `docs/new-reference-ui/` sous son nom d'origine (`IMG_xxxx.PNG`) et ajoute sa ligne dans l'index, dans la zone de l'écran, dans le même commit.
