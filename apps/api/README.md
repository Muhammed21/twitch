# @repo/api

API NestJS 11 (ADR 0002, 0009). Architecture et découpage : [plan de l'API](../../plans/api.md).

| Commande                | Effet                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm build`            | Compile `src/` vers `dist/` avec `tsc`                                    |
| `pnpm generate`         | Compile, puis écrit `openapi.json`, versionné                             |
| `pnpm start`            | Lance `dist/main.js` avec le `.env` racine                                |
| `pnpm test`             | Tests unitaires et HTTP (application NestJS sur un port libre)            |
| `pnpm test:integration` | Sondes contre la base locale migrée (`pnpm infra:up` puis `pnpm migrate`) |

| Variable                | Rôle                                                               |
| ----------------------- | ------------------------------------------------------------------ |
| `API_PORT`              | Port d'écoute, 3000 par défaut                                     |
| `DATABASE_URL_HEALTH`   | Rôle `app_health`, lecture de la version du schéma, requis         |
| `DATABASE_URL_IDENTITY` | Rôle `app_identity`, tables de better-auth, requis                 |
| `BETTER_AUTH_SECRET`    | Secret de better-auth, au moins 32 caractères, requis              |
| `BETTER_AUTH_URL`       | URL publique de l'API, origine de confiance de better-auth, requis |

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

Un DTO de réponse se déclare par `responseDto(schema)`, qui applique les conventions de `@repo/contracts` dès sa définition ; un DTO de requête reste un `createZodDto` de `z.object` strict. Une entrée invalide donne un 400 `InvalidRequestException` ; une réponse qui ne respecte pas son schéma, un 500. Les sondes `/health/*` ne font pas partie du contrat.

En CI, « Generated artefacts » vérifie que `openapi.json` est à jour, et « Contract (OpenAPI) » refuse toute rupture de `/v1` par rapport à la branche de base (`oasdiff`, `.github/scripts/openapi-breaking.sh`).

## Authentification (ADR 0005, ADR 0026)

better-auth et ses plugins `jwt` et `oauth-provider` (même version exacte) émettent les jetons de l'app iOS par OAuth PKCE, sous `/auth/oauth2/*`. Réglages, vérifiés par `identity.oauth.integration.test.ts` contre le vrai better-auth :

| Réglage                    | Valeur                                                           |
| -------------------------- | ---------------------------------------------------------------- |
| Jeton d'accès              | JWT EdDSA de 900 s, pour la ressource `<BETTER_AUTH_URL>/v1`     |
| Jeton de rafraîchissement  | 256 bits, 60 jours glissants, stocké en empreinte SHA-256        |
| Rejeu d'un jeton consommé  | même réponse pendant 30 s ; au-delà, tous les appareils révoqués |
| Clé de signature           | rotation tous les 90 jours, ancienne clé publiée encore 24 h     |
| Endpoint `/token` de `jwt` | désactivé                                                        |

Sans paramètre `resource`, le jeton d'accès est opaque : l'app iOS l'envoie toujours. Un client OAuth n'obtient de jeton pour `/v1` que s'il est lié à cette ressource (`IdentityOAuthClientResource`).
