# @repo/db

Accès à PostgreSQL par contexte : un client Prisma par contexte, sur le rôle `app_<contexte>` (ADR 0025).

```ts
import { createContextClient } from "@repo/db";

const db = createContextClient({ context: "video" });
```

| Variable                       | Rôle                                             |
| ------------------------------ | ------------------------------------------------ |
| `DATABASE_URL_<CONTEXTE>`      | URL `postgresql://` du rôle du contexte, requise |
| `DATABASE_POOL_MAX_<CONTEXTE>` | Taille du pool, entier positif, 5 par défaut     |

La liste des contextes vit dans `src/contexts.ts` ; la modifier passe en revue `critical`.

Le client est généré dans `src/generated/` par `pnpm generate`, que `check-types` et `test` lancent d'abord. Schéma multi-fichiers dans `prisma/schema/`.

## Migrations

| Commande                | Effet                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm migrate`          | Vérifie que les rôles attendus existent, puis `prisma migrate deploy` avec `migrator`    |
| `pnpm migrate:dev`      | `prisma migrate dev` ; une migration qui ajoute des droits s'écrit avec `--create-only`  |
| `pnpm test:integration` | Droits de chaque rôle contre la base locale migrée (`pnpm infra:up` puis `pnpm migrate`) |

Les variables viennent du `.env` racine. Les droits vivent dans la migration `socle` : chaque `app_<contexte>` lit et écrit son schéma seul ; `audit` est en `INSERT` et `SELECT` pour tous ; `authz` est lu par tous et écrit par `channel` et `moderation`, sans `DELETE` (ADR 0006). Ils passent par des privilèges par défaut de `migrator` : toute table doit être créée par ce rôle.

## Lint du schéma

`pnpm generate` lance `prisma generate`, puis le lint du schéma (ADR 0025 §4 et §5). Il échoue sur :

- une relation entre deux schémas ;
- un enum utilisé hors de son schéma ;
- un modèle ou un enum dont le nom ne commence pas par son schéma en PascalCase (`VideoStream`, `AuthzRoleAssignment`) ;
- un champ dont le nom évoque une donnée personnelle (`email`, `ip`, `displayName`, `userId`…) sans `/// @personal` ni `/// @not-personal`.

Il écrit `personal-fields.json`, l'inventaire versionné des champs `@personal`, lu par le test d'anonymisation (ADR 0008). La CI vérifie qu'il est à jour. `@prisma/internals` n'est importé que par `scripts/schema-lint/read-prisma-schema.ts`.
