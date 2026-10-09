# @repo/lint

Plugin oxlint local des règles d'architecture (ADR 0029), chargé par `jsPlugins` dans `.oxlintrc.json` sous le nom `twitch`. Toute modification passe en revue `critical`.

| Règle                            | Refuse                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `twitch/module-boundaries`       | un import d'un module de `apps/api/src/modules/` vers l'intérieur d'un autre, hors de son `contracts/` |
| `twitch/layer-dependencies`      | un import qui remonte les couches : `presentation` et `infrastructure` → `application` → `domain`      |
| `twitch/no-disable-architecture` | un commentaire `oxlint-disable` / `eslint-disable` qui vise une règle d'architecture, ou toutes        |

Dans `.oxlintrc.json`, `no-restricted-imports` interdit à `domain/` NestJS, `nestjs-zod`, Prisma, Zod et `@repo/db` (ADR 0002, ADR 0009). La couche `application` reçoit la même règle avec son premier fichier.

Une règle arrive avec le code qu'elle protège : `src/config.test.ts` vérifie que chaque motif `files` des `overrides` correspond à au moins un fichier du dépôt, puis lance le vrai `oxlint` avec la vraie configuration sur une arborescence temporaire. `pnpm mutation` mute les règles contre leurs tests `RuleTester`.
