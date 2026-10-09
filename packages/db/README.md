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

Dans Compose, le service `migrate` du profil `full` (image `packages/db/Dockerfile`) lance `pnpm migrate` après `db-init`. Une application n'applique jamais de migration au démarrage : elle appelle `assertSchemaVersion({ connectionString: DATABASE_URL_HEALTH, migration: LATEST_MIGRATION })`, qui refuse une base où cette migration n'est pas appliquée, terminée et non annulée (ADR 0008, ADR 0028 §8). `LATEST_MIGRATION` est généré par `pnpm generate` depuis `prisma/migrations/`.

Les variables viennent du `.env` racine. Les droits vivent dans la migration `socle` : chaque `app_<contexte>` lit et écrit son schéma seul ; `audit` est en `INSERT` et `SELECT` pour tous ; `authz` est lu par tous et écrit par `channel` et `moderation`, sans `DELETE` (ADR 0006). Ils passent par des privilèges par défaut de `migrator` : toute table doit être créée par ce rôle.

## Lint du schéma

`pnpm generate` lance `prisma generate`, puis le lint du schéma (ADR 0025 §4 et §5). Il échoue sur :

- une relation entre deux schémas ;
- un enum utilisé hors de son schéma ;
- un modèle ou un enum dont le nom ne commence pas par son schéma en PascalCase (`VideoStream`, `AuthzRoleAssignment`) ;
- un champ dont le nom évoque une donnée personnelle (`email`, `ip`, `displayName`, `userId`…) sans `/// @personal` ni `/// @not-personal`.

Il écrit `personal-fields.json`, l'inventaire versionné des champs `@personal`, lu par le test d'anonymisation (ADR 0008). La CI vérifie qu'il est à jour. `@prisma/internals` n'est importé que par `scripts/schema-lint/read-prisma-schema.ts`.

## Outbox et idempotence

Chaque contexte qui publie des events déclare ses propres tables, de forme imposée par le lint (ADR 0002 règle 2, ADR 0025 §3) :

- `<Contexte>Outbox` : `id`, `name`, `version`, `payload` (Json), `occurredAt`, `publishedAt`, `attempts`, `nextAttemptAt`, `lastError`, avec un index sur `(publishedAt, nextAttemptAt)` ;
- `<Contexte>ProcessedEvent` : `eventId`, `handlerName`, `processedAt`, unique sur `(eventId, handlerName)`.

La migration qui crée une outbox accorde `SELECT, UPDATE` sur cette table à `app_outbox_relay` : aucun privilège par défaut ne cible les seules outbox.

```ts
await db.$transaction(async (tx) => {
  await tx.videoStream.update({ where: { id }, data: { startedAt } });
  await appendToOutbox(tx, { outbox: { schema: "video", table: "VideoOutbox" }, event });
});
```

- `appendToOutbox(tx, …)` s'appelle dans la transaction qui écrit l'état métier : un événement d'une transaction annulée n'est jamais publié.
- `relayOutboxBatch({ pool, outbox, publish })` publie un lot avec le rôle `app_outbox_relay` : lignes verrouillées en `FOR UPDATE SKIP LOCKED`, dans l'ordre d'occurrence, puis `publishedAt` posé. Un échec garde l'événement, compte la tentative et le reprogramme après 1 s, 2 s, 4 s… jusqu'à 5 minutes. La garantie est _at-least-once_.
- `alreadyProcessed(tx, { processedEvents, eventId, handler })` s'appelle dans la transaction du consommateur : `true` si ce handler a déjà traité l'événement.

`pnpm mutation:integration` mute `src/outbox.ts` contre les tests unitaires et d'intégration, sur la base locale migrée.
