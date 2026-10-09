# Plan — API NestJS (`apps/api`), architecture et tranche 1

L'architecture ci-dessous n'est pas nouvelle : elle rassemble ce que les ADR décident, pour qu'on la lise d'un seul tenant. En cas d'écart, l'ADR fait foi. Une fois le socle livré (PR 1 à 4), cette section devient une page de référence dans `docs/`, qui décrit le code existant ; le plan, lui, est supprimé une fois livré.

Plans liés : [socle de la base](socle-db.md), [service vidéo](service-video.md).

## Architecture cible

### Les process

| Process        | Contenu                                                                 | ADR              |
| -------------- | ----------------------------------------------------------------------- | ---------------- |
| `api`          | NestJS 11 : les contextes métier, better-auth sous `/auth`, l'API `/v1` | 0002, 0005, 0009 |
| `outbox-relay` | Même image que l'API, autre commande : publie les outbox                | 0028, §6         |
| `chat`         | socket.io sans NestJS, process séparé (plan à part)                     | 0004, 0022       |
| `video`        | Service vidéo maison, provider externe de `stream`                      | 0031             |
| `payload`      | Back-office, appelle l'API avec un compte de service                    | 0007             |

L'API ne touche jamais aux octets vidéo (ADR 0001) ni aux connexions de chat (ADR 0004). Elle sert le canal 2, le SSE du statut des lives (ADR 0004, §2).

### `apps/api` : un module par contexte, hexagonal

```
apps/api/src/
├── main.ts                  # parse l'environnement (Zod) avant tout, puis démarre Nest
├── app.module.ts            # importe un @Module() par contexte, rien d'autre
├── platform/                # transverse technique, sans métier : config, santé, erreurs RFC 9457,
│                            # correlationId, logs, garde d'authentification, montage de better-auth
├── bff/mobile/              # /v1/mobile/* : compositions de lectures, aucune règle (ADR 0009, garde-fou n°5)
└── modules/<contexte>/
    ├── domain/              # types immuables, règles pures, events. Aucun import NestJS, Prisma ni Zod
    ├── application/         # use-cases, ports, autorisation (ADR 0006, §4)
    ├── infrastructure/      # adapters : Prisma (client du contexte), Redis, providers
    └── presentation/        # controllers, schémas Zod, mappers DTO ↔ domaine, handlers d'events
```

Contextes de la tranche 1 : `identity`, `channel`, `stream`, `moderation` (un use-case), `discovery` (une liste). `monetization` et `notification` ne sont pas créés (ADR 0003).

### Règles de dépendance, appliquées par l'outillage

| Règle                                                                                        | Garde-fou                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `presentation` et `infrastructure` → `application` → `domain` ; le domaine ne dépend de rien | Règle d'import par couche (oxlint, `packages/lint`, ADR 0029) |
| Aucun import entre `modules/*` : les contextes se parlent par events                         | `import/no-restricted-paths` (ADR 0002, règle 1)              |
| `domain/` et `application/` n'importent ni NestJS, ni Prisma, ni Zod                         | `no-restricted-imports` par chemin (ADR 0002, 0009)           |
| Un contexte n'obtient que son client Prisma                                                  | Lint d'imports + rôle PostgreSQL du contexte (ADR 0025)       |
| `bff/` n'importe ni use-case d'écriture ni agrégat                                           | Règle d'import (ADR 0009, garde-fou n°5)                      |
| Chaque motif de chemin des règles correspond à au moins un fichier                           | Test du « linter linté » (ADR 0029, §2)                       |

### Packages partagés

| Package                   | Rôle                                                                                                     | ADR        |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `packages/contracts`      | Schémas Zod de l'API, des events entre process et des messages temps réel ; conventions de compatibilité | 0009, 0024 |
| `packages/db`             | Fabrique de clients par contexte, outbox, idempotence, contrôle de version de schéma                     | 0025       |
| `packages/authorization`  | Définition CASL, rôles, matrice de permissions ; partagé avec le chat                                    | 0006       |
| `packages/auth-verifier`  | `AccessTokenVerifier` : JWT EdDSA via JWKS (`jose`), sans I/O ; partagé avec le chat                     | 0005, 0026 |
| `packages/result`         | Type `Result` et helpers, sans dépendance : utilisable par tous les domaines                             | 0006, §4   |
| `packages/lint`           | Plugin oxlint local des règles d'architecture                                                            | 0029       |
| `packages/video-contract` | Contrat du plan de contrôle de `apps/video`, lu par l'adapter de `stream` seul                           | 0031       |

### Le chemin d'une requête

1. **Garde d'authentification** (NestJS) : rejette une requête sans access token valide, vérifié localement par `AccessTokenVerifier`. Elle ne porte aucune règle métier (ADR 0006, §4).
2. **Validation de forme** : `ZodValidationPipe` sur le corps, la requête et les paramètres → `400` (ADR 0009).
3. **Mapper** `presentation` : DTO → commande du domaine, via les constructeurs de value objects → `422` sur une valeur illégale (ADR 0009, garde-fou n°1).
4. **Use-case** `application` : `ctx.abilityFor(actor)` puis refus éventuel (`Forbidden`) ; chargement de l'agrégat ; règle pure du domaine ; persistance et outbox **dans la même transaction**.
5. **Retour** : `Result` → mapper domaine → DTO de réponse (schéma `z.looseObject`, ADR 0024) ; erreur → RFC 9457, sans distinguer « inexistant » de « refusé » sur une ressource privée (ADR 0006).

### Events entre contextes

- **Durable** (tout event dont la perte désynchronise un autre contexte) : outbox du contexte émetteur → `outbox-relay` → Redis Streams → groupe de consommateurs dans le contexte récepteur, idempotent par `processed_events` (ADR 0002, 0025). Exemples : `identity.account.registered` → `channel` ; `stream.started` → `discovery` ; `moderation.user.timed_out` → `chat`.
- **In-process** (`@nestjs/cqrs` `EventBus`) : seulement pour un event dont la perte ne coûte rien (ADR 0002, règle 2).
- Le type d'un event appartient à l'émetteur, dans `packages/contracts/src/events/<contexte>/`, versionné et validé par Zod à la consommation (ADR 0003).
- Chaque event porte un `correlationId`, propagé depuis la requête d'origine et journalisé (ADR 0002).

### Contrat et compatibilité

Zod dans `packages/contracts` → `nestjs-zod` → `openapi.json` en OpenAPI 3.1, généré avec `tsc` et versionné → client Swift. Réponses ouvertes, requêtes strictes, enums ouverts (`openEnum`), unions avec variante de repli, schéma `Uuid` nommé (ADR 0024). Toutes les routes sous `/v1`. `nestjs-zod`, `zod` et NestJS épinglés (ADR 0024, §9).

## Point de départ

- `apps/` est vide ; pas encore de `packages/contracts` ni de `packages/db`.
- Dépendances externes à ce plan : PR 1 à 2 du [socle de la base](socle-db.md) avant la PR 1 ci-dessous ; PR 4 du socle (outbox) avant la PR 9 ; PR 3 du [service vidéo](service-video.md) avant la PR 11.
- Chaque PR suit le TDD (RED, GREEN, mutation, REFACTOR), reste sous le plafond de revue, et liste ses tests à écrire en premier.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                      |
| ----- | ----------- | -------------------------------------------------------------------------------------------------- |
| A1    | 4           | L'API démarre, refuse une base en retard, sert `/v1/health` et un `openapi.json` vérifié en CI     |
| A2    | 7           | L'app iOS se connecte en PKCE et appelle une route protégée avec son JWT                           |
| A3    | 11          | Une inscription crée une chaîne ; un live démarré par le provider apparaît dans la liste des lives |
| A4    | 13          | Le propriétaire met un viewer en timeout ; l'event part vers le chat par Redis Streams             |

## Les PR de la tranche 1

### Socle

**PR 1 — Squelette `apps/api`.** NestJS 11 épinglé, `main.ts` qui parse l'environnement par Zod avant de créer l'application, préfixe `/v1`, filtre d'erreurs RFC 9457, `correlationId` par requête, logs JSON qui ne contiennent jamais `Authorization` ni un cookie. Sondes `/health/live` et `/health/ready` ; la seconde appelle `assertSchemaVersion` du socle de la base. `packages/result`. Scope de commit `api` déjà présent.
_Tests d'abord_ : variable d'environnement invalide → arrêt au démarrage en nommant la variable ; erreur de domaine → corps `application/problem+json` ; en-tête `Authorization` absent des logs ; `/health/ready` en échec si la base est en retard.

**PR 2 — `packages/contracts` et conventions.** `openEnum`, `Uuid`, helper de variante de repli, schéma d'erreur RFC 9457. Règles de lint propres au package : `z.object` interdit dans `responses/`, `z.enum` nu interdit en réponse, `.nullable()` à la racine d'un DTO et `.nullish()` interdits (ADR 0024).
_Tests d'abord_ : `openEnum` accepte une valeur inconnue ; une union avec repli décode une variante inconnue ; chaque règle de lint détecte sa fixture fautive.

**PR 3 — Pipeline OpenAPI.** `nestjs-zod` épinglé, génération de `openapi.json` en 3.1 avec `tsc`, étape `normalize-nullable`, document versionné et gate `pnpm generate` + `git diff` (ADR 0018). `oasdiff` contre `main` bloque une rupture sur `/v1`. Le test de compatibilité côté Swift appartient au plan iOS.
_Tests d'abord_ : le document généré déclare `additionalProperties` sur les réponses ; `normalize-nullable` sur ses fixtures ; une route qui retire un champ de réponse fait échouer `oasdiff`.

**PR 4 — Règles d'architecture (jalon A1).** `packages/lint` et les règles du tableau ci-dessus, livrées avec le premier module réel (`identity`, réduit à son `@Module()` et un value object `AccountId`), comme l'exige l'ADR 0029. Test du « linter linté ». Toute modification de ces règles passe en palier `critical`.
_Tests d'abord_ : pour chaque règle, une fixture qui la viole est refusée ; chaque motif de chemin correspond à au moins un fichier ; `domain/` qui importe `@nestjs/common` est refusé.

### `identity` (ADR 0005, 0026)

**PR 5 — better-auth, caractérisation.** Premier sprint `identity` : adapter Prisma de better-auth sur le schéma `identity` avec le client du contexte, monté sous `/auth` dans NestJS. Les trois packages better-auth épinglés sur la même version. Configuration de l'ADR 0026, §2.
_Tests d'abord_, contre le vrai better-auth : rotation nominale ; réutilisation qui révoque **aussi** un second appareil ; rejeu dans la fenêtre de 30 s sans révocation ; token opaque sans paramètre `resource` ; codes de récupération chiffrés en base ; endpoint `/token` du plugin `jwt` désactivé.

**PR 6 — Ce que better-auth ne fait pas.** Hook de réutilisation (liste de révocation Redis de tous les `sid`, Pub/Sub, révocation des sessions web, audit, notification) ; plafond de 180 jours ; claims `amr` et `auth_time` ; JWKS relayé à `/.well-known/jwks.json` ; table d'audit minimale dans `audit`.
_Tests d'abord_ : un token consommé rejoué déclenche les quatre effets ; refresh refusé au-delà de 180 jours ; `amr` présent dans le JWT ; `/.well-known/jwks.json` sert la clé courante et la précédente pendant la grâce.

**PR 7 — `packages/auth-verifier` et garde (jalon A2).** `AccessTokenVerifier` (`jose`, cache de 10 min, rechargement sur `kid` inconnu au plus une fois par minute, vérification de `aud` et `iss`, consultation de la liste de révocation par `sid`), garde NestJS, route `GET /v1/me`.
_Tests d'abord_ : `kid` inconnu → un seul rechargement ; `sid` révoqué → 401 ; token d'une autre audience → 401 ; aucun rôle lu depuis le JWT (test de régression, ADR 0006).

### Autorisation (ADR 0006)

**PR 8 — Noyau `authz`.** `packages/authorization` (rôles, définition CASL, matrice), modèle `RoleAssignment` dans `authz`, port `AuthzContext` : cache Redis `authz:assign:{userId}` de 300 s, invalidation explicite dans l'ordre commit → suppression → publication.
_Tests d'abord_ : matrice complète (rôle × action → autorisé ou refusé) ; modérateur de A et banni de B en même temps ; tentative d'attribution hors portée refusée ; timeout expiré qui ne restreint plus rien ; cache vidé avant la réponse.

### Contextes de la tranche 1

**PR 9 — `channel`.** Agrégat `Channel` (slug et ses mots réservés, titre), création à la réception de `identity.account.registered` (outbox `identity` → Redis Streams), attribution `owner` dans `authz`, `channel.created` dans l'outbox. `GET /v1/channels/{slug}`, `PATCH /v1/channels/{id}` (titre, propriétaire seulement). Adapter Redis Streams du relais.
_Tests d'abord_ : slug réservé ou mal formé refusé ; inscription → chaîne créée une seule fois, même si l'event est rejoué ; modification du titre par un autre que le propriétaire → 403.

**PR 10 — `stream`, contre le provider factice.** Agrégat `StreamSession`, port `LiveVideoProviderPort` et `FakeLiveVideoProvider` (ADR 0001), route de webhook qui vérifie la signature **avant** toute désérialisation, `stream.started` et `stream.ended` par l'outbox, job de réconciliation, `GET /v1/channels/{id}/stream-key` (propriétaire seulement), URL de lecture.
_Tests d'abord_ : webhook mal signé → 401 sans parsing ; `stream.started` rejoué → une seule session ; session ouverte que le provider ne connaît plus → close par la réconciliation ; clé de stream absente de tout log et de toute liste.

**PR 11 — Adapter `apps/video` (jalon A3).** Adapter de `LiveVideoProviderPort` sur le plan de contrôle du service vidéo (`packages/video-contract`), avec le secret de service et la vérification HMAC de ses webhooks. Plus `discovery` minimal : projection `LiveChannelView` alimentée par `stream.started`, `stream.ended` et `channel.metadata.updated` ; `GET /v1/lives` paginé par curseur à tri total ; commande de reconstruction de la projection (exigée dès la tranche 1 par l'ADR 0003).
_Tests d'abord_ : même suite de contrat pour l'adapter factice et l'adapter `apps/video` ; un live terminé disparaît de la liste ; pagination stable quand un live démarre entre deux pages ; reconstruction qui redonne la même projection.

**PR 12 — Canal 2 et BFF mobile.** SSE public du statut des lives et du compteur de viewers, agrégé à un tick par seconde (ADR 0004, §2) ; `GET /v1/mobile/bootstrap` : version minimale supportée, flags résolus avec leurs valeurs par défaut sûres, profil (ADR 0009, 0012).
_Tests d'abord_ : un client SSE reçoit un seul tick par seconde quel que soit le nombre d'entrées ; `bootstrap` répond même si PostHog est injoignable ; `bootstrap` ne contient aucune règle métier.

**PR 13 — `moderation` minimal (jalon A4).** Un use-case : le propriétaire met un utilisateur en timeout sur sa chaîne. Attribution `banned` avec `expiresAt` dans `authz`, entrée d'audit et `moderation.user.timed_out` dans la **même transaction**, publiée sur Redis Streams pour le chat.
_Tests d'abord_ : un non-propriétaire ne peut pas mettre en timeout ; le timeout expire seul ; l'event est publié même si le relais redémarre entre le commit et l'envoi ; audit écrit avec l'acteur humain.

### Déploiement local

**PR 14 — Image et Compose.** `Dockerfile` de l'API par `turbo prune`, process `outbox-relay` sur la même image, services du profil `full` dans l'ordre de l'ADR 0028 (§5), sondes et arrêt propre (§8).
_Tests d'abord_ : `docker/tests/infra.test.sh` vérifie l'ordre `migrate` → `api` → `outbox-relay`, et que l'API refuse de démarrer si la migration a échoué.

## Après la tranche 1

| Sujet                                                                          | Horizon (ADR 0021) |
| ------------------------------------------------------------------------------ | ------------------ |
| Follow, projections, page « Suivis » (ADR 0020)                                | T2                 |
| Modération complète : bans, mots interdits, signalements, blocages             | T2                 |
| `notification` : APNs, préférences par chaîne                                  | T2                 |
| Catégories et tags, home curatée avec Payload (ADR 0007)                       | T2                 |
| `monetization` : RevenueCat, entitlements, bits, reversement (ADR 0013 à 0017) | T3                 |

## Risques suivis pendant l'exécution

- **L'intégration de better-auth dans NestJS n'a jamais été testée**, ni son adapter Prisma avec `multiSchema` (ADR 0026, points ouverts). C'est pourquoi la PR 5 est la première fonctionnalité : si elle échoue, le reste de `identity` change.
- **Érosion des frontières** : la PR 4 pose les règles avant le deuxième module ; aucune exception par `oxlint-disable` sur une règle d'architecture (REVIEW.md).
- **Délai de livraison des events** : chaque consommateur mesure l'âge du dernier event traité ; une alerte au-delà de quelques secondes signale un relais ou un groupe de consommateurs bloqué.
