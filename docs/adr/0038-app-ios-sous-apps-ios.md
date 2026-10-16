# 0038 — L'app iOS vit sous `apps/ios/`, à côté des autres applications

- Statut : Proposé
- Date : 2026-10-16
- Décideurs : Muhammed Cavus
- Amende : ADR 0010 (emplacement de `App/` et `Packages/`), ADR 0018 (§4, chemin qui déclenche la CI iOS), ADR 0019 (chemin du package `DesignTokens`)

## Contexte et problématique

Les ADR 0010, 0018 et 0019 placent l'app iOS à la racine du dépôt : `App/` et `Packages/`, une CI déclenchée sur `ios/`, et `.package(path: "../packages/design-tokens/platforms/swift")` depuis `Packages/Package.swift`. Les autres applications vivent sous `apps/` (`apps/api`, `apps/video`), et le squelette Xcode de l'app a été créé sous `apps/ios/`.

Problématique : où vit l'app iOS dans le monorepo ?

## Facteurs de décision

- **Une seule convention** : un lecteur cherche une application sous `apps/`.
- **Des chemins exacts** : le workflow iOS et le package de tokens suivent le chemin écrit dans les ADR.

## Options envisagées

### Option A — À la racine, comme les ADR 0010, 0018 et 0019

- Avantages : aucun ADR ne change.
- Inconvénients : l'app iOS est la seule application hors de `apps/`.
- **Écartée.**

### Option B — Sous `apps/ios/`

- Avantages : toutes les applications sont sous `apps/`.
- Inconvénients : trois ADR à amender ; le chemin relatif vers `DesignTokens` s'allonge.
- **Retenue.**

## Décision

### 1. Emplacement

L'app iOS vit sous `apps/ios/` : `apps/ios/App.xcodeproj`, `apps/ios/App/` (target mince) et `apps/ios/Packages/Package.swift`. L'arborescence interne de l'ADR 0010 ne change pas.

### 2. Package de tokens

`apps/ios/Packages/Package.swift` référence `DesignTokens` par `.package(path: "../../../packages/design-tokens/platforms/swift")`.

### 3. CI iOS

Le workflow iOS de l'ADR 0018 (§4), une fois activé, se déclenche sur les diffs de `apps/ios/`.

## Conséquences

### Positives

- Les applications du monorepo sont toutes sous `apps/`.
- Les chemins des ADR correspondent au dépôt.

### Négatives

- `apps/ios/` n'a pas de `package.json` : pnpm et Turborepo ne le voient pas, et ses tests se lancent par `xcodebuild`, hors de `turbo test`.

### Risques et mitigations

- **Un chemin relatif cassé par un déplacement du package de tokens.** Mitigation : le build de l'app échoue à la résolution du package, avant tout test.

## Liens

- [ADR 0010](0010-modularisation-ios-packages-spm-locaux.md) — modularisation iOS, dont cet ADR amende l'emplacement.
- [ADR 0018](0018-qualite-de-code-et-discipline-de-depot.md) — volet Swift (§4), dont cet ADR amende le chemin de déclenchement.
- [ADR 0019](0019-package-design-tokens.md) — package de design tokens, dont cet ADR amende le chemin de résolution.
