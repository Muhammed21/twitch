# 0029 — oxlint et oxfmt à la place d'ESLint et Prettier

- Statut : Accepté — remplace les sections 1 et 2 de [0018](0018-qualite-de-code-et-discipline-de-depot.md) ainsi que la partie ESLint/Prettier de ses notes d'implémentation
- Date : 2026-10-09
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0018 fait d'ESLint l'outil d'architecture du dépôt. Le cœur de son argument est le lint **typé** : `no-floating-promises` et `no-misused-promises` attrapent la classe de bugs qui compte sur une base NestJS avec events et outbox, et ces deux règles exigent l'information de types de `@typescript-eslint`.

Ce socle ne tient pas sur ce dépôt. Le monorepo est en `typescript@7.0.2`, le compilateur natif. `typescript-eslint` (8.71.1, la dernière version) déclare `typescript: ">=4.8.4 <6.1.0"` en peer dependency : il repose sur l'API JavaScript du compilateur, que TypeScript 7 ne fournit plus sous la même forme. Le dispositif de l'ADR 0018 se réduit donc à l'un des deux cas suivants :

- revenir à TypeScript 6 pour le lint seul, avec deux compilateurs qui divergent entre `tsc` et le linter ;
- ou un ESLint sans types, c'est-à-dire sans les deux règles qui justifiaient son choix.

La configuration actuelle illustre le second cas : `@repo/eslint-config` analyse le TypeScript avec le parser Babel, sans aucune règle typée, et charge `eslint-plugin-only-warn`, que l'ADR 0018 avait pourtant décidé de retirer.

Le projet frère `heeboo` a résolu le même problème avec oxlint, oxfmt et `oxlint-tsgolint`. Ce dernier fait le lint typé sur le compilateur Go, donc sur la même base que TypeScript 7. Ce dispositif tourne en production, avec des règles d'architecture écrites dans un plugin JS local.

Problématique : quel outillage tient le contrat de l'ADR 0018 — des règles d'architecture bloquantes et un lint typé — sur TypeScript 7 ?

## Facteurs de décision

- **Lint typé disponible sur TypeScript 7.** C'est la condition éliminatoire.
- **Budgets de l'ADR 0018** : pre-commit sous 5 secondes, pre-push sous 90 secondes.
- **Règles d'architecture exprimables** : restrictions d'imports par chemin, règles sur mesure.
- **Un seul outil de vérité pour le formatage**, sans conflit avec le linter.

## Options envisagées

### Option A — ESLint + `@typescript-eslint`, TypeScript épinglé en 6.x

Fidèle à la lettre de l'ADR 0018. Mais c'est un retour en arrière du compilateur entier pour satisfaire le linter, et `tsc` ne serait plus la même version que l'éditeur. **Écartée.**

### Option B — ESLint sans information de types

C'est la situation actuelle. Elle perd `no-floating-promises` et `no-misused-promises`, c'est-à-dire la raison d'être du choix d'ESLint. **Écartée.**

### Option C (retenue) — oxlint + `oxlint-tsgolint` + oxfmt

Lint typé natif sur TypeScript 7. Il est 50 à 100 fois plus rapide qu'ESLint, ce qui permet de lancer `pnpm lint` en entier au pre-push. Les règles d'architecture passent par `no-restricted-imports`, les `overrides` par chemin, et un plugin JS local pour le reste. Le formatage est confié à oxfmt, compatible avec Prettier.

## Décision

**oxlint est l'outil d'architecture du dépôt, et oxfmt son formateur.** Tout ce que l'ADR 0018 décide par ailleurs reste en vigueur : la gradation `error` / `warn` / `off`, les trois étages et leurs budgets, secretlint, commitlint avec des scopes fermés, le patron unique de gate des artefacts générés, Renovate, Stryker en nocturne et le volet Swift.

### 1. Configuration

- **Un seul fichier `.oxlintrc.json` à la racine**, lancé une fois sur tout le dépôt par `oxlint --type-aware .`. Il n'y a plus de tâche `lint` par package dans Turborepo ni de package `@repo/eslint-config`.
- Les catégories `correctness` sont en `error`. Les règles typées `no-floating-promises`, `no-misused-promises`, `typescript/no-unsafe-type-assertion` et `typescript/no-deprecated` sont en `error`.
- `only-warn` n'a pas d'équivalent et n'en aura pas : ce qui est `error` bloque.
- `.oxfmtrc.json` : `printWidth: 100`, comme l'ADR 0018. Il ignore les artefacts générés.

### 2. Les règles qui matérialisent les ADR

Elles vivent dans `.oxlintrc.json` (`overrides` par chemin et `no-restricted-imports`). Les règles qu'aucune règle native ne couvre vont dans un plugin JS local, `packages/lint`, chargé par `jsPlugins` : `import/no-restricted-paths` entre `modules/*` et l'interdiction de désactiver une règle d'architecture.

**Ces règles arrivent avec le code qu'elles protègent, pas avant.** `apps/api` n'existe pas encore. Une zone qui ne correspond à aucun fichier passe silencieusement : c'est le risque que l'ADR 0018 nomme « le linter doit être linté ». Écrire ces règles avant leurs chemins reviendrait à commencer par ce défaut. Le premier module de `apps/api` livre donc, dans la même PR, ses règles d'isolation du domaine (ADR 0002) et le test qui vérifie que chaque motif de chemin correspond à au moins un fichier.

Toute modification des règles d'architecture passe en palier de revue `critical` (`.github/labeler.yml`).

### 3. Hooks

| Étage      | Contenu                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| pre-commit | lint-staged : `secretlint`, `oxfmt --write`, `oxlint` sur les fichiers indexés                             |
| commit-msg | `commitlint`, avec les scopes fermés de l'ADR 0018 §7 plus `web`, `ui`, `infra` et `tooling`               |
| pre-push   | `pnpm lint` (tout le dépôt), puis `turbo run check-types test --filter=...[<merge-base avec origin/main>]` |

Le lint passe sur tout le dépôt au pre-push, et non sur les seuls packages affectés comme le prévoyait l'ADR 0018 : oxlint le fait en quelques centaines de millisecondes, et le filtrage aurait plus de cas limites que de gain. Le filtre de Turborepo part de la merge-base avec `origin/main`, parce que `origin/HEAD` n'existe pas dans tous les clones.

`subject-case` est désactivé dans commitlint : un sujet en français qui commence par un nom propre (« RevenueCat reste… ») est un sujet valide.

## Conséquences

### Positives

- Le lint typé existe vraiment, sur le même compilateur que `tsc`.
- Le lint ne coûte plus rien en temps. Le budget du pre-push va désormais presque entièrement au typecheck et aux tests.
- Une seule configuration de lint pour tout le dépôt, au lieu de quatre `eslint.config.*` et d'un package de configuration.
- L'outillage est aligné sur `heeboo` : les règles et scripts éprouvés là-bas se portent sans traduction.

### Négatives

- oxlint n'a pas tout l'écosystème de plugins d'ESLint. Une règle absente s'écrit à la main dans `packages/lint`.
- Les plugins JS d'oxlint sont plus jeunes que l'API de règles d'ESLint, et leur API peut encore bouger.
- oxfmt est plus jeune que Prettier, et sa sortie peut changer d'une version mineure à l'autre. Sa version est épinglée par le lockfile, et Renovate regroupe ses montées de version.

### Risques et mitigations

- **Risque : une règle d'architecture n'est pas exprimable dans oxlint.** Mitigation : `packages/lint` accepte du JavaScript arbitraire ; en dernier recours, un test Vitest qui parcourt les imports donne la même garantie, avec un message moins intégré à l'éditeur.
- **Risque : `typescript-eslint` passe à TypeScript 7 plus tard.** La raison de cet ADR disparaîtrait alors, mais pas ses autres bénéfices (vitesse, configuration unique, alignement sur `heeboo`). Aucun retour prévu sans nouvel ADR.

## Liens

- ADR 0018 — Qualité de code et discipline de dépôt : remplacé ici pour le choix des outils seulement
- ADR 0002, 0007, 0009 — frontières que `packages/lint` fera respecter
- ADR 0003 — source des scopes commitlint
