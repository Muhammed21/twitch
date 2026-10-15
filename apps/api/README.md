# @repo/api

API NestJS 11 (ADR 0002, 0009). Architecture et découpage : [plan de l'API](../../plans/api.md).

| Commande                | Effet                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm build`            | Compile `src/` vers `dist/` avec `tsc`                                    |
| `pnpm generate`         | Compile, puis écrit `openapi.json`, versionné                             |
| `pnpm start`            | Lance `dist/main.js` avec le `.env` racine                                |
| `pnpm test`             | Tests unitaires et HTTP (application NestJS sur un port libre)            |
| `pnpm test:integration` | Sondes contre la base locale migrée (`pnpm infra:up` puis `pnpm migrate`) |

| Variable                | Rôle                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `API_PORT`              | Port d'écoute, 3000 par défaut                                                          |
| `DATABASE_URL_HEALTH`   | Rôle `app_health`, lecture de la version du schéma, requis                              |
| `DATABASE_URL_IDENTITY` | Rôle `app_identity`, tables de better-auth, requis                                      |
| `BETTER_AUTH_SECRET`    | Secret de better-auth, au moins 32 caractères, requis                                   |
| `BETTER_AUTH_URL`       | URL publique de l'API, origine de confiance de better-auth, requis                      |
| `REDIS_URL`             | Redis (`redis://` ou `rediss://`) : liste de révocation des sessions et Pub/Sub, requis |

Une variable invalide arrête le démarrage avec le nom de la variable, jamais sa valeur.

- Routes métier sous `/v1` ; sondes `/health/live` et `/health/ready` hors préfixe. better-auth (ADR 0005, ADR 0026) est monté sous `/auth`, avant l'analyse du JSON qu'il fait lui-même ; ses tables `Identity…` vivent dans le schéma `identity`, avec le client Prisma du contexte. `/health/ready` répond 503 tant que la base ne porte pas `LATEST_MIGRATION` (ADR 0028 §8).
- Les corps de requête de `/v1` sont en JSON, et seulement en JSON : c'est le contrat (ADR 0009), et refuser `application/x-www-form-urlencoded` ferme la porte aux requêtes envoyées par un formulaire d'un autre site sans requête préalable CORS (CSRF). `/auth` lit ses corps lui-même.
- Erreurs en `application/problem+json` (RFC 9457) : `ProblemException` pour une erreur voulue, `InvalidRequestException` (validation des entrées) en 400 avec `errors[]`, toute autre erreur, `ZodError` interne comprise, en 500 sans son message, qui part au journal.
- Chaque requête reçoit un `x-correlation-id`, repris de l'appelant s'il est bien formé, présent dans le journal et dans les erreurs.
- Journal en JSON sur la sortie standard : méthode, chemin sans paramètres, statut, durée. Jamais d'en-tête, donc ni `Authorization` ni cookie.
- Les dépendances s'injectent par jeton (`@Inject(TOKEN)`), jamais par le type du paramètre.

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

## Autorisation (ADR 0006)

Les droits se décident dans les use-cases, à partir de `AuthzContext` (`@repo/authorization`) ; un garde NestJS ne porte aucune règle métier. `apps/api/src/authz/` implémente ce port sur PostgreSQL et Redis :

- `createAuthzContext({ prisma, redis, now })` lit les attributions actives de `authz.AuthzRoleAssignment`, par pages de 500 (ADR 0008), puis les garde sous `authz:assign:{userId}` pendant 300 s. Si Redis ne répond pas, la base est lue directement.
- Une écriture sur `AuthzRoleAssignment` (contextes `channel` et `moderation` seulement, jamais de `DELETE`) appelle `invalidateAssignments({ redis, userId })` **après le commit** : la clé est supprimée, puis `{ userId }` est publié sur `authz.invalidated`. Ce canal est un indice de cache ; une sanction passe par l'outbox et Redis Streams.
