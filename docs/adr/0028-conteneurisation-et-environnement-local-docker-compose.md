# 0028 — Conteneurisation et environnement local Docker Compose

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Complète : ADR 0002 (« un `docker compose up` pour l'environnement complet »), ADR 0007 (base de Payload), ADR 0008 (Docker Compose local, ordre du pipeline, stockage objet local), ADR 0025 (provisionnement des rôles, relais de l'outbox)

## Contexte et problématique

Plusieurs ADR supposent des conteneurs et un déploiement sans jamais les décider :

- l'ADR 0002 promet un environnement complet démarrable par `docker compose up` ;
- l'ADR 0008 fixe un ordre de pipeline (migrations dans un job dédié, puis vérification de santé, puis API, puis chat), interdit toute migration dans l'image de démarrage, et prévoit MinIO pour émuler le stockage objet ;
- l'ADR 0025 exige que les rôles PostgreSQL soient « provisionnés par l'infrastructure, avant le premier déploiement », et introduit un relais d'outbox avec son propre rôle ;
- l'ADR 0007 donne à Payload « sa propre base » et un utilisateur PostgreSQL distinct ;
- l'ADR 0022 compte sur une « image Docker standard » pour le chat.

Aucun hébergeur n'est choisi, et ce choix est **volontairement reporté** : le projet tourne en local pour l'instant. Il faut pourtant décider maintenant de la forme des images et de l'environnement local. Faute de quoi les images seront écrites pour « marcher sur ma machine », et le passage à un hébergeur deviendra une réécriture au lieu d'un changement de configuration.

Plusieurs contraintes rendent le problème moins trivial qu'un Compose avec une base de données :

1. **Monorepo pnpm et Turborepo.** Construire l'image d'une app sans embarquer tout le dépôt suppose un élagage (`turbo prune`).
2. **Le chat maintient des milliers de WebSockets.** Un redémarrage brutal les coupe toutes au même instant.
3. **Les rôles PostgreSQL de l'ADR 0025** doivent exister avant la première migration, sinon la base reste bloquée en `P3009`.
4. **Deux outils de migration** : Prisma pour l'API, et le système de migrations de Payload. Aucun des deux ne doit migrer au démarrage de son application (ADR 0008).
5. **Payload est une application Next.js** : `next build` fige certaines variables et peut vouloir joindre la base, ce qui menace le principe « même image partout ».
6. **MinIO n'est plus une option** : son dépôt GitHub est archivé depuis avril 2026, donc plus maintenu.

Problématique : comment conteneuriser l'API, le relais d'outbox, le chat et Payload, et outiller un environnement local qui exerce l'ordre de déploiement réel, sans figer un hébergeur ?

## Facteurs de décision

- **Boucle de développement rapide** : rechargement à chaud et débogueur sur l'hôte, pas dans un conteneur.
- **Fidélité à la production** : pouvoir exécuter les vraies images, dans l'ordre de déploiement réel, avant d'avoir un hébergeur.
- **Portabilité** : des images qui ne dépendent d'aucun hébergeur ; toute différence entre environnements passe par la configuration.
- **Reproductibilité** : mêmes versions de PostgreSQL et de Redis en local, en CI (ADR 0018) et plus tard en production.

## Options envisagées

**Option A — Tout dans Compose, apps comprises, en mode développement** (volumes montés, `pnpm dev` dans les conteneurs). Un seul point d'entrée, mais un rechargement lent sur macOS (volumes montés), un débogueur plus pénible, et des conteneurs de développement qui ne ressemblent pas aux images de production. Écarté.

**Option B — Compose pour l'infrastructure seulement, apps sur l'hôte.** Boucle rapide, mais les Dockerfiles ne sont jamais exécutés avant la production, et l'ordre de déploiement de l'ADR 0008 n'est jamais exercé. Écarté seul.

**Option C — Compose en deux profils : infrastructure par défaut, pile complète sur demande.** Le quotidien se fait avec l'infrastructure dans Compose et les apps sur l'hôte. Un profil `full` lance les vraies images de production, avec les jobs de migration et les dépendances d'ordre. **Retenu.**

## Décision

### 1. Deux profils Compose

| Profil   | Services                                                                                    | Usage                                                                               |
| -------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| (défaut) | `postgres`, `db-init`, `redis`, `s3`, `mailpit`                                             | Développement quotidien ; les apps tournent sur l'hôte avec `pnpm dev`              |
| `full`   | les précédents, plus `migrate`, `payload-migrate`, `api`, `outbox-relay`, `chat`, `payload` | Exécuter les images de production dans l'ordre de déploiement, avant tout hébergeur |

- Un seul fichier `compose.yaml` à la racine. **Aucune étiquette flottante** : chaque image est épinglée sur une version exacte (§2). La CI de l'ADR 0018 utilise les mêmes étiquettes pour ses conteneurs de service.
- **Ports publiés sur `127.0.0.1` uniquement**, jamais sur toutes les interfaces : une base de développement sans mot de passe fort n'a pas à être visible du réseau local. Exception opt-in pour un iPhone réel : §10.
- Volumes nommés pour PostgreSQL, Redis et le stockage objet. `docker compose down -v` remet l'environnement à zéro ; `pnpm seed` le repeuple à l'identique (§9).

### 2. Services d'infrastructure, versions épinglées

| Service    | Image                      | Remarque                                                                                                                                                                                  |
| ---------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres` | `postgres:17.11-alpine`    | Version majeure du spike Prisma (ADR 0025). Héberge deux bases : `app` (API) et `payload` (§4)                                                                                            |
| `redis`    | `redis:8.8.3-alpine`       | Valkey (licence BSD, compatible) reste une alternative à trancher avec l'hébergeur, au vu de la licence de Redis 8                                                                        |
| `s3`       | `chrislusf/seaweedfs:4.47` | Passerelle S3 de SeaweedFS (Apache 2.0), à la place de MinIO, dont le dépôt est archivé. Remplace la mention de MinIO dans l'ADR 0008 ; l'API ne parle que le protocole S3, comme avec R2 |
| `mailpit`  | `axllent/mailpit:v1.31.2`  | Capture les emails de better-auth (vérification, réinitialisation) : aucun email ne part en local                                                                                         |

Chaque service a une sonde de santé Compose (`pg_isready`, `redis-cli ping`, etc.). Les étiquettes sont montées volontairement, par une PR qui fait aussi passer la CI.

### 3. Rôles PostgreSQL : un job idempotent, pas un script d'initialisation

Ce paragraphe applique en local l'exigence de l'ADR 0025, §6.

- Les rôles ne sont **pas** créés par `/docker-entrypoint-initdb.d/` : ce mécanisme ne s'exécute que sur un volume vide, et ajouter un rôle imposerait alors un `down -v`, donc la perte des données locales.
- Un service `db-init` à exécution unique, **présent dans tous les profils**, lance un script SQL **idempotent** : chaque rôle est créé s'il manque (bloc `DO` qui teste `pg_roles`), et son mot de passe est remis à la valeur de `.env`. Ajouter un rôle revient à modifier le script et relancer `docker compose up`.
- Rôles créés :

| Rôle                 | Base      | Usage                                                                                                  |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| `migrator`           | `app`     | Propriétaire, exécute les migrations Prisma. `CREATEDB` en local seulement (shadow database, ADR 0025) |
| `app_<contexte>` × 8 | `app`     | Un par contexte métier (ADR 0008 §1), `USAGE` sur son seul schéma                                      |
| `app_outbox_relay`   | `app`     | Relais de l'outbox (§6), `SELECT` et `UPDATE` sur les tables `outbox` (ADR 0025 §3)                    |
| `app_health`         | `app`     | Lecture de la version du schéma par la sonde de disponibilité (§8)                                     |
| `payload`            | `payload` | Propriétaire de la base de Payload ; aucun droit sur la base `app` (ADR 0007)                          |

- Le script crée aussi la base `payload`, propriété du rôle `payload`. Il ne crée **ni schéma, ni table, ni droit** dans la base `app` : ce sont des produits de la première migration (ADR 0025). Il ne fait que ce qu'un hébergeur fera plus tard : fournir les rôles et les bases.

### 4. Payload : sa propre base, ses propres migrations

- **Payload reçoit sa propre base `payload`**, sur la même instance PostgreSQL, conformément à l'ADR 0007 (« dans sa propre base »). Le schéma `cms` de la base `app`, que l'ADR 0008 prévoyait « si Payload partage l'instance », **n'est pas créé** : la base `app` compte 10 schémas (8 contextes, `authz`, `audit`). La cohabitation des migrations Payload et Prisma dans un même schéma, non testée (ADR 0025), n'a donc plus lieu d'être.
- **Les migrations de Payload tournent dans un job dédié** `payload-migrate`, à exécution unique, qui lance `payload migrate` avec le rôle `payload`. Les migrations au démarrage de Payload (`prodMigrations`) sont **désactivées** : c'est la règle de l'ADR 0008, appliquée au second outil de migration.
- Payload se connecte à l'API avec son compte de service (ADR 0007), jamais à la base `app`.

### 5. Ordre de démarrage du profil `full`

L'ordre de l'ADR 0008 est encodé par les dépendances Compose, et non par un script :

```
postgres (healthy) ──▶ db-init ──┬──▶ migrate ─────────┬──▶ api (healthy) ──▶ chat
                                 │                     └──▶ outbox-relay
                                 └──▶ payload-migrate ────▶ payload (healthy)
redis (healthy) ───────────────────────────────────────────▶ api, outbox-relay, chat
api (healthy) ─────────────────────────────────────────────▶ payload (compte de service)
```

- `db-init`, `migrate` et `payload-migrate` sont des services **à exécution unique** (`restart: "no"`). Leurs dépendants attendent `condition: service_completed_successfully` : une migration en échec empêche l'application correspondante de démarrer, en local comme plus tard en production.
- Une application n'est considérée comme prête que lorsque sa sonde de disponibilité répond (§8).

### 6. Le relais de l'outbox est un process à part

- Le relais (ADR 0002, règle 2 ; ADR 0025, §3) tourne dans un **process séparé** `outbox-relay`, construit à partir de la même image que l'API, avec une autre commande de démarrage.
- Motifs : il se connecte avec son propre rôle (`app_outbox_relay`), que le process de l'API n'a pas à détenir ; il se redémarre et se surveille indépendamment ; et sa charge ne concurrence pas les requêtes HTTP.
- Il lit les lignes à publier avec `FOR UPDATE SKIP LOCKED`. Plusieurs instances sont donc sûres, même si une seule est prévue.
- En développement sur l'hôte, `pnpm dev` le lance à côté de l'API, par Turborepo.

### 7. Images

Un Dockerfile par application déployable (`apps/api`, `apps/chat`, `apps/payload`). `outbox-relay` réutilise l'image de l'API.

- **Construction en plusieurs étapes** : `turbo prune <app> --docker` isole l'app et ses dépendances internes, puis installation (`pnpm install --frozen-lockfile`), build, et une étape finale qui ne contient que la sortie du build et les dépendances de production.
- **Image de base `node:24.21.0-slim`**. Node 24 est le plancher déclaré par le dépôt (`engines.node >= 24`). pnpm est activé par `corepack` à la version de `packageManager` (`pnpm@11.25.0`).
- **Utilisateur non-root** (`node`) dans l'étape finale.
- **Signaux gérés par le code, pas par un init** : le process Node est lancé directement (forme exec de `CMD`), et il est PID 1. Or un PID 1 n'a aucun gestionnaire de signal par défaut : sans code explicite, il ignore `SIGTERM`. Chaque application installe donc ses propres gestionnaires de `SIGTERM` et `SIGINT` (§8). Pas de `tini`, absent de l'image, et pas de dépendance à `init: true`, qui n'existe que dans Compose : le même comportement vaut en production. Aucune application ne lance de processus enfant, il n'y a donc pas de zombie à récupérer.
- **Aucun secret dans l'image**, ni en `ARG` ni en `ENV`.
- **Migrations** : l'image de l'API a une cible de build dédiée, `migrate`, qui contient le CLI Prisma et le dossier des migrations. L'image `api` de production ne les contient pas, ce qui rend impossible une migration au démarrage (ADR 0008).
- **Même image entre local et production, pour l'API et le chat** : ce qui change, c'est l'environnement, jamais le contenu.

**Exception Payload, en tant qu'application Next.js :**

- `next build` fige dans le bundle toute variable `NEXT_PUBLIC_*`. Règle : **aucune variable `NEXT_PUBLIC_*` dans Payload**. Toute configuration passe par des variables serveur, lues à l'exécution.
- `next build` ne doit pas joindre la base : les routes de Payload sont dynamiques, sans génération statique qui interroge la base. La CI construit l'image Payload **sans aucune base joignable**, ce qui vérifie la règle à chaque build.
- Si l'une de ces deux règles devient intenable, l'image Payload sera construite **par environnement**. Ce serait une exception assumée et documentée ici, jamais une dérive silencieuse.

### 8. Santé, démarrage et arrêt

- Deux sondes HTTP par service web : **vie** (`/health/live`, le process répond) et **disponibilité** (`/health/ready`, les dépendances sont joignables).
- **Les sondes Compose passent par Node**, puisque `node:24-slim` ne contient ni `curl` ni `wget` : `node -e "fetch('http://127.0.0.1:PORT/health/ready').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"`.
- **Version du schéma.** La sonde de disponibilité de l'API vérifie que la dernière migration attendue par son code est appliquée (ADR 0008). Les rôles `app_<contexte>` ne peuvent pas lire `_prisma_migrations`, qui appartient à `migrator` : la sonde se connecte donc avec le rôle **`app_health`**. Ce rôle n'a que `USAGE` sur le schéma de `_prisma_migrations` et `SELECT` sur cette seule table, accordés par la première migration. Le nom de la dernière migration attendue est **généré au build** à partir du dossier des migrations, puisque l'image `api` ne contient pas ce dossier (§7). La sonde vérifie que cette migration existe, qu'elle est terminée et qu'elle n'est pas annulée.
- L'environnement est validé par un schéma Zod au démarrage, avant tout le reste (ADR 0009). Une variable manquante est un crash immédiat.
- **Arrêt** : `stop_grace_period` de 45 s sur `api`, `outbox-relay`, `chat` et `payload`.
  - **API et Payload** : sur `SIGTERM`, la sonde de disponibilité passe en échec, les requêtes en cours se terminent, puis les connexions se ferment.
  - **Relais** : il termine le lot en cours, puis s'arrête sans en prendre de nouveau.
  - **Chat** : il refuse les nouveaux upgrades, puis ferme les sockets **par lots, étalés sur 30 s**. Côté client, une fermeture sans `session:revoked` est traitée comme une erreur réseau : reconnexion avec backoff et gigue (ADR 0023, §3).
  - **Limite assumée** : avec une seule instance de chat, comme en local, aucune autre instance n'accepte les reconnexions pendant le redémarrage. L'étalement des fermetures ne sert alors à rien pour la disponibilité. Il ne prendra sa valeur qu'avec au moins deux instances derrière un répartiteur, sujet de l'ADR d'hébergement (§11).

### 9. Configuration, secrets et seed

- `.env.example` versionné, qui liste chaque variable avec une valeur factice ; `.env` non versionné (déjà dans `.gitignore`).
- Variables de connexion, une par rôle :

| Variable                      | Rôle               | Utilisée par                                |
| ----------------------------- | ------------------ | ------------------------------------------- |
| `DATABASE_URL_<CONTEXTE>` × 8 | `app_<contexte>`   | API (ADR 0025)                              |
| `DATABASE_URL_MIGRATOR`       | `migrator`         | job `migrate`, et `pnpm migrate` sur l'hôte |
| `DATABASE_URL_OUTBOX_RELAY`   | `app_outbox_relay` | `outbox-relay`                              |
| `DATABASE_URL_HEALTH`         | `app_health`       | sonde de disponibilité de l'API             |
| `PAYLOAD_DATABASE_URL`        | `payload`          | Payload et `payload-migrate`                |
| `REDIS_URL`, `S3_*`, `SMTP_*` | —                  | selon les services                          |

- En local, les secrets (secret de better-auth, ADR 0026 ; mots de passe des rôles) sont générés et vivent dans `.env`. Le gestionnaire de secrets sera choisi avec l'hébergeur ; le code ne lit que des variables d'environnement, il n'aura donc pas à changer.
- **Le seed est une commande de l'hôte, pas un service Compose.** Il appelle les use-cases du domaine (ADR 0008) : il a besoin du code de l'API et d'une base déjà migrée. `pnpm seed` s'exécute sur l'hôte, après `pnpm migrate`, contre le PostgreSQL de Compose, et fonctionne de la même façon avec les deux profils.

### 10. Ce qui reste hors de Compose

- **Le provider vidéo** (ADR 0001) est managé et ne tourne pas en local. En local, l'API utilise un adapter factice derrière le port vidéo, qui simule `stream.started` et `stream.ended`. Tester les vrais webhooks du provider suppose un tunnel HTTPS vers la machine, à la demande.
- **RevenueCat et PostHog** : adapters factices en local, comme pour les tests (ADR 0014, ADR 0012).
- **App iOS** :
  - le simulateur atteint `127.0.0.1` directement, avec les deux profils ;
  - un **iPhone réel** (test demandé par l'ADR 0023) passe par l'adresse de la machine sur le réseau local, avec l'exception ATS `NSAllowsLocalNetworking` dans la configuration **Debug uniquement**. Avec les apps sur l'hôte, il suffit qu'elles écoutent sur l'interface réseau locale. **Avec le profil `full`, les ports publiés sur `127.0.0.1` rendent l'API et le chat injoignables** : un fichier optionnel `compose.lan.yaml` republie ces deux ports sur toutes les interfaces, et seulement ces deux-là, pour la durée d'un test (`docker compose -f compose.yaml -f compose.lan.yaml --profile full up`).

### 11. Hébergement : reporté, avec un critère

Le choix de l'hébergeur fera l'objet d'un ADR dédié. Il devient nécessaire **au premier besoin d'un backend joignable hors de la machine** : une bêta TestFlight, ou un test sur appareil hors du réseau local. Cet ADR devra trancher ce que celui-ci laisse ouvert : exécution des conteneurs, PostgreSQL managé (droits `CREATEROLE` et `CREATEDB`, pooler, ADR 0025), Redis ou Valkey managé (ADR 0004), gestionnaire de secrets, TLS, et un répartiteur de charge compatible WebSocket devant au moins deux instances de chat (§8).

## Conséquences

### Positives

- La promesse de l'ADR 0002 (« un `docker compose up` ») est tenue, sans ralentir la boucle quotidienne.
- L'ordre de déploiement de l'ADR 0008 s'applique aux deux outils de migration, Prisma et Payload, et le provisionnement des rôles de l'ADR 0025 est exercé dès le local.
- Payload est cloisonné dans sa propre base, et le risque de cohabitation de migrations disparaît.
- Les images sont indépendantes de l'hébergeur : le passage en production sera un changement de configuration, avec une exception connue et bornée pour Payload.

### Négatives

- Deux façons de lancer les apps (hôte et profil `full`), qui peuvent diverger : un bug qui n'apparaît qu'en conteneur ne sera vu qu'en lançant `full`.
- Trois Dockerfiles, deux jobs de migration, un job de rôles et un process de relais à maintenir, pour un projet sans hébergeur.
- Douze variables de connexion, une par rôle.
- Les dépendances externes (provider vidéo, RevenueCat, PostHog) sont factices en local.

### Risques et mitigations

- **Risque : écart de version de Node.** Le dépôt exige Node 24, mais la machine de développement a Node 22.23, la version sur laquelle les spikes du 2026-09-24 ont tourné. **La mitigation est de passer la machine en Node 24.21**, avant toute autre étape, via un `.node-version` lu par un gestionnaire de versions (fnm, mise ou volta). `engine-strict` n'est activé qu'ensuite : activé seul, il bloquerait toute installation sur la machine actuelle.
- **Risque : une régression d'infrastructure fusionnée sans être vue.** Mitigation : la CI de l'ADR 0018 construit les images et exécute le profil `full` **à chaque PR** qui touche `apps/`, `packages/db`, `docker/`, `compose*.yaml` ou un dossier de migrations, pas seulement sur `main`. Les tests des notes d'implémentation tournent dans ce job.
- **Risque : SeaweedFS diffère de R2 sur un détail du protocole S3** (URLs présignées, en-têtes). Mitigation : l'adapter de stockage a un test d'intégration contre la passerelle locale ; le comportement propre à R2 est vérifié en staging, avec l'ADR d'hébergement.
- **Risque : la règle Payload (§7) casse à une montée de version.** Mitigation : le build Payload sans base en CI le détecte immédiatement.

## Notes d'implémentation

- Fichiers : `compose.yaml`, `compose.lan.yaml`, `docker/postgres/roles.sql`, `apps/{api,chat,payload}/Dockerfile`, `.dockerignore` à la racine (qui exclut `node_modules`, `.turbo`, `.env*`, `docs/`), `.env.example`, `.node-version`.
- Tests à écrire en premier, exécutés en CI sur le profil `full` à chaque PR concernée :
  - une migration en échec empêche l'API de démarrer ;
  - le job de migration échoue proprement si un rôle manque ;
  - la sonde de disponibilité de l'API échoue sur un schéma en retard, et réussit sur le bon ;
  - `db-init` relancé deux fois de suite ne produit aucune erreur ni aucun changement ;
  - Payload démarre sans avoir migré au démarrage (`prodMigrations` désactivé), et échoue si `payload-migrate` n'a pas tourné ;
  - l'image Payload se construit sans aucune base joignable ;
  - sur `SIGTERM`, le chat ferme ses sockets par lots : les **instants de déconnexion** observés par les clients s'étalent sur environ 30 s, et toutes les sockets sont fermées avant 45 s. Le test mesure les fermetures côté serveur, pas les reconnexions : avec une seule instance, les reconnexions ne prouvent rien (§8). La gigue de reconnexion est testée à part, dans les tests unitaires de `ChatSession` ;
  - chaque application s'arrête proprement sur `SIGTERM` en tant que PID 1, sans init.
- `docker compose up` sans profil ne lance jamais d'app : c'est le mode quotidien.
