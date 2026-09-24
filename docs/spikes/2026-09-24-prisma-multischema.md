# Spike — Prisma multiSchema et rôles PostgreSQL

- Date : 2026-09-24
- Origine : ADR 0008 (« une migration de validation sur les 11 schémas au premier sprint reste recommandée » ; vigilance sur les enums partagés et la shadow database ; garde-fou par rôle PostgreSQL ; convention `/// @personal`)
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

Le montage décrit par l'ADR 0008 fonctionne-t-il tel quel avec la version actuelle de Prisma : un schéma PostgreSQL par contexte, un schéma Prisma découpé en plusieurs fichiers, un rôle par contexte qui rend une jointure sauvage impossible, `audit` en ajout seul, migrations dans un job dédié, et un inventaire des champs `@personal` exploitable par un test ?

## Réponse courte

**Oui sur l'essentiel, avec quatre corrections à apporter à l'ADR 0008.**

- Tout le garde-fou par rôle fonctionne réellement : 14 vérifications sur 15 passent, y compris le refus d'un `$queryRaw` qui joint un autre schéma.
- La quinzième échoue pour une raison que l'ADR n'anticipait pas : **un enum rangé dans un schéma et utilisé dans un autre crée une dépendance de droits entre schémas.**
- Prisma **accepte sans avertissement** une clé étrangère entre schémas, et le **client unique** de l'ADR 0008 ne peut pas être restreint par rôle : il faut une connexion par contexte.
- La shadow database exige `CREATEDB`.
- Les commentaires `/// @personal` sont exploitables, mais seulement par une API interne de Prisma.

## Montage

- Prisma **7.10.0** : dernière version stable, 2026-08-25. Au 2026-09-24, le tag npm `latest` pointe par erreur sur `8.0.0-rc.15` : un `npm i prisma` sans version installe une release candidate. Il faut épingler.
- Particularités de Prisma 7 prises en compte : configuration dans `prisma.config.ts` (URL de la base et chemin des migrations y vivent, plus dans le `datasource`) ; générateur `prisma-client` avec `output` obligatoire ; client qui exige un *driver adapter* (`@prisma/adapter-pg`) ; `migrate dev` ne génère plus le client, il faut lancer `prisma generate` à part.
- PostgreSQL 17 embarqué (`embedded-postgres`), sans Docker.
- Rôles : `migrator` (propriétaire de la base, exécute les migrations), `app_<contexte>` pour chacun des 8 contextes, et `app_cms` pour le test d'enum.
- Schéma Prisma découpé en 12 fichiers (`base.prisma` et un fichier par schéma), 11 schémas PostgreSQL, 14 modèles réalistes : `Follow` (ADR 0020), `RoleAssignment` (ADR 0006), `UserBlock` (ADR 0021), `AuditLog`, `LedgerEntry`, etc.

## Constats

### 1. Schéma multi-fichiers et 11 schémas : OK

`prisma validate`, `migrate dev` puis `migrate deploy` passent. Prisma crée lui-même les 11 schémas (`CREATE SCHEMA IF NOT EXISTS`) dans la migration, ainsi que les types enum qualifiés par schéma (`"channel"."FollowState"`). Aucun `previewFeatures` n'est requis. Le découpage en un fichier par contexte fonctionne sans configuration particulière (`schema: "prisma/schema"` dans `prisma.config.ts`).

### 2. Garde-fou par rôle : OK, testé

Chaque rôle de contexte ne reçoit `USAGE` que sur son schéma, plus `authz` en lecture et `audit` en ajout seul.

| Vérification | Rôle | Résultat |
|---|---|---|
| Écrire dans son schéma, y compris une FK interne (`Follow` → `Channel`) | `app_channel` | Accepté |
| Lire `identity` via le client Prisma | `app_channel` | Refusé : `42501 permission denied for schema identity` |
| Jointure `channel` × `identity` en `$queryRaw` | `app_channel` | Refusé : `42501` |
| Lire `channel` en `$queryRawUnsafe` | `app_chat` | Refusé : `42501` |
| Lire `authz` (lecture ouverte, ADR 0006) | `app_chat` | Accepté |
| Écrire dans `authz` | `app_chat` | Refusé |
| Écrire dans `authz` (nominations et sanctions) | `app_moderation` | Accepté |
| Supprimer dans `authz` | `app_moderation` | Refusé |
| `INSERT` et `SELECT` dans `audit` | `app_chat` | Accepté |
| `UPDATE` et `DELETE` dans `audit` | `app_chat` | Refusé |

C'est exactement la promesse de l'ADR 0008 : la règle est appliquée par la base, pas par la revue de code, et une jointure sauvage échoue dès le développement.

Limite constatée : la base protège les **tables**, pas les **valeurs**. `app_moderation` peut écrire n'importe quelle ligne dans `authz.RoleAssignment`, y compris un rôle `owner` ou `admin`. La règle « qui peut nommer qui » reste entièrement dans le domaine (ADR 0006). Seule une Row-Level Security pourrait la renforcer en base ; ce n'est pas nécessaire, mais il faut le savoir.

### 3. Enums partagés : deux pièges

**Piège 1 — un enum utilisé hors de son schéma crée une dépendance de droits.** L'enum `Visibility`, rangé dans `channel` et utilisé par `cms.EditorialPage`, a produit une colonne `cms.EditorialPage.visibility` de type `"channel"."Visibility"`. Le rôle `app_cms`, qui a tous les droits sur `cms`, **ne peut pas écrire dans sa propre table** : `42501 permission denied for schema channel`. Pour écrire dans cette colonne, il faut aussi `USAGE` sur le schéma du type.

Autrement dit, partager un enum entre deux contextes les couple en base : soit on accorde `USAGE` sur l'autre schéma (et on affaiblit le garde-fou), soit l'écriture échoue. Rien ne le signale au moment de `prisma validate` ni de la migration : on le découvre à l'exécution.

**Piège 2 — un nom d'enum est unique pour toute la base.** Définir un second `enum Visibility` dans `cms` est refusé à la validation (`P1012 : The enum "Visibility" cannot be defined because a enum with that name already exists`). Chaque contexte doit donc préfixer ses enums (`ChannelVisibility`, `EditorialVisibility`). Les noms de modèles sont soumis à la même contrainte.

### 4. Clé étrangère entre schémas : Prisma l'accepte sans rien dire

Une relation `cms.EditorialPage` → `channel.Channel` passe `prisma validate` et génère bien `ALTER TABLE "cms"."EditorialPage" ADD CONSTRAINT … REFERENCES "channel"."Channel"`. La règle « aucune clé étrangère entre schémas » de l'ADR 0008 n'est donc protégée par rien : ni Prisma, ni la base (le propriétaire `migrator` a tous les droits sur tous les schémas).

Contre-mesure validée : un script de lint lit le schéma via `getDMMF` et échoue sur toute relation ou tout enum qui franchit un schéma. Sur le schéma du spike, il trouve exactement la violation de l'enum `Visibility`, et aucun faux positif sur la FK interne `Follow` → `Channel`.

Point d'attention pour ce lint : **le DMMF donne le schéma d'un modèle, mais pas celui d'un enum** (un enum n'y a que `name`, `values` et `dbName`). Il faut relire les fichiers `.prisma` pour associer chaque enum à son `@@schema`. C'est fait dans le spike par une expression régulière, suffisante mais fragile ; `prisma format` normalise la mise en forme, ce qui la rend fiable en pratique.

### 5. Client unique : il ne peut pas être restreint par rôle

Le client Prisma est **généré pour tous les modèles**, et le rôle PostgreSQL est **porté par la chaîne de connexion**. Un client unique connecté avec un seul rôle aurait donc soit tous les droits (ce qui annule le garde-fou), soit ceux d'un seul contexte (ce qui casse les autres).

Le montage qui fonctionne, testé : **le même client généré, instancié une fois par contexte**, chacun avec la chaîne de connexion de son rôle. `channel.account.findMany()` compile, puisque le type existe dans le client, mais échoue à l'exécution avec `42501`.

Conséquences pour l'organisation du code :

- `packages/db` exporte une **fabrique**, pas une instance : `createContextClient({ context: "channel" })`, qui lit l'URL propre au contexte (`DATABASE_URL_CHANNEL`…).
- Chaque module (ADR 0002) reçoit son instance par injection. Le lint d'imports de l'ADR 0018 empêche un module de construire le client d'un autre.
- 8 pools de connexions au lieu d'un : à dimensionner (8 × taille de pool par instance d'API) face au `max_connections` de PostgreSQL. Avec un pooler (PgBouncer ou celui de l'hébergeur), le total reste maîtrisable.
- **Une transaction ne peut plus couvrir deux contextes**, puisque deux clients utilisent deux connexions. L'ADR 0008 citait la possibilité de transactions cross-contexte « quand c'est indispensable » : elle disparaît de fait. C'est cohérent avec l'outbox (ADR 0002), mais il faut l'écrire.
- **La table `outbox`** de l'ADR 0002 est écrite dans la même transaction que l'état métier, et donc par le rôle du contexte : il faut une table `outbox` **par schéma** (`channel.outbox`, `moderation.outbox`…), pas une table globale.

### 6. Rôles, migrations et privilèges par défaut

- Les `GRANT` et les `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA …` vivent **dans la première migration**, ajoutés à la main au SQL généré (`migrate dev --create-only`). Ils sont ainsi versionnés, rejoués à l'identique dans la shadow database et sur une base neuve (`migrate deploy`), et ne sont pas vus comme une dérive par Prisma.
- **Privilèges par défaut : OK.** Une seconde migration crée `channel.ChannelTag` sans aucun `GRANT`, et `app_channel` y lit et écrit immédiatement.
- **Piège : ils ne s'appliquent qu'aux objets créés par `migrator`.** Une table créée par un autre rôle (le superutilisateur, un opérateur, un script de secours) est inaccessible au rôle du contexte : `42501 permission denied for table`. Toutes les migrations doivent donc passer par `migrator`, y compris les correctifs manuels en production.
- **Les rôles sont un prérequis de la migration, pas son produit.** Les rôles sont des objets du cluster, pas de la base. Sur un cluster où `app_stream` n'existe pas, `migrate deploy` échoue (`P3018 role "app_stream" does not exist`). La migration est annulée en bloc (aucune table créée), mais la base reste bloquée en `P3009` tant qu'un `prisma migrate resolve --rolled-back` n'a pas été lancé à la main, même après création du rôle. Le provisionnement des rôles appartient à l'infrastructure, et doit précéder le premier déploiement.
- **Job de migration concurrent : protégé par Prisma lui-même.** Deux `migrate deploy` lancés simultanément sur une base neuve : le premier applique, le second attend puis répond « No pending migrations to apply ». Prisma pose son propre verrou consultatif PostgreSQL ; celui que l'ADR 0008 prévoyait « en ceinture et bretelles » est redondant.

### 7. Shadow database

`migrate dev` crée une base temporaire (shadow database) pour détecter les dérives. **Sans `CREATEDB`, il échoue** (`P3014 permission denied to create database`). Deux options : donner `CREATEDB` au rôle de migration en développement seulement, ou fournir une `shadowDatabaseUrl` dédiée (option à prévoir sur un hébergeur managé qui refuse `CREATEDB`). La shadow database doit être sur le **même cluster**, parce que la première migration accorde des droits à des rôles qui doivent y exister.

`migrate deploy`, qui tourne en production, n'utilise pas de shadow database : `migrator` n'a pas besoin de `CREATEDB` en production.

### 8. `/// @personal` : exploitable, via une API interne

- Les commentaires `///` sont conservés dans les **JSDoc des types générés** (utile en revue), mais **absents du modèle de données du client à l'exécution** : un test ne peut pas les lire depuis le client Prisma.
- Ils sont exposés dans le DMMF, que renvoie `getDMMF` de `@prisma/internals` (champ `documentation` de chaque champ). Le spike extrait les 7 champs marqués, avec leur schéma et leur modèle, par exemple `channel.Follow.followerId` et `identity.Account.email`.
- `@prisma/internals` n'est **pas une API publique** : son contrat n'est pas garanti entre versions. En Prisma 7, `getDMMF` n'est d'ailleurs accessible que par l'export par défaut en ESM, et non par un import nommé. Le test d'anonymisation de l'ADR 0008 est donc faisable, mais il dépend d'un détail interne. Il faut l'isoler dans un seul fichier d'outillage, épinglé sur la version de Prisma, comme `writeBuffer` dans l'ADR 0022.

## Ce que le spike n'a pas vérifié

- **Hébergeur réel** : droits disponibles (`CREATEDB`, `CREATEROLE`), pooler, limites de connexions. Le spike tourne sur un PostgreSQL local où l'on est superutilisateur.
- **Charge** : coût réel de 8 pools, latence ajoutée par un pooler.
- **Payload dans le schéma `cms`** : Payload gère ses propres migrations (ADR 0007). Les faire cohabiter avec celles de Prisma dans la même base n'a pas été testé.
- **Prisma 8** : en release candidate ; pas évalué.

## Recommandation

1. **Garder le montage de l'ADR 0008**, en épinglant Prisma sur `7.10.x`, jamais sur `latest` tant que le tag pointe sur une RC.
2. **Un client par contexte**, construit par une fabrique de `packages/db`, avec une URL et un rôle par contexte. Retirer « client Prisma unique » des notes d'implémentation de l'ADR 0008, et acter qu'il n'y a plus de transaction couvrant deux contextes.
3. **Une table `outbox` par schéma de contexte.**
4. **Interdire les enums partagés et préfixer les noms d'enums par contexte.** Un enum utilisé par deux contextes est dupliqué, chacun dans son schéma.
5. **Lint de schéma en CI** (ADR 0018) : aucune relation ni enum qui franchit un schéma, et chaque colonne listée en inventaire `@personal`. Ce lint est le seul garde-fou contre les clés étrangères entre schémas.
6. **Droits dans la première migration**, avec `ALTER DEFAULT PRIVILEGES` par schéma. **Rôles provisionnés par l'infrastructure** avant tout déploiement. Toute création d'objet passe par `migrator`.
7. **Retirer le verrou consultatif maison** du job de migration : celui de Prisma suffit.
8. **Shadow database** : `CREATEDB` en développement, `shadowDatabaseUrl` sur le même cluster si l'hébergeur le refuse.
