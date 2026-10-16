---
paths:
  - "apps/ios/**"
  - "**/*.swift"
  - "packages/design-tokens/tokens/**"
  - "docs/reference-ui/**"
---

# Référence UI : l'app iOS Twitch

Les captures de l'app iOS Twitch (mars 2025) sont dans `docs/reference-ui/`, rangées par zone. L'index [`docs/reference-ui/README.md`](../../docs/reference-ui/README.md) donne, pour chaque capture, l'écran, l'état et ce qu'elle montre.

## Avant de construire un écran

1. Ouvre l'index et repère les captures de la zone concernée.
2. Regarde **toutes** les captures de l'écran, pas seulement `defaut` : les états `vide`, `chargement`, `erreur`, `clavier-ouvert` ou `menu-ouvert` font partie de la référence.
3. Cite les captures suivies dans la PR (`docs/reference-ui/chat/…`) : le relecteur compare sur pièces.

## Ce qu'on reprend

Tout, à l'identique (ADR 0036) : structure, hiérarchie, disposition, navigation, enchaînement des étapes, états affichés, comportements, **et valeurs visuelles** (couleurs, espacements, rayons, typographie).

Une valeur visuelle passe toujours par les design tokens (ADR 0019), via `Core/DesignSystem` (ADR 0010), jamais en dur dans un écran :

1. Cherche le token qui porte déjà la valeur.
2. S'il n'existe pas, mesure-la sur la capture en pleine résolution (1179×2676, soit @3x : divise les pixels par 3 pour obtenir des points), puis ajoute-la dans `packages/design-tokens/tokens/` avec la provenance « Relevé sur les captures de l'app iOS Twitch (docs/reference-ui/) », dans les deux thèmes, avec sa paire dans `contrast-pairs.json`.
3. Si la mesure s'écarte de quelques unités d'une valeur de la charte twitch.tv (texte lissé, profil colorimétrique), garde la valeur de la charte et cite la mesure.

Ne se mesure pas : la barre « curated by Mobbin » en bas de chaque capture, qui ne fait pas partie de l'app.

On ne reprend pas :

- le wordmark Twitch. Le Glitch, lui, est repris depuis le SVG officiel, sans retouche (ADR 0037) ;
- une fonctionnalité hors du périmètre de l'ADR 0021. Un écran présent dans la référence n'entre pas au produit pour autant.

Quand un écran du produit s'écarte de la référence, l'écart se décide avec le développeur : n'invente pas de variante.

## Ajouter une capture

Nom : `docs/reference-ui/<zone>/<ecran>--<etat>.png`, en minuscules, kebab-case, sans accents. Un même écran garde le même `<ecran>` d'une zone à l'autre ; deux variantes du même état prennent `-2`, `-3`. Ajoute sa ligne dans l'index, dans le même commit.
