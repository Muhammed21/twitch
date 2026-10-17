# @repo/api

API NestJS 11 (ADR 0002, 0009). Architecture et découpage : [plan de l'API](../../plans/api.md).

| Commande                | Effet                                                                                                                                                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`            | Compile `src/` vers `dist/` avec `tsc`                                                                                                                                                                                                                                                 |
| `pnpm generate`         | Compile, puis écrit `openapi.json`, versionné                                                                                                                                                                                                                                          |
| `pnpm start`            | Lance `dist/main.js` avec le `.env` racine                                                                                                                                                                                                                                             |
| `pnpm test`             | Tests unitaires et HTTP (application NestJS sur un port libre)                                                                                                                                                                                                                         |
| `pnpm test:integration` | Sondes contre la base locale migrée (`pnpm infra:up` puis `pnpm migrate`)                                                                                                                                                                                                              |
| `pnpm seed:dev`         | Enregistre le client iOS `twitch-ios-dev` (`twitch://oauth/callback`) et le compte `viewer_dev` (`viewer@twitch.local`) / `twitch-dev-password` ; idempotent, refusé si `BETTER_AUTH_URL` ne vise pas la machine locale (loopback, ou son adresse réseau pour tester depuis un iPhone) |

| Variable                  | Rôle                                                                                                                                                        |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `API_PORT`                | Port d'écoute, 3000 par défaut                                                                                                                              |
| `DATABASE_URL_HEALTH`     | Rôle `app_health`, lecture de la version du schéma, requis                                                                                                  |
| `DATABASE_URL_IDENTITY`   | Rôle `app_identity`, tables de better-auth, requis                                                                                                          |
| `DATABASE_URL_CHANNEL`    | Rôle `app_channel`, chaînes et attributions, requis                                                                                                         |
| `DATABASE_URL_STREAM`     | Rôle `app_stream`, sessions de diffusion, requis                                                                                                            |
| `DATABASE_URL_MODERATION` | Rôle `app_moderation`, sanctions, requis                                                                                                                    |
| `BETTER_AUTH_SECRET`      | Secret de better-auth, au moins 32 caractères, requis                                                                                                       |
| `BETTER_AUTH_URL`         | URL publique de l'API, origine de confiance de better-auth, requis                                                                                          |
| `REDIS_URL`               | Redis (`redis://` ou `rediss://`) : liste de révocation des sessions et Pub/Sub, requis                                                                     |
| `VIDEO_WEBHOOK_SECRET`    | Secret partagé des webhooks du provider vidéo (ADR 0031), au moins 32 caractères, requis                                                                    |
| `SMTP_HOST`, `SMTP_PORT`  | Serveur SMTP des e-mails (codes de vérification), sans authentification ni TLS : Mailpit en local ; un relais authentifié arrive avec l'hébergement. Requis |
| `SMTP_FROM`               | Expéditeur des e-mails, `Twitch <no-reply@twitch.local>` par défaut                                                                                         |

Une variable invalide arrête le démarrage avec le nom de la variable, jamais sa valeur.

- Pages d'authentification (ADR 0039) : `/login`, `/login/two-factor` et `/login/styles.css`, en HTML sans JavaScript, servies avant Nest à côté de better-auth.
- Routes métier sous `/v1` ; sondes `/health/live` et `/health/ready` hors préfixe. better-auth (ADR 0005, ADR 0026) est monté sous `/auth`, avant l'analyse du JSON qu'il fait lui-même ; ses tables `Identity…` vivent dans le schéma `identity`, avec le client Prisma du contexte. `/health/ready` répond 503 tant que la base ne porte pas `LATEST_MIGRATION` (ADR 0028 §8).
- Les corps de requête de `/v1` sont en JSON, et seulement en JSON : c'est le contrat (ADR 0009), et refuser `application/x-www-form-urlencoded` ferme la porte aux requêtes envoyées par un formulaire d'un autre site sans requête préalable CORS (CSRF). `/auth` lit ses corps lui-même.
- Erreurs en `application/problem+json` (RFC 9457) : `ProblemException` pour une erreur voulue, `InvalidRequestException` (validation des entrées) en 400 avec `errors[]`, toute autre erreur, `ZodError` interne comprise, en 500 sans son message, qui part au journal.
- Chaque requête reçoit un `x-correlation-id`, repris de l'appelant s'il est bien formé, présent dans le journal et dans les erreurs.
- Journal en JSON sur la sortie standard : méthode, chemin sans paramètres, statut, durée. Jamais d'en-tête, donc ni `Authorization` ni cookie.
- Les dépendances s'injectent par jeton (`@Inject(TOKEN)`), jamais par le type du paramètre.
- Chaque commande Redis passe par `withRedisDeadline` (`platform/redis-deadline.ts`) : sans réponse en 2 s, elle échoue côté appelant, même déjà envoyée, et l'appelant applique son repli (révocation « indisponible », lecture de la base, event reprogrammé). Le `timeout` du client `redis` ne borne que l'attente avant l'envoi.

## Contrat OpenAPI

`openapi.json` est le contrat que consomme le client Swift (ADR 0009, ADR 0024). Il est généré depuis l'API compilée par `tsc` (jamais `tsx` : sans métadonnées de décorateurs, le document perd ses paramètres), en OpenAPI 3.1, puis :

- `Problem` est publié sous son nom et sert de réponse `default` (`application/problem+json`) à chaque opération ;
- le suffixe `_Output` de `nestjs-zod` est retiré des noms de schémas ;
- la racine d'un schéma de réponse 2xx est rouverte (`additionalProperties: {}`), que l'explorateur de `@nestjs/swagger` perd ;
- `normalize-nullable` réécrit `anyOf: [T, null]` en `type: [T, "null"]`.

Un DTO de réponse se déclare par `responseDto(schema)`, qui applique les conventions de `@repo/contracts` dès sa définition ; le composant OpenAPI prend le nom de la classe, donc une réponse de `@repo/contracts` se déclare `class Me extends responseDto(responses.Me)` ; un DTO de requête reste un `createZodDto` de `z.object` strict. Une entrée invalide donne un 400 `InvalidRequestException` ; une réponse qui ne respecte pas son schéma, un 500. Les sondes `/health/*` ne font pas partie du contrat.

En CI, « Generated artefacts » vérifie que `openapi.json` est à jour, et « Contract (OpenAPI) » refuse toute rupture de `/v1` par rapport à la branche de base (`oasdiff`, `.github/scripts/openapi-breaking.sh`).

## Authentification (ADR 0005, ADR 0026)

better-auth et ses plugins `jwt`, `oauth-provider` et `two-factor` (même version exacte) émettent les jetons de l'app iOS par OAuth PKCE, sous `/auth/oauth2/*`. Réglages, vérifiés par `identity.oauth.integration.test.ts` et `identity.two-factor.integration.test.ts` contre le vrai better-auth :

| Réglage                     | Valeur                                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jeton d'accès               | JWT EdDSA de 900 s, pour la ressource `<BETTER_AUTH_URL>/v1`                                                                                                     |
| Contexte d'authentification | `twitch_auth_time` (création de la session) et `twitch_amr` (`pwd`, puis `otp` et `mfa` après le second facteur), absents si la session n'existe plus (ADR 0033) |
| Jeton de rafraîchissement   | 256 bits, 60 jours glissants, stocké en empreinte SHA-256                                                                                                        |
| Durée absolue               | 180 jours depuis l'authentification, conservée à chaque rotation ; au-delà, `invalid_grant`                                                                      |
| Rejeu d'un jeton consommé   | même réponse pendant 30 s, conservée chiffrée par `BETTER_AUTH_SECRET` ; au-delà, tous les appareils révoqués                                                    |
| Réutilisation hors fenêtre  | toutes les sessions de l'utilisateur révoquées, voir ci-dessous                                                                                                  |
| Clé de signature            | rotation tous les 90 jours, ancienne clé publiée encore 24 h, JWKS à `/.well-known/jwks.json`                                                                    |
| Endpoint `/token` de `jwt`  | désactivé                                                                                                                                                        |
| Second facteur              | TOTP sous `/auth/two-factor/*`, actif après vérification d'un premier code                                                                                       |
| Codes de récupération       | 10, à usage unique, chiffrés par `BETTER_AUTH_SECRET` comme le secret TOTP                                                                                       |

Un jeton consommé rejoué hors de la fenêtre de 30 s déclenche `revokeAllSessions` (`application/`), avant le plafond de 180 jours :

1. en une transaction : refresh tokens de l'utilisateur révoqués, sessions web supprimées, entrée `identity.session.revoked` dans `audit.AuditEntry` ;
2. chaque `sid` sur la liste de révocation Redis, clé `identity:revoked-sid:<sid>`, pour 15 min (la durée d'un jeton d'accès) ;
3. `{ userId, sids }` publié sur le canal `identity.session.revoked`, pour que le chat ferme les sockets.

better-auth répond ensuite `invalid_grant`.

Une route protégée porte `@UseGuards(AccessTokenGuard)` et lit l'identité par `@CurrentIdentity()` (`platform/authentication.ts`). Le garde vérifie le jeton avec `@repo/auth-verifier` : JWKS lu en interne par `auth.handler`, émetteur `<BETTER_AUTH_URL>/auth`, audience `<BETTER_AUTH_URL>/v1`, `sid` cherché sur la liste de révocation Redis. Un refus répond `401` en `application/problem+json`, avec `WWW-Authenticate: Bearer`, et `error="invalid_token"` quand un jeton était présenté. `GET /v1/me` rend le compte du jeton (`Me`). Comptes et sessions sont identifiés par des UUID.

Une inscription est une transaction (`transaction: true` de l'adapter Prisma) : compte, mot de passe et event `identity.account.registered` (`@repo/contracts`, `events.identity`) dans `identity.IdentityOutbox`, ou rien. L'event est écrit par le plugin `identityOutbox` dans un hook `user.create.before`, avec l'adapter de la transaction (`getCurrentAdapter`), et porte l'identifiant du compte. `payload` est déclaré `string` auprès de better-auth : un champ `json` y serait écrit en texte.

Sans paramètre `resource`, le jeton d'accès est opaque : l'app iOS l'envoie toujours. Un client OAuth n'obtient de jeton pour `/v1` que s'il est lié à cette ressource (`IdentityOAuthClientResource`).

## Relais de l'outbox (ADR 0034)

`pnpm --filter @repo/api start:outbox-relay` lance le process `outbox-relay` (`src/outbox-relay/main.ts`), sur la même image que l'API (ADR 0028). Il lit `DATABASE_URL_OUTBOX_RELAY` (rôle `app_outbox_relay`), `REDIS_URL` et `OUTBOX_RELAY_INTERVAL_MS` (1000 par défaut), puis, à chaque passe, relaie chaque outbox de `OUTBOXES` avec `relayOutboxBatch` (`@repo/db`) :

- chaque event part sur le stream `events.<contexte>` (`events.identity`), coupé à environ 100 000 entrées ;
- une entrée porte `id`, `name`, `version`, `occurredAt` (ISO 8601, UTC) et `payload` (JSON) ; un consommateur déduplique par `id` ;
- une publication en échec reprogramme l'event ; une outbox illisible est journalisée sans bloquer les suivantes.

`SIGTERM` ou `SIGINT` termine la passe en cours, puis ferme Redis et le pool.

Une nouvelle outbox s'ajoute à `OUTBOXES` (`src/outbox-relay/outbox-relay.ts`), et sa migration accorde les droits du relais (voir [`packages/db`](../../packages/db/README.md)).

## Chaînes (ADR 0003, ADR 0035)

`modules/channel` crée la chaîne d'un compte à la réception de `identity.account.registered` :

- le slug se déduit du nom d'affichage (`domain/channel-slug.ts`) : format `^[a-z0-9_]{4,25}$`, mots réservés refusés, puis candidats `nom`, `nom_2` à `nom_9` et `nom_<12 premiers caractères hexadécimaux de l'identifiant du compte>` ; le premier libre est retenu ;
- `createChannelForAccount` écrit, dans une transaction du client `channel` : l'event dans `ChannelProcessedEvent` (handler `channel.create-on-registration`), la chaîne, l'attribution `owner` (`grantedBy` `svc:channel-registration`) et `channel.created` dans `ChannelOutbox`. Un event déjà traité, ou un compte qui a déjà sa chaîne, n'écrit rien ;
- après le commit, les attributions du propriétaire sont invalidées (`invalidateAssignments`) ; un échec est rendu dans le résultat (`cacheInvalidated: false`), sans annuler la chaîne ;
- sans candidat libre, la transaction échoue sans rien écrire, et l'event se retente.

Routes :

- `GET /v1/channels/{slug}` rend la chaîne (`Channel` : `id`, `slug`, `title`, `ownerId`), sans jeton ; un slug inconnu répond 404 ;
- `PATCH /v1/channels/{id}` (jeton requis, corps `{ "title": string }`) change le titre : 404 pour une chaîne inconnue ou un identifiant qui n'est pas un UUID, 403 sans le droit `update` sur la chaîne (propriétaire ou editor, perdu par un banni, ADR 0006), puis 422 pour un titre de plus de 140 caractères une fois rogné. Le titre et `channel.metadata.updated` (`{ channelId, title }`) s'écrivent dans la même transaction.

L'API consomme `events.identity` dans le groupe `channel` (`platform/stream-consumer.ts`, ADR 0034), sous le nom de consommateur `<machine>-<pid>` et le client Redis `api-stream-consumer` :

- le groupe se crée depuis le début du stream, et se recrée quand Redis répond `NOGROUP` ;
- chaque passe reprend d'abord par `XAUTOCLAIM` les entrées en attente depuis plus de 30 s chez un autre consommateur, puis lit les nouvelles par `XREADGROUP` (attente de 1 s) ;
- une entrée traitée, illisible ou d'un event sans handler est acquittée ; une entrée dont le handler échoue reste en attente et sera reprise ;
- `identity.account.registered` appelle `createChannelForAccount` (`presentation/identity-event-handlers.ts`) ; une version autre que 1 reste en attente, un payload hors contrat est journalisé et écarté ;
- une passe en échec est journalisée et suivie d'une pause de 1 s ; l'arrêt de l'API interrompt la pause.

## Sessions de diffusion (ADR 0001)

`modules/stream` tient l'état des lives : le provider est la source de vérité technique, `StreamSession` la source de vérité métier.

- `recordStreamLifecycle` traite un event de cycle de vie du provider (`started` ou `ended`, avec son canal et sa session provider) dans une transaction du client `stream` : l'event est inscrit dans `StreamProcessedEvent` (handler `stream.record-lifecycle`), le canal provider est retrouvé dans `StreamChannel`, puis `decideLifecycle` (`domain/stream-lifecycle.ts`) décide.
- Un démarrage ouvre une session et publie `stream.started` ; s'il trouve une autre session ouverte sur la chaîne, il la clôt d'abord et publie son `stream.ended`. Un démarrage déjà connu, même sous un autre identifiant d'event, ne fait rien (`unchanged`).
- Les webhooks arrivent dans le désordre (ADR 0001). Un démarrage plus ancien qu'une session déjà connue de la chaîne est archivé clos, de son début au début de la session qui le suit, sans event ; le live en cours reste ouvert.
- Une fin clôt la session ouverte et publie `stream.ended` ; une session déjà close ne change pas (`unchanged`). Une session n'est jamais close avant son début.
- Une fin dont la session est encore inconnue n'est pas enregistrée (`not-yet-started`) : la transaction est annulée, l'event n'est pas marqué traité, et le provider la réémet.
- Un canal provider inconnu n'ouvre rien (`unknown-channel`).
- La base n'admet qu'une session ouverte par chaîne (index unique partiel `StreamSession_channelId_open_key`).
- Les events d'un même instant (clôture et nouveau démarrage) n'ont pas d'ordre garanti dans l'outbox : un consommateur raisonne par `sessionId`.

Le provider signale le début et la fin d'un live par `POST /v1/webhooks/video`, hors contrat OpenAPI (route interne du provider) :

- le corps est lu brut (`useRawWebhookBodies`, 16 Kio au plus, 413 au-delà), sans passer par le parseur JSON de l'API ;
- l'en-tête `X-Video-Signature: t=<secondes>,v1=<HMAC-SHA256 hexadécimal de "<t>.<corps brut>">` est vérifié **avant** toute lecture du corps (`platform/webhook-signature.ts`) : secret `VIDEO_WEBHOOK_SECRET`, comparaison à temps constant, horodatage entier à 5 minutes au plus de l'heure de réception dans les deux sens ;
- le provider (`LiveVideoProviderPort.parseLifecycleWebhook`, ici `FakeLiveVideoProvider`) valide ensuite le corps (`id`, `type` `stream.started` ou `stream.ended`, `channelId`, `sessionId`, `occurredAt`) et le traduit en event de cycle de vie, puis `recordStreamLifecycle` l'enregistre ;
- réponses : 204 (enregistré, déjà traité, canal provider inconnu), 409 (fin reçue avant son démarrage : le provider réémet), 401 (signature absente, fausse ou hors fenêtre), 400 (corps signé invalide).

Clé de stream :

- à la réception de `channel.created` (groupe `stream` sur `events.channel`, client Redis dédié), `provisionStreamChannel` crée le canal chez le provider et garde le lien dans `StreamChannel` ; une chaîne déjà provisionnée ne rappelle pas le provider. Une version autre que 1 reste en attente, un payload hors contrat est journalisé et écarté ;
- `GET /v1/channels/{id}/stream-key` (jeton requis) rend `{ streamKey, ingestUrl }` avec `Cache-Control: no-store`, lus chez le provider à chaque appel : 403 sans le droit `readStreamKey` (propriétaire seulement, perdu par un banni, ADR 0006), 404 pour une chaîne non provisionnée ou un identifiant qui n'est pas un UUID ;
- `POST /v1/channels/{id}/stream-key/rotate` (jeton requis) révoque la clé chez le provider (`revokeStreamKey`, ADR 0031) et rend la nouvelle, avec les mêmes réponses : 200 et `Cache-Control: no-store`, 403 sans le droit `rotateStreamKey` (propriétaire seulement, perdu par un banni), 404 ;
- la clé n'est ni stockée par l'API, ni journalisée, ni présente dans une autre réponse (ADR 0001) ;
- `FakeLiveVideoProvider` est déterministe : canal `fake-<channelId>`, clé dérivée par HMAC de `VIDEO_WEBHOOK_SECRET` et de la génération du canal, ingest `rtmp://127.0.0.1:1935/live`. Chaque rotation incrémente la génération, gardée en mémoire : un redémarrage de l'API rend la clé d'avant les rotations.

Une erreur client exposée par une bibliothèque HTTP (`expose: true`, statut 4xx, comme celles de body-parser) garde son statut dans le `Problem`.

Un webhook de fin perdu laisse un live fantôme : `reconcileStreamSessions` le rattrape (ADR 0001, 0031) :

- toutes les minutes, à partir d'une minute après le démarrage de l'API (`platform/periodic-job.ts`), elle demande au provider ses sessions en direct (`LiveVideoProviderPort.listLiveSessions`), puis lit les sessions ouvertes par pages de 100, triées par `id` ;
- une session ouverte depuis au moins 5 minutes que le provider ne liste pas reçoit une fin à l'instant de la réconciliation, par `recordStreamLifecycle` : même décision, même `stream.ended` dans l'outbox, et une session déjà close ne change pas. L'identifiant de cette fin est dérivé de la session provider (UUID v5, `reconciliationEndEventId`) : deux instances qui réconcilient la même session ne publient qu'un `stream.ended` ;
- une session plus récente attend la réconciliation suivante, le temps que le provider la liste ;
- si le provider ou la base ne répond pas, rien n'est clos : l'échec est journalisé (`réconciliation en échec`) et la réconciliation suivante réessaie ;
- `FakeLiveVideoProvider` liste les sessions dont il a lu le webhook de démarrage, et non celui de fin, depuis le démarrage du process.

## Modération (ADR 0006)

`modules/moderation` met un utilisateur en timeout sur une chaîne :

- `POST /v1/channels/{id}/timeouts` (jeton requis, corps `{ "userId": Uuid, "durationSeconds": entier }`) rend `Timeout` (`channelId`, `userId`, `expiresAt`) en 201 : 404 pour un identifiant de chaîne qui n'est pas un UUID, 400 pour un corps invalide, 403 sans le droit `timeout` sur la cible (propriétaire ou modérateur de la chaîne, jamais contre le propriétaire, perdu par un banni), puis 422 pour une durée hors de 1 à 1 209 600 secondes (14 jours) ;
- `timeoutUser` écrit, dans une transaction du client `moderation` : l'attribution `banned` de la cible sur la chaîne avec `expiresAt` (`grantedBy` l'acteur), l'entrée `moderation.user.timed_out` de `audit.AuditEntry` (`actorId` l'humain du jeton) et `moderation.user.timed_out` (`{ channelId, userId, expiresAt }`) dans `ModerationOutbox`, relayé sur `events.moderation` pour le chat ;
- après le commit, les attributions de la cible sont invalidées ; un échec est rendu dans le résultat (`cacheInvalidated: false`) sans annuler le timeout ;
- le timeout expire seul : l'attribution n'est ni révoquée ni supprimée, elle cesse de compter à `expiresAt`. Un nouveau timeout ajoute une attribution ; la plus longue restriction en cours s'applique.

## Autorisation (ADR 0006)

Les droits se décident dans les use-cases, à partir de `AuthzContext` (`@repo/authorization`) ; un garde NestJS ne porte aucune règle métier. `apps/api/src/authz/` implémente ce port sur PostgreSQL et Redis :

- `createAuthzContext({ prisma, redis, now })` lit les attributions actives de `authz.AuthzRoleAssignment`, par pages de 500 (ADR 0008), puis les garde sous `authz:assign:{userId}` pendant 300 s. Si Redis ne répond pas, la base est lue directement.
- Une écriture sur `AuthzRoleAssignment` (contextes `channel` et `moderation` seulement, jamais de `DELETE`) appelle `invalidateAssignments({ redis, userId })` **après le commit** : la clé est supprimée, puis `{ userId }` est publié sur `authz.invalidated`. Ce canal est un indice de cache ; une sanction passe par l'outbox et Redis Streams.
