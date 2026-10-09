# Plan — socle de la base de données (`packages/db`)

Décisions de référence : [ADR 0008](../docs/adr/0008-topologie-de-donnees.md) (un schéma par contexte), [ADR 0025](../docs/adr/0025-un-client-prisma-par-contexte.md) (un client par contexte, droits, lint de schéma), [ADR 0028](../docs/adr/0028-conteneurisation-et-environnement-local-docker-compose.md) (rôles provisionnés, job de migration, relais de l'outbox), [ADR 0002](../docs/adr/0002-monolithe-modulaire-hexagonal.md) (outbox, idempotence), et le [spike Prisma multiSchema](../docs/spikes/2026-09-24-prisma-multischema.md).

Ce plan pose ce que **tous** les contextes réutilisent : la fabrique de clients, les schémas et leurs droits, le lint, l'outbox et le job de migration. Il ne crée **aucune table métier** : chaque contexte ajoute ses modèles avec son premier use-case (ADR 0003). Chaque PR suit le TDD (RED, GREEN, mutation, REFACTOR) et reste sous le plafond de revue.

## Point de départ

- Compose fournit PostgreSQL 17.11 et le job `db-init` (ADR 0028, §3), qui crée `migrator`, `app_<contexte>` pour les huit contextes, `app_outbox_relay`, `app_health`, `payload`, et les bases `app` et `payload`. Il ne crée ni schéma, ni table, ni droit.
- Aucun Prisma dans le dépôt. `apps/` est vide.
- Premiers consommateurs prévus : `apps/video` ([plan](service-video.md), PR 4) et `apps/api` (contexte `identity`, ADR 0026).

## Ce que la base protège, et ce qu'elle ne protège pas

À garder en tête dans toutes les PR (ADR 0025, §7) : les rôles PostgreSQL empêchent un contexte de **lire ou écrire le schéma d'un autre**. Ils n'empêchent ni une clé étrangère entre schémas (le rôle `migrator` a tous les droits), ni un enum partagé, ni une valeur métier interdite. Les deux premiers sont fermés par le lint de la PR 3 ; le troisième reste au domaine.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                   |
| ----- | ----------- | ----------------------------------------------------------------------------------------------- |
| D1    | 2           | `pnpm migrate` sur une base neuve crée les 11 schémas ; un contexte ne lit pas le schéma voisin |
| D2    | 4           | Un événement écrit dans une outbox est publié une fois, même avec deux relais en parallèle      |
| D3    | 5           | `docker compose --profile full up` migre avant de démarrer quoi que ce soit, et refuse sinon    |

## Les PR

### PR 1 — `packages/db` : Prisma épinglé et fabrique de clients

- Prisma épinglé en `7.10.x` (jamais `latest`, ADR 0025 §8) : `prisma`, `@prisma/client`, `@prisma/adapter-pg`. `prisma.config.ts`, schéma multi-fichiers dans `packages/db/prisma/schema/`, générateur `prisma-client` avec `output` explicite. Le client généré n'est pas versionné : `prisma generate` tourne dans la tâche Turborepo `generate`.
- Fabrique `createContextClient({ context })` (ADR 0025, §1) : lit `DATABASE_URL_<CONTEXTE>`, la valide par un schéma Zod, et refuse un contexte inconnu. Aucune instance exportée.
- Liste fermée des contextes : les huit de l'ADR 0003 plus `video` (ADR 0031). Ajouter un contexte est une modification de cette liste, relue en palier `critical`.
- **Tests d'abord** : contexte inconnu refusé à la compilation et à l'exécution ; variable absente → erreur qui nomme la variable ; URL mal formée refusée ; deux contextes donnent deux clients distincts. Mutation sur la fabrique.

### PR 2 — Première migration : schémas, rôles et droits (jalon D1)

- Rôle `app_video` ajouté à `docker/postgres/init-roles.sh` et à `.env.example` (`PG_PASSWORD_APP_VIDEO`, `DATABASE_URL_VIDEO`).
- Migration `0000_socle`, écrite par `migrate dev --create-only` puis complétée à la main (ADR 0025, §6) :
  - 11 schémas : les huit contextes, `video`, `authz`, `audit` ;
  - `GRANT USAGE` de chaque schéma à son seul rôle, et `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA <s>` (`SELECT`, `INSERT`, `UPDATE`, `DELETE` sur les tables, `USAGE` sur les séquences) ;
  - `audit` : `INSERT` et `SELECT` seulement, jamais `UPDATE` ni `DELETE` (ADR 0006, §7) ;
  - `authz` : lecture ouverte aux rôles de contexte ; écriture réservée aux contextes propriétaires (`channel`, `moderation`, ADR 0006 §3) ;
  - `app_health` : `SELECT` sur la table de migrations de Prisma, pour la sonde de disponibilité (ADR 0028, §8).
- Scripts : `pnpm migrate` (`migrate deploy` avec `DATABASE_URL_MIGRATOR`) et `pnpm migrate:dev`. Avant toute migration, une vérification échoue si un rôle attendu manque (ADR 0025, §6), au lieu de laisser la base en `P3009`.
- CI : un job d'intégration démarre PostgreSQL et `db-init`, applique les migrations, puis lance les tests de cette PR.
- **Tests d'abord** (intégration, contre une base neuve) : chaque rôle de contexte lit son schéma et reçoit `42501` sur un autre ; une table créée par `migrator` après la migration est accessible au rôle de son schéma sans `GRANT` explicite ; `UPDATE` et `DELETE` refusés sur `audit` ; `migrate deploy` rejoué deux fois ne change rien ; rôle manquant → la vérification échoue avant `migrate deploy`.

### PR 3 — Lint du schéma Prisma

- Script dans `packages/db/scripts/`, seul fichier à importer `@prisma/internals` (`getDMMF`, API interne, ADR 0025 §5). Les enums sont relus depuis les fichiers `.prisma`, puisque le DMMF ne donne pas leur schéma.
- Il échoue sur : une relation entre deux schémas ; un enum utilisé hors de son schéma ; un nom de modèle ou d'enum non préfixé par son contexte ; un champ qui évoque une donnée personnelle (`email`, `ip`, `*Id` vers un compte…) sans `/// @personal` ni `/// @not-personal`.
- Il écrit l'inventaire des champs `@personal` dans un fichier généré et versionné, que le test d'anonymisation de l'ADR 0008 lira. Cet inventaire suit le patron des artefacts générés : gate `pnpm generate` + `git diff` en CI (ADR 0018).
- **Tests d'abord** : un schéma de fixtures par violation, chacune détectée avec un message qui nomme le modèle et le champ ; un schéma conforme passe ; une relation interne à un schéma n'est pas signalée.

### PR 4 — Outbox et idempotence (jalon D2)

ADR 0025, §4 : un nom de modèle est unique dans toute la base, donc chaque contexte déclare ses propres tables (`VideoOutbox`, `ChannelOutbox`…). Ce qui se partage, c'est leur **forme** et le code qui les manipule.

- `packages/db` fournit :
  - la forme attendue d'une table d'outbox et de `processed_events` (identifiant d'événement, nom, version, charge utile, `occurredAt`, `publishedAt`, tentatives), vérifiée par le lint de la PR 3 sur tout modèle suffixé `Outbox` ;
  - `appendToOutbox(tx, event)`, à appeler **dans** la transaction qui écrit l'état métier (ADR 0002, règle 2) ;
  - `alreadyProcessed(tx, { eventId, handler })`, sur une contrainte d'unicité `(eventId, handlerName)` (ADR 0002) ;
  - la boucle du relais : lecture par lots avec `FOR UPDATE SKIP LOCKED`, publication par un port, marquage `publishedAt`, backoff sur échec (ADR 0028, §6). Le transport (Redis Streams, webhook) est un adapter fourni par l'appelant.
- `app_outbox_relay` reçoit `SELECT` et `UPDATE` sur chaque table d'outbox **dans la migration qui la crée** : un privilège par défaut ne sait pas cibler les seules tables d'outbox.
- Les tests utilisent un schéma de test dédié, créé et détruit par la suite d'intégration.
- **Tests d'abord** : un événement écrit dans une transaction annulée n'est jamais publié ; deux relais en parallèle publient chaque événement exactement une fois ; un échec de publication laisse l'événement à republier, avec un délai croissant ; un événement déjà traité par un handler est ignoré au second passage.

### PR 5 — Job de migration dans Compose et contrôle de version (jalon D3)

- Service `migrate` à exécution unique dans le profil `full` (ADR 0028, §5) : dépend de `db-init`, lance `pnpm migrate`. Les applications attendent `service_completed_successfully`.
- `assertSchemaVersion` dans `packages/db` : au démarrage, une application lit, avec `app_health`, la dernière migration appliquée et **refuse de démarrer** si elle n'est pas celle qu'elle attend (ADR 0008, §5c). Jamais de `migrate deploy` au démarrage d'une application.
- **Tests d'abord** : `docker/tests/infra.test.sh` vérifie que `migrate` termine avant le démarrage des applications, et qu'une migration en échec bloque leur démarrage ; `assertSchemaVersion` refuse une base en retard d'une migration.

## Ce qui vient ensuite, hors de ce plan

| Sujet                                                          | Où                                              |
| -------------------------------------------------------------- | ----------------------------------------------- |
| Modèles du schéma `video`                                      | [Plan du service vidéo](service-video.md), PR 4 |
| Tables de better-auth dans `identity`, adapter Prisma          | Premier sprint `identity` (ADR 0025, 0026)      |
| Table `RoleAssignment` de `authz`, journal `audit` partitionné | Premier use-case d'autorisation (ADR 0006)      |
| Seed déterministe par les use-cases                            | Avec les premiers use-cases (ADR 0008, §7)      |
| Sauvegardes et PITR                                            | ADR d'hébergement (ADR 0028, §11)               |

## Risques suivis pendant l'exécution

- **`@prisma/internals` change à une montée de version** : accès isolé dans un seul fichier (PR 3), Prisma épinglé, et le lint testé sur ses fixtures à chaque montée.
- **Un privilège par défaut oublié** rend une table invisible à son contexte, et l'erreur n'apparaît qu'à l'exécution. Le test « table créée après la migration, lisible sans `GRANT` » de la PR 2 tourne pour chaque schéma.
- **Pools de connexions** : un pool par contexte et par instance (ADR 0025, §1). Taille de pool réglée par variable d'environnement dès la PR 1, total surveillé face à `max_connections`.
