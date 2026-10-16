# 0036 — Les valeurs visuelles reprennent l'app iOS Twitch, relevées sur captures

- Statut : Accepté — §6 remplacé pour le Glitch par [0037](0037-logo-twitch-repris-depuis-le-svg-officiel.md)
- Date : 2026-10-15
- Décideurs : Muhammed Cavus
- Amende : ADR 0019 (§9 provenance des valeurs, §10 contrepartie 2)

## Contexte et problématique

L'ADR 0019 tire ses valeurs de la charte de twitch.tv, le site web, et de conventions : palettes neutres construites par luminance, espacements sur une grille 8 pt, text styles iOS. Le produit n'a pourtant qu'un client, l'app iOS (ADR 0030).

`docs/reference-ui/` contient 218 captures de l'app iOS Twitch (mars 2025). Les mesures faites sur ces captures divergent des tokens sur trois points :

- le texte secondaire est gris (`#53535f` en clair, `#adadb8` en sombre), pas violet ;
- le fond des boutons d'action est `#9147ff` dans les deux thèmes, pas `#5c16c5` en clair ;
- les champs et boutons secondaires ont leur propre surface (`#e8e7ea` en clair, `#29282f` en sombre), et la marge latérale des écrans est de 16 pt.

Problématique : l'app reprend-elle le design de l'app iOS Twitch à l'identique, valeurs visuelles comprises, ou seulement sa structure ?

## Facteurs de décision

- **Objet du cours** : un clone de Twitch, jugé sur sa ressemblance avec l'original.
- **Une source mesurable** : une capture se mesure au pixel, une convention se discute.
- **Garde-fous de l'ADR 0019** : contraste vérifié au build, deux thèmes complets, aucune valeur en dur dans les écrans.

## Options envisagées

### Option A — Structure seulement, valeurs par convention

Les captures guident la disposition ; les tokens gardent leurs conventions.

- Avantages : aucun token ne change.
- Inconvénients : l'app ressemble à Twitch sans en avoir les couleurs ; le texte secondaire violet n'existe pas dans l'app iOS.
- **Écartée** : le clone s'écarte de l'original là où il est le plus visible.

### Option B — Structure et valeurs visuelles, relevées sur captures

Les captures font foi pour la structure comme pour les valeurs, et chaque valeur relevée passe par un token.

- Avantages : ressemblance au pixel ; chaque valeur est traçable jusqu'à une capture.
- Inconvénients : les tokens suivent une app figée en mars 2025.
- **Retenue.**

## Décision

### 1. Source des valeurs

Les valeurs visuelles de l'app (couleurs, espacements, rayons, typographie) reprennent l'app iOS Twitch, relevées sur `docs/reference-ui/`.

### 2. Passage par les tokens

Une valeur relevée entre dans `packages/design-tokens/tokens/` avec la provenance « Relevé sur les captures de l'app iOS Twitch (docs/reference-ui/) ». Un écran n'écrit jamais en dur une valeur lue sur une capture.

### 3. Mesure et charte

Quand une valeur de la charte twitch.tv et une mesure sur capture diffèrent de quelques unités (lissage du texte, conversion de profil colorimétrique), la valeur de la charte est retenue et la mesure est citée dans `$description`.

### 4. Contraste

Le contrôle de contraste de l'ADR 0019 §4 garde le dernier mot : une valeur relevée qui échoue à sa paire ne passe pas le build.

### 5. Besoin d'un token

La contrepartie 2 de l'ADR 0019 §10 (un token par écran réel) admet comme besoin un rôle présent sur la plupart des captures, avant le premier écran qui l'utilise.

### 6. Marque

Le logo et le wordmark Twitch ne sont pas repris.

## Conséquences

### Positives

- L'app ressemble à Twitch au pixel, et chaque valeur est traçable jusqu'à une capture.
- Les tokens s'alignent sur l'app iOS : texte secondaire gris, boutons `#9147ff` dans les deux thèmes, `color.surface.secondary`, `color.text.link`, `spacing.x16`.

### Négatives

- Une mise à jour de l'app Twitch ne se répercute pas : les captures datent de mars 2025.
- Le texte lissé ne donne pas la couleur exacte : certaines valeurs reposent sur la charte twitch.tv, recoupée par la mesure.

### Risques et mitigations

- **Mesurer la barre Mobbin.** Le bas de chaque capture porte la barre « curated by Mobbin », qui ne fait pas partie de l'app. Mitigation : `docs/reference-ui/README.md` et `.claude/rules/reference-ui.md` la signalent.
- **Une valeur relevée qui échoue au contraste.** Mitigation : §4, le build échoue.

## Notes d'implémentation

Valeurs introduites ou modifiées avec cet ADR :

| Token                     | Clair     | Sombre    |
| ------------------------- | --------- | --------- |
| `color.text.secondary`    | `#53535f` | `#adadb8` |
| `color.text.link`         | `#5c16c5` | `#bf94ff` |
| `color.surface.secondary` | `#e8e7ea` | `#29282f` |
| `color.accent.default`    | `#9147ff` | `#9147ff` |
| `color.accent.fallback`   | `#9147ff` | `#9147ff` |
| `spacing.x16`             | 16 pt     | 16 pt     |

Les rayons mesurés (boutons et champs ≈ 6 pt, bouton de création en pilule) correspondent déjà à `radius.lg` et `radius.pill`.

## Liens

- [ADR 0019](0019-package-design-tokens.md) — package de design tokens, dont cet ADR amende la provenance des valeurs.
- [ADR 0030](0030-pas-de-client-web-app-ios-seul-client.md) — l'app iOS est le seul client, d'où le choix de l'app iOS comme référence.
- [`docs/reference-ui/README.md`](../reference-ui/README.md) — index des captures.
