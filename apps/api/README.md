# @repo/api

API NestJS 11 (ADR 0002, 0009). Architecture et découpage : [plan de l'API](../../plans/api.md).

| Commande                | Effet                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| `pnpm build`            | Compile `src/` vers `dist/` avec `tsc`                                    |
| `pnpm start`            | Lance `dist/main.js` avec le `.env` racine                                |
| `pnpm test`             | Tests unitaires et HTTP (application NestJS sur un port libre)            |
| `pnpm test:integration` | Sondes contre la base locale migrée (`pnpm infra:up` puis `pnpm migrate`) |

| Variable              | Rôle                                                       |
| --------------------- | ---------------------------------------------------------- |
| `API_PORT`            | Port d'écoute, 3000 par défaut                             |
| `DATABASE_URL_HEALTH` | Rôle `app_health`, lecture de la version du schéma, requis |

Une variable invalide arrête le démarrage avec le nom de la variable, jamais sa valeur.

- Routes métier sous `/v1` ; sondes `/health/live` et `/health/ready` hors préfixe. `/health/ready` répond 503 tant que la base ne porte pas `LATEST_MIGRATION` (ADR 0028 §8).
- Erreurs en `application/problem+json` (RFC 9457) : `ProblemException` pour une erreur voulue, `ZodError` en 400 avec `errors[]`, toute autre erreur en 500 sans son message, qui part au journal.
- Chaque requête reçoit un `x-correlation-id`, repris de l'appelant s'il est bien formé, présent dans le journal et dans les erreurs.
- Journal en JSON sur la sortie standard : méthode, chemin sans paramètres, statut, durée. Jamais d'en-tête, donc ni `Authorization` ni cookie.
- Les dépendances s'injectent par jeton (`@Inject(TOKEN)`), jamais par le type du paramètre.
