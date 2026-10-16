# 0037 — Le logo Twitch est repris, depuis le SVG officiel du brand kit

- Statut : Accepté
- Date : 2026-10-16
- Décideurs : Muhammed Cavus
- Amende : ADR 0036 (§6 marque)

## Contexte et problématique

L'ADR 0036 reprend les valeurs visuelles de l'app iOS Twitch, mais son §6 exclut le logo et le wordmark Twitch. L'app a besoin d'un écran de lancement : fond violet `#9147ff` (token `color.accent.default`), logo au centre, animé. Sur les captures de `docs/reference-ui/`, c'est le Glitch, la bulle de chat violette, qui identifie l'app.

Problématique : l'écran de lancement montre-t-il le logo Twitch, et d'où vient son tracé ?

## Facteurs de décision

- **Objet du cours** : un clone de Twitch, jugé sur sa ressemblance avec l'original (ADR 0036).
- **Fidélité du tracé** : un logo redessiné à la main se voit au premier coup d'œil.
- **Dépôt public** : le logo est une marque déposée, sa provenance doit être traçable.

## Options envisagées

### Option A — Garder le §6, glyphe propre au produit

- Avantages : aucune marque tierce dans le dépôt.
- Inconvénients : le premier écran de l'app ne ressemble pas à Twitch.
- **Écartée** : contraire à l'objet du cours.

### Option B — Glitch redessiné à la main d'après les captures

- Avantages : immédiat.
- Inconvénients : tracé approximatif, donc une version modifiée du logo.
- **Écartée.**

### Option C — Glitch repris du SVG officiel du brand kit

- Avantages : tracé exact ; provenance citée.
- Inconvénients : une marque déposée dans un dépôt public.
- **Retenue.**

## Décision

### 1. Ce qui est repris

Le Glitch est repris dans l'app. Le wordmark « Twitch » ne l'est pas : le §6 de l'ADR 0036 continue de s'appliquer à lui.

### 2. Source du tracé

Le tracé vient du SVG officiel du brand kit Twitch (brand.twitch.com), versionné dans le dépôt avec sa provenance et sa date de téléchargement. Il n'est ni redessiné ni modifié : proportions, formes et couleur restent celles du fichier.

### 3. Rendu dans l'app

Le SVG est converti en `Shape` SwiftUI dans `Core/DesignSystem` (ADR 0010). Une animation peut révéler le Glitch, mais son état final est le logo tel quel. Ses couleurs passent par les tokens (ADR 0019).

## Conséquences

### Positives

- L'écran de lancement ressemble à celui de Twitch.
- Le tracé est exact et traçable jusqu'au fichier officiel.

### Négatives

- Le dépôt public contient une marque déposée de Twitch.

### Risques et mitigations

- **Un tracé modifié par la conversion.** Mitigation : la `Shape` est générée depuis le SVG versionné, pas retouchée à la main.
- **Le logo sort de l'écran de lancement sans décision.** Mitigation : tout autre emplacement (icône de l'app, en-têtes) suit cet ADR et cite une capture de `docs/reference-ui/`.

## Liens

- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles relevées sur l'app iOS Twitch, dont cet ADR remplace le §6 pour le Glitch.
- [ADR 0019](0019-package-design-tokens.md) — design tokens.
- [ADR 0010](0010-modularisation-ios-packages-spm-locaux.md) — `Core/DesignSystem`.
