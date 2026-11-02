# Plan — API NestJS (`apps/api`), architecture et tranche 1

L'architecture ci-dessous n'est pas nouvelle : elle rassemble ce que les ADR décident, pour qu'on la lise d'un seul tenant. En cas d'écart, l'ADR fait foi. Une fois le socle livré (PR 1 à 4), cette section devient une page de référence dans `docs/`, qui décrit le code existant ; le plan, lui, est supprimé une fois livré.

Plans liés : [service vidéo](service-video.md). Persistance : [`packages/db`](../packages/db/README.md).

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

- `apps/` est vide ; `packages/contracts` arrive avec la PR 2. [`packages/db`](../packages/db/README.md) fournit les clients par contexte, l'outbox et `assertSchemaVersion`.
- Dépendance externe à ce plan : PR 3 du [service vidéo](service-video.md) avant la PR 11.
- Chaque PR suit le TDD (RED, GREEN, mutation, REFACTOR), reste sous le plafond de revue, et liste ses tests à écrire en premier.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                      |
| ----- | ----------- | -------------------------------------------------------------------------------------------------- |
| A1    | 4           | L'API démarre, refuse une base en retard, sert `/v1/health` et un `openapi.json` vérifié en CI     |
| A2    | 7           | L'app iOS se connecte en PKCE et appelle une route protégée avec son JWT                           |
| A3    | 11c         | Une inscription crée une chaîne ; un live démarré par le provider apparaît dans la liste des lives |
| A4    | 13          | Le propriétaire met un viewer en timeout ; l'event part vers le chat par Redis Streams             |

## Les PR de la tranche 1

### Socle

**PR 1 — Squelette `apps/api`.** NestJS 11 épinglé, `main.ts` qui parse l'environnement par Zod avant de créer l'application, préfixe `/v1`, filtre d'erreurs RFC 9457, `correlationId` par requête, logs JSON qui ne contiennent jamais `Authorization` ni un cookie. Sondes `/health/live` et `/health/ready` ; la seconde appelle `assertSchemaVersion` de `packages/db`. `packages/result`. Scope de commit `api` déjà présent.
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

**PR 6a — Plafond de 180 jours et JWKS à la racine.** Hook `before` sur `/oauth2/token` qui refuse un refresh dont l'`authTime` d'origine dépasse 180 jours ; JWKS relayé à `/.well-known/jwks.json`.
_Tests d'abord_ : `authTime` conservé à chaque rotation ; refresh accepté à 179 jours, refusé au-delà de 180 ; `/.well-known/jwks.json` sert la clé courante et la précédente pendant la grâce.

**PR 6b — Réaction à la réutilisation.** Hook de réutilisation (liste de révocation Redis de tous les `sid`, Pub/Sub, révocation des sessions web, audit) ; table d'audit minimale dans `audit`. La notification de l'utilisateur arrive avec le contexte `notification`. Le hook passe avant celui du plafond, pour qu'un jeton consommé rejoué soit toujours traité comme une réutilisation.
_Tests d'abord_ : un token consommé rejoué déclenche les quatre effets ; un rejeu dans la fenêtre de 30 s n'en déclenche aucun.

**PR 6c — Claims d'authentification (ADR 0033).** better-auth réserve `auth_time` et `amr` sans les émettre dans le jeton d'accès : une extension de claims ajoute `twitch_auth_time` et `twitch_amr`, lus sur la session par son `sid`. La session enregistre `amr` à sa création, d'après l'endpoint de connexion.
_Tests d'abord_ : claims présents après une connexion par mot de passe et inchangés après rotation ; absents si la session n'existe plus ; `["pwd", "otp", "mfa"]` sur une session ouverte par le second facteur.

**PR 7a — `packages/auth-verifier`.** `createAccessTokenVerifier` (`jose`, cache JWKS de 10 min, rechargement sur `kid` inconnu au plus une fois par minute, vérification de `aud`, `iss`, du type `at+jwt` et de l'algorithme `EdDSA`, port de révocation par `sid`, lecture de `twitch_auth_time` et `twitch_amr`).
_Tests d'abord_ : `kid` inconnu → un seul rechargement ; `sid` révoqué → refus ; token d'une autre audience → refus ; aucun rôle lu depuis le JWT (test de régression, ADR 0006).

**PR 7b — Garde et `GET /v1/me` (jalon A2).** Adapter Redis de la liste de révocation, garde NestJS (`401` avec `WWW-Authenticate: Bearer`), JWKS lu en interne par `auth.handler`, route `GET /v1/me`.
_Tests d'abord_ : sans jeton → `401` ; `sid` révoqué → `401` ; `/v1/me` rend l'utilisateur du jeton.

### Autorisation (ADR 0006)

**PR 8a — `packages/authorization`.** Rôles, actions, ability CASL construite à partir des attributions actives, matrice de la tranche 1 (voir le README du package).
_Tests d'abord_ : matrice complète (rôle × action → autorisé ou refusé) ; modérateur de A et banni de B en même temps ; tentative d'attribution hors portée refusée ; timeout expiré qui ne restreint plus rien.

**PR 8b — `RoleAssignment` et `AuthzContext`.** Modèle `AuthzRoleAssignment` dans `authz`, port `AuthzContext` : cache Redis `authz:assign:{userId}` de 300 s, invalidation explicite dans l'ordre commit → suppression → publication.
_Tests d'abord_ : attributions relues après une invalidation, la clé supprimée avant la publication ; cache servi sans relire la base ; TTL de 300 s ; lecture par pages ; lecture en base quand Redis ne répond pas.

### Contextes de la tranche 1

**PR 9a — Outbox d'`identity`.** Contrat `identity.account.registered` dans `packages/contracts/src/events/identity/` ; table `IdentityOutbox` ; event écrit dans la transaction d'inscription de better-auth (`transaction: true`, hook `user.create.before`).
_Tests d'abord_ : une inscription écrit l'event avec l'identifiant du compte ; une inscription qui échoue en cours de transaction n'écrit ni compte ni event.

**PR 9b — Relais de l'outbox vers Redis Streams.** Process `outbox-relay` (rôle `app_outbox_relay`) qui parcourt les outbox et publie sur Redis Streams ; adapter Redis Streams du port `OutboxPublisher`.
_Tests d'abord_ : un event de l'outbox arrive sur son stream ; un échec de publication le reprogramme.

**PR 9c — Contexte `channel` : création de la chaîne.** Slug dérivé du nom d'affichage (ADR 0035 : format, mots réservés, candidats), `displayName` dans `identity.account.registered`, contrat `channel.created`, tables `Channel`, `ChannelOutbox` et `ChannelProcessedEvent`. Use-case `createChannelForAccount` : dans une transaction, event déjà traité ou compte déjà doté écarté, chaîne, attribution `owner` dans `authz` et `channel.created` dans l'outbox ; invalidation des attributions après commit.
_Tests d'abord_ : slug réservé ou mal formé refusé ; event rejoué → une seule chaîne ; slug pris → candidat suivant ; aucun candidat libre → rien d'écrit, l'event se retente.

**PR 9c′ — Consommateur `channel` de `events.identity`.** Groupe `channel` créé depuis le début du stream (ADR 0034), lecture par `XREADGROUP`, `createChannelForAccount` puis `XACK`, reprise des entrées en attente d'un consommateur arrêté.
_Tests d'abord_ : inscription → chaîne créée ; un event non acquitté est relu après redémarrage ; un event d'un autre nom est acquitté sans effet.

**PR 9d — Routes de `channel`.** `GET /v1/channels/{slug}`, `PATCH /v1/channels/{id}` (titre, propriétaire et editor).
_Tests d'abord_ : modification du titre par un autre que le propriétaire ou un editor → 403.

**PR 10a — Sessions de diffusion.** Contrats `stream.started` et `stream.ended` ; tables `StreamChannel`, `StreamSession` (une seule session ouverte par chaîne, index unique partiel), `StreamOutbox`, `StreamProcessedEvent` ; décision pure `decideLifecycle` ; use-case `recordStreamLifecycle`, idempotent par identifiant d'event et par session provider, events par l'outbox.
_Tests d'abord_ : `stream.started` rejoué → une seule session ; un nouveau démarrage clôt la session restée ouverte ; une fin ne clôt qu'une fois.

**PR 10b — Webhook du provider.** Port `LiveVideoProviderPort` et `FakeLiveVideoProvider` (ADR 0001), `parseLifecycleWebhook` ; route de webhook qui vérifie la signature HMAC horodatée (fenêtre de 5 minutes, ADR 0031) **avant** toute désérialisation, puis `recordStreamLifecycle`.
_Tests d'abord_ : webhook mal signé ou trop ancien → 401 sans parsing ; webhook rejoué → une seule session.

**PR 10c — Clé de stream et lecture.** Provisionnement du canal provider à la réception de `channel.created` ; `GET /v1/channels/{id}/stream-key` (propriétaire seulement) ; URL de lecture signée.
_Tests d'abord_ : clé de stream refusée à un autre que le propriétaire ; clé absente de tout log et de toute liste.

**PR 10d — Réconciliation.** Job qui interroge le provider et clôt toute session qu'il ne connaît plus.
_Tests d'abord_ : session ouverte que le provider ne connaît plus → close par la réconciliation, avec `stream.ended`.

**PR 10e — Rotation de la clé de stream.** Clé révocable par canal (ADR 0001, ADR 0031 `POST /channels/{id}/stream-key/rotate`) : `revokeStreamKey` du port, génération par canal dans le message HMAC du provider factice ou secret dédié aux clés, distinct de `VIDEO_WEBHOOK_SECRET` ; route de rotation réservée au propriétaire.
_Tests d'abord_ : une rotation change la clé de la chaîne et pas celle des autres ; l'ancienne clé n'est plus rendue ; rotation refusée à un autre que le propriétaire.

**PR 11a — Adapter `apps/video` du port vidéo.** Adapter HTTP de `LiveVideoProviderPort` sur le plan de contrôle de `apps/video` (`packages/video-contract`) : `Authorization: Bearer` avec `VIDEO_SERVICE_SECRET`, réponses décodées par les schémas du contrat, `404` lu comme « inconnu ». Webhooks décodés par `VideoEvent`, signature HMAC horodatée vérifiée avant tout parsing (ADR 0031) ; un type d'event inconnu mais bien signé est acquitté sans effet, pour que le service vidéo ne le réessaie pas sans fin. Choix de l'adapter par `VIDEO_PROVIDER` (`fake` ou `video`), obligatoire et sans valeur par défaut (`fake` dans `.env.example` tant que l'ingest RTMP n'existe pas), avec `VIDEO_SERVICE_URL`, validés au démarrage. La suite de contrat du port est extraite des tests du provider factice et rejouée contre les deux adapters ; côté `apps/video`, le test démarre le service comme un process à part, sans importer son code.
_Tests d'abord_ : même suite de contrat pour les deux adapters (provisionnement idempotent par chaîne, clé lisible, rotation limitée à son canal, canal inconnu → pas de clé, webhook mal signé ou trop ancien → refus sans parsing, aucune session live au départ) ; type d'event inconnu bien signé → acquitté, aucune session ; mauvais secret de service → erreur explicite, jamais une clé vide ; `VIDEO_PROVIDER=video` sans `VIDEO_SERVICE_URL` → arrêt au démarrage en nommant la variable.

**PR 11b-1 — Projection `LiveChannelView` de `discovery`.** Module `discovery` (lecture seule, ADR 0003 §6) ; tables `DiscoveryLiveChannelView` et `DiscoveryProcessedEvent` ; groupe de consommateurs `discovery` sur `events.channel` (`channel.created` pour le slug, `channel.metadata.updated` pour le titre) et `events.stream` (`stream.started`, `stream.ended`). Le TTL défensif de l'ADR 0003 est reporté : la réconciliation (PR 10d) clôt déjà les sessions que le provider ne connaît plus.
_Tests d'abord_ : un live démarré apparaît avec son slug et son titre ; un live terminé disparaît ; la fin d'une ancienne session ne retire pas la session suivante ; un démarrage plus ancien que la session en cours ne la remplace pas ; des events reçus dans le désordre entre `events.channel` et `events.stream` donnent la même projection ; un event rejoué ne change rien ; un payload hors contrat est écarté, journalisé et acquitté.

**PR 11b-2 — Reconstruction de la projection `discovery`.** Commande `discovery:rebuild` (exigée dès la tranche 1 par l'ADR 0003) qui vide la projection et la reconstruit depuis la source de vérité : `ChannelOutbox` et `StreamOutbox`, lues par `readOutboxHistory` (`@repo/db`) avec le rôle `app_projection_rebuild`, en `SELECT` seul (ADR 0041), dans l'ordre d'`occurredAt`, sous verrou exclusif ; les events repris sont marqués traités. Les streams Redis, plafonnés à environ 100 000 entrées (ADR 0034), ne suffisent pas : le `channel.created` d'une chaîne ancienne n'y est plus.
_Tests d'abord_ : la reconstruction redonne la projection des consommateurs ; une chaîne qu'aucun event ne décrit disparaît ; un consommateur ne rejoue pas un event repris par la reconstruction ; un event consommé pendant la reconstruction attend sa fin ; plus de chaînes qu'un lot d'insertion.

**PR 11c — `GET /v1/lives` (jalon A3).** Route publique servie par `discovery`, lue dans `DiscoveryLiveChannelView`. Réponse `{ items: [{ channelId, slug, title, startedAt }], nextCursor? }`, contrat `LivePage` dans `packages/contracts`. Pagination keyset (ADR 0008 §a) : tri total `liveStartedAt` décroissant puis `channelId` croissant ; curseur opaque en base64url qui porte `(startedAt, channelId)` du dernier élément, donc valide même si ce live se termine entre deux pages ; `limit` optionnel, 20 par défaut, de 1 à 50. Index `(liveStartedAt, channelId)` déclaré sur la vue.
_Critères d'acceptation_ :

- seuls les lives en cours dont le slug est connu apparaissent, triés du plus récent au plus ancien, puis par `channelId` à démarrage égal ;
- un live terminé disparaît de la liste ;
- `nextCursor` mène à la page suivante tant qu'il reste des lives, et il est absent sur la dernière page (ADR 0024 §5 : pas de `null` sur une propriété) ; liste vide → `items: []`, sans `nextCursor` ;
- un live qui démarre entre deux pages n'en décale aucune : la page suivante ne répète ni ne saute aucun live ;
- la page suivante reste juste quand le live du curseur s'est terminé entre-temps ;
- curseur illisible, `limit` hors de 1 à 50 ou non entier → `400` RFC 9457, avec le paramètre en cause dans `errors[].path` ;
- la route répond sans jeton d'accès ;
- un `EXPLAIN` sur des milliers de vues ne montre aucun `Seq Scan` sur `DiscoveryLiveChannelView` (ADR 0008 §b) ;
- `/v1/lives` figure dans l'OpenAPI généré, avec `LivePage`.

**PR 12a — `GET /v1/mobile/bootstrap`.** Endpoint BFF de présentation (ADR 0009, garde-fou n°5), public avec jeton optionnel : version minimale supportée, flags résolus, profil quand un jeton valide est présenté. Registre des flags côté serveur, chacun avec sa valeur par défaut sûre (premier flag : `session_replay`, `false`, ADR 0012 §7) ; port `FeatureFlags` avec un adapter PostHog HTTP (délai de 500 ms) et un adapter `defaults`, choisis par `FEATURE_FLAGS_PROVIDER` (`posthog` ou `defaults`), obligatoire et sans valeur par défaut ; `MOBILE_MIN_SUPPORTED_VERSION` (semver) obligatoire. Contrat `MobileBootstrap` dans `packages/contracts`.
_Critères d'acceptation_ :

- sans jeton : `200` avec `minSupportedVersion` et tous les flags du registre à leur valeur par défaut, sans `profile` (ADR 0024 §5) ; PostHog n'est pas appelé ;
- avec un jeton valide : `profile` (`id`, `name`, `email`, comme `GET /v1/me`) et les flags évalués par PostHog pour cet utilisateur ;
- jeton invalide ou expiré → `401` RFC 9457, comme les autres routes ;
- PostHog injoignable, en erreur, ou plus lent que 500 ms → `200` avec les valeurs par défaut, dans le délai ;
- un flag absent de la réponse de PostHog, ou d'un type inattendu, prend sa valeur par défaut ; un flag que PostHog connaît mais pas le registre n'est pas renvoyé ;
- `FEATURE_FLAGS_PROVIDER` ou `MOBILE_MIN_SUPPORTED_VERSION` absente ou invalide, ou `FEATURE_FLAGS_PROVIDER=posthog` sans clé ni hôte PostHog → arrêt au démarrage en nommant la variable ;
- le BFF ne contient aucune règle métier : il ne dépend que des lectures exposées par `identity` et du port `FeatureFlags`, ce que vérifient les règles d'architecture ;
- `/v1/mobile/bootstrap` figure dans l'OpenAPI généré, avec `MobileBootstrap`.

**PR 12b — Canal 2 : statut des lives en SSE.** SSE public du statut live ou terminé d'une chaîne, agrégé à un tick par seconde au plus (ADR 0004, §2). Le compteur de viewers arrive avec la présence (heartbeat du lecteur, HyperLogLog Redis, ADR 0004 §3), dans une PR suivante.
_Tests d'abord_ : un client SSE reçoit un seul tick par seconde quel que soit le nombre de changements ; un live qui démarre ou se termine est vu au tick suivant.

**PR 13 — `moderation` minimal (jalon A4).** Un use-case : le propriétaire met un utilisateur en timeout sur sa chaîne. Attribution `banned` avec `expiresAt` dans `authz`, entrée d'audit et `moderation.user.timed_out` dans la **même transaction**, publiée sur Redis Streams pour le chat.
_Tests d'abord_ : un non-propriétaire ne peut pas mettre en timeout ; le timeout expire seul ; l'event est publié même si le relais redémarre entre le commit et l'envoi ; audit écrit avec l'acteur humain.

### Déploiement local

**PR 14 — Image et Compose.** `Dockerfile` de l'API par `turbo prune`, process `outbox-relay` sur la même image, services du profil `full` dans l'ordre de l'ADR 0028 (§5), sondes et arrêt propre (§8).
_Tests d'abord_ : `docker/tests/infra.test.sh` vérifie l'ordre `migrate` → `api` → `outbox-relay`, et que l'API refuse de démarrer si la migration a échoué.

## Après la tranche 1

| Sujet                                                                                | Horizon (ADR 0021) |
| ------------------------------------------------------------------------------------ | ------------------ |
| Follow, projections, page « Suivis » (ADR 0020)                                      | T2                 |
| Modération complète : bans, mots interdits, signalements, blocages                   | T2                 |
| `notification` : APNs, préférences par chaîne                                        | T2                 |
| Catégories et tags, home curatée avec Payload (ADR 0007)                             | T2                 |
| `monetization` : RevenueCat, entitlements, bits, reversement (ADR 0013 à 0017)       | T3                 |
| TTL défensif des lives de `discovery` (ADR 0003), si la réconciliation ne suffit pas | T2                 |

## Risques suivis pendant l'exécution

- **L'intégration de better-auth dans NestJS n'a jamais été testée**, ni son adapter Prisma avec `multiSchema` (ADR 0026, points ouverts). C'est pourquoi la PR 5 est la première fonctionnalité : si elle échoue, le reste de `identity` change.
- **Érosion des frontières** : la PR 4 pose les règles avant le deuxième module ; aucune exception par `oxlint-disable` sur une règle d'architecture (REVIEW.md).
- **Délai de livraison des events** : chaque consommateur mesure l'âge du dernier event traité ; une alerte au-delà de quelques secondes signale un relais ou un groupe de consommateurs bloqué.
