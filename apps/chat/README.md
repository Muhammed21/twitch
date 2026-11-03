# @repo/chat

Service de chat temps réel, process Node séparé (ADR 0004, ADR 0022). Découpage : [plan du chat](../../plans/chat.md).

| Commande                | Effet                                                       |
| ----------------------- | ----------------------------------------------------------- |
| `pnpm start`            | Lance `src/main.ts` avec le `.env` racine                   |
| `pnpm test`             | Tests unitaires, serveur sur un port libre, process complet |
| `pnpm test:coverage`    | Tests et couverture 100 %                                   |
| `pnpm test:integration` | Lecture de la liste de révocation dans le Redis de Compose  |
| `pnpm mutation`         | Stryker sur `src/`, hors `main.ts` et `testing/`            |

| Variable            | Rôle                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `CHAT_HTTP_PORT`    | Port d'écoute, 3001 par défaut                                          |
| `CHAT_API_BASE_URL` | URL de l'API : JWKS `/auth/jwks`, émetteur `/auth`, audience `/v1`      |
| `REDIS_URL`         | Redis de la liste de révocation des sessions, `redis://` ou `rediss://` |

## Transport

Serveur HTTP nu, engine.io créé explicitement puis lié à socket.io (ADR 0023, §1) : WebSocket seul, trames de 4 Ko au plus, ping toutes les 30 s, délai de 60 s. Un paquet binaire ferme la connexion.

Le gestionnaire d'upgrade lit `Authorization: Bearer <jeton>` avant toute connexion engine.io :

- `401`, corps vide : jeton absent, invalide ou expiré ;
- `403`, corps vide : session révoquée. La liste de révocation est lue dans Redis en 200 ms au plus ; au-delà, ou Redis injoignable, le handshake est accepté (ADR 0005, « Panne Redis »). Le refus d'un compte suspendu arrive avec la suspension de compte ;
- `404`, corps vide : upgrade hors de `/socket.io/`.

Chaque handshake est journalisé avec son statut seul, jamais l'en-tête `Authorization`. Un client qui coupe sa connexion pendant la vérification est journalisé (`handshake interrompu`) sans arrêter le process. `GET /health/live` et `GET /health/ready` répondent `200`.

## Domaine

`decide({ chatter, room, message, bucket, now })` décide d'un message, sans I/O :

- chatter sanctionné sur le salon → refus `timed_out`, ou `banned` pour un ban sans échéance ;
- rate limit global, propriétaire compris : seau de 5 jetons, un jeton rendu par seconde (ADR 0004, §6). L'état du seau est une entrée ; sa lecture et son écriture dans Redis arrivent avec les handlers ;
- sinon le message est accepté dans le salon vérifié, horodaté à `now`, rattaché à la session du live en cours s'il y en a une (ADR 0032), et le seau débité est rendu.

Le `ChatterContext` vient de `@repo/authorization`, partagé avec l'API.
