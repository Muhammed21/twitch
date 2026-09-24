# 0025 — Un client Prisma par contexte, et ce que la base ne protège pas

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0008 (client unique, transactions entre contextes, enums, migrations, notes d'implémentation), ADR 0002 (table `outbox`), ADR 0006 (portée du garde-fou en base), ADR 0018 (lint de schéma)
- Source : [spike du 2026-09-24 sur Prisma multiSchema](../spikes/2026-09-24-prisma-multischema.md)

## Contexte et problématique

L'ADR 0008 décide un schéma PostgreSQL par contexte, via `multiSchema` de Prisma, et un rôle PostgreSQL par contexte qui n'a `USAGE` que sur son schéma. Ainsi, une jointure sauvage échoue à l'exécution. Le spike a monté ce dispositif sur un vrai PostgreSQL 17, avec Prisma 7.10 : 11 schémas, 12 fichiers Prisma, 14 modèles réalistes, 8 rôles de contexte.

**Le garde-fou tient** : 14 vérifications sur 15 passent, dont le refus en `42501` d'un `$queryRaw` qui joint un autre schéma, et le refus d'`UPDATE` et de `DELETE` dans `audit`. Mais quatre affirmations de l'ADR 0008 sont fausses ou incomplètes :

1. **Un client Prisma unique ne peut pas être restreint par rôle.** Le rôle est porté par la chaîne de connexion. Un client unique a donc soit tous les droits, ce qui annule le garde-fou, soit ceux d'un seul contexte, ce qui casse les autres. Les notes d'implémentation de l'ADR 0008 (« client Prisma unique dans `packages/db` ») sont incompatibles avec sa propre décision.
2. **Les transactions entre contextes « quand c'est indispensable »** (ADR 0008, option C) disparaissent : deux clients utilisent deux connexions.
3. **Un enum partagé couple deux contextes en base.** Un enum rangé dans `channel` et utilisé par `cms` empêche `app_cms` d'écrire dans sa propre table (`permission denied for schema channel`). Rien ne le signale avant l'exécution. De plus, un nom d'enum est unique pour toute la base.
4. **Prisma accepte une clé étrangère entre schémas sans avertissement**, et le rôle de migration a tous les droits. La règle « aucune FK entre schémas » n'est protégée par rien.

S'y ajoutent des pièges d'exploitation : privilèges par défaut limités aux objets créés par le rôle de migration, rôle absent qui laisse la base bloquée en `P3009`, shadow database qui exige `CREATEDB`, commentaires `/// @personal` accessibles seulement par une API interne de Prisma, et tag npm `latest` qui pointe sur une release candidate de Prisma 8.

## Facteurs de décision

- **Garder le garde-fou appliqué par la base** : c'est l'argument central de l'ADR 0008.
- **Dire honnêtement ce que la base protège**, et outiller le reste.
- **Rendre le déploiement reproductible**, sans commande manuelle de rattrapage.

## Options envisagées

**Option A — Un client unique connecté en superutilisateur, garde-fou reporté sur la revue.** Simple, une seule connexion. Mais c'est renoncer à ce qui distingue l'ADR 0008 : « la règle est appliquée par la base, pas par la revue de code ». Écarté.

**Option B — Un client généré par contexte** (un générateur par fichier Prisma). Un contexte ne verrait même pas les types des autres. Mais Prisma génère un client pour l'ensemble du schéma ; le découper suppose autant de schémas Prisma que de contextes, et donc de casser le schéma multi-fichiers et les migrations communes. Écarté.

**Option C — Un client généré, instancié une fois par contexte avec la connexion de son rôle.** Testé : `channel` peut écrire du code qui cible `identity` (le type existe), mais la requête échoue à l'exécution en `42501`. Le lint d'imports de l'ADR 0018 empêche un module de construire le client d'un autre. **Retenu.**

## Décision

### 1. Un client par contexte

- `packages/db` exporte une **fabrique**, jamais une instance : `createContextClient({ context })`. Elle lit l'URL propre au contexte (`DATABASE_URL_CHANNEL`, `DATABASE_URL_STREAM`…), dont le rôle est `app_<contexte>`.
- Chaque module (ADR 0002) reçoit son instance par injection. Le lint d'imports de l'ADR 0018 interdit à un module d'appeler la fabrique pour un autre contexte.
- **Pools de connexions** : un pool par contexte et par instance d'API. Le total (contextes × taille de pool × instances) est dimensionné face au `max_connections` de PostgreSQL, derrière un pooler (PgBouncer ou celui de l'hébergeur) dès la mise en production.
- Ce paragraphe remplace, dans les notes d'implémentation de l'ADR 0008, la ligne « Client Prisma unique dans `packages/db` ».

### 2. Pas de transaction entre contextes

Une transaction ne couvre qu'un contexte. La cohérence entre contextes passe par les events et l'outbox (ADR 0002, ADR 0003, règle 3). La mention de l'ADR 0008 (« transactions cross-contexte encore possibles quand c'est indispensable ») est retirée : ce n'est plus possible, et c'est cohérent avec l'ADR 0003.

### 3. Une table `outbox` par schéma

L'outbox (ADR 0002, règle 2) est écrite dans la même transaction que l'état métier, donc par le rôle du contexte. Il y a une table `outbox` dans chaque schéma qui publie des events (`channel.outbox`, `moderation.outbox`, `monetization.outbox`…), pas une table globale. Le relais lit toutes ces tables avec un rôle dédié, `app_outbox_relay`, qui n'a que `SELECT` et `UPDATE` sur elles.

### 4. Enums : jamais partagés, toujours préfixés

- Un enum n'est utilisé que dans le schéma où il est défini. Deux contextes qui ont besoin de la même liste de valeurs ont chacun leur enum.
- Les noms d'enums sont préfixés par le contexte (`ChannelVisibility`, `EditorialVisibility`), puisqu'un nom est unique pour toute la base. La même contrainte s'applique aux noms de modèles.

### 5. Lint de schéma Prisma en CI

Un script lit le schéma via `getDMMF` et échoue :

- sur toute relation dont les deux modèles sont dans des schémas différents. C'est **le seul garde-fou** contre une clé étrangère entre schémas ;
- sur tout enum utilisé hors de son schéma ;
- sur tout champ dont le nom évoque une donnée personnelle (`email`, `ip`, `*Id` vers un compte…) sans annotation `/// @personal` ni `/// @not-personal`. L'inventaire produit alimente le test d'anonymisation de l'ADR 0008.

`getDMMF` appartient à `@prisma/internals`, qui n'est pas une API publique, et le DMMF ne donne pas le schéma d'un enum (il faut relire les fichiers `.prisma`). L'accès est donc isolé dans un seul fichier d'outillage, et la version de Prisma est épinglée. Le script est ajouté au pipeline de l'ADR 0018.

### 6. Droits, rôles et migrations

- **Les `GRANT` et `ALTER DEFAULT PRIVILEGES FOR ROLE migrator IN SCHEMA …` vivent dans la première migration**, ajoutés au SQL généré par `migrate dev --create-only`. Ils sont versionnés et rejoués à l'identique sur une base neuve et dans la shadow database.
- **Toute création d'objet passe par le rôle `migrator`**, y compris un correctif manuel en production : les privilèges par défaut ne s'appliquent qu'à ses objets. Une table créée par un autre rôle est inaccessible aux rôles de contexte.
- **Les rôles sont provisionnés par l'infrastructure, avant le premier déploiement.** Ce sont des objets du cluster, pas de la base. Sans eux, `migrate deploy` échoue puis laisse la base bloquée (`P3009`) jusqu'à un `migrate resolve` manuel. Le pipeline vérifie leur existence avant de lancer le job de migration.
- **Le verrou consultatif maison du job de migration est retiré** (notes d'implémentation de l'ADR 0008). Prisma pose déjà le sien : deux `migrate deploy` simultanés s'enchaînent proprement. Le job reste unique par construction.
- **Shadow database** : `CREATEDB` donné au rôle de migration en développement seulement. Si l'hébergeur le refuse, `shadowDatabaseUrl` sur le **même cluster**, puisque la première migration accorde des droits à des rôles qui doivent y exister. `migrate deploy` n'en a pas besoin en production.

### 7. Ce que la base ne protège pas

La base protège les **tables**, pas les **valeurs**. `app_moderation` peut écrire n'importe quelle ligne dans `authz.RoleAssignment`, y compris un rôle `owner` ou `admin`. La règle « qui peut nommer qui » (ADR 0006) reste entièrement dans le domaine, testée au niveau des use-cases. Une Row-Level Security pourrait la doubler en base ; ce n'est pas retenu à ce stade, parce que la règle a des conditions métier (plafonds par chaîne, hiérarchie des rôles) qu'une politique RLS dupliquerait mal.

### 8. Version de Prisma

Prisma épinglé en `7.10.x`, jamais sur `latest` tant que ce tag pointe sur une release candidate. Particularités de Prisma 7 à respecter : configuration dans `prisma.config.ts`, générateur `prisma-client` avec `output` obligatoire, driver adapter `@prisma/adapter-pg`, et `prisma generate` lancé explicitement après `migrate dev`.

## Conséquences

### Positives

- Le garde-fou de l'ADR 0008 fonctionne vraiment, et sa limite est écrite.
- Les deux trous que Prisma ne signale pas (FK et enums entre schémas) sont fermés par la CI.
- Le déploiement ne dépend plus d'une commande manuelle de rattrapage.

### Négatives

- Plusieurs pools de connexions, à dimensionner et à surveiller.
- Plus aucune transaction entre contextes : certains parcours deviennent éventuellement cohérents, et doivent être conçus comme tels.
- Une table `outbox` par schéma, et un relais qui les parcourt toutes.
- Un outil de CI qui dépend d'une API interne de Prisma.

### Risques et mitigations

- **Risque : saturation des connexions.** Mitigation : pooler dès la production ; alerte sur le nombre de connexions ouvertes par rôle.
- **Risque : `@prisma/internals` change.** Mitigation : accès isolé dans un fichier, Prisma épinglé, et le lint lui-même testé sur un schéma de fixtures qui contient chaque violation.
- **Non vérifié : la cohabitation des migrations Payload et Prisma** dans le schéma `cms` (ADR 0007). Si elle pose problème, Payload reçoit sa propre base, comme l'ADR 0007 le permettait déjà.
- **Non vérifié : les droits réellement offerts par l'hébergeur** (`CREATEDB`, `CREATEROLE`, pooler). À contrôler au choix de l'hébergeur.

## Notes d'implémentation

- Tests à écrire en premier : une requête vers un autre schéma échoue avec le rôle du contexte ; `UPDATE` et `DELETE` refusés sur `audit` ; une table ajoutée par une migration est accessible sans `GRANT` ; le lint refuse une FK entre schémas et un enum partagé, et ne signale pas une FK interne.
- Rôles : `migrator` (propriétaire, migrations uniquement), `app_<contexte>` pour chacun des 8 contextes, `app_outbox_relay`.
- Le test d'anonymisation de l'ADR 0008 lit l'inventaire produit par le lint du §5, jamais le client Prisma : les commentaires `///` ne sont pas disponibles à l'exécution.
