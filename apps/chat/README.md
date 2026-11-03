# @repo/chat

Service de chat temps réel, process Node séparé (ADR 0004, ADR 0022). Découpage : [plan du chat](../../plans/chat.md).

| Commande                | Effet                                                        |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm start`            | Lance `src/main.ts` avec le `.env` racine                    |
| `pnpm test`             | Tests unitaires, serveur sur un port libre, process complet  |
| `pnpm test:coverage`    | Tests et couverture 100 %                                    |
| `pnpm test:integration` | Liste de révocation et vues locales dans le Redis de Compose |
| `pnpm mutation`         | Stryker sur `src/`, hors `main.ts` et `testing/`             |

| Variable            | Rôle                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `CHAT_HTTP_PORT`    | Port d'écoute, 3001 par défaut                                                 |
| `CHAT_API_BASE_URL` | URL de l'API : JWKS `/auth/jwks`, émetteur `/auth`, audience `/v1`             |
| `REDIS_URL`         | Redis de la liste de révocation et des vues locales, `redis://` ou `rediss://` |

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
- rate limit global, propriétaire compris : seau de 5 jetons, un jeton rendu par seconde (ADR 0004, §6). L'état du seau est une entrée ;
- sinon le message est accepté dans le salon vérifié, horodaté à `now`, rattaché à la session du live en cours s'il y en a une (ADR 0032), et le seau débité est rendu.

Un seau remonté à 5 jetons vaut l'absence de seau (`isBucketFull`). Le `ChatterContext` vient de `@repo/authorization`, partagé avec l'API.

## Application

- `createRoomRegistry(directory)` tient les salons chargés en mémoire (ADR 0032, §3) : l'état d'un salon est lu à la première entrée, une seule fois pour des entrées simultanées, et libéré à la dernière sortie. Une chaîne inconnue ou une lecture en échec ne laisse aucun salon chargé. `loadedCount()` donne le nombre de salons chargés.
- `createMessageSender()` applique `decide` avec un seau par utilisateur, en mémoire du process : la lecture, la décision et l'écriture du seau sont synchrones, donc sans course entre deux sockets du même utilisateur. `sweep(now)` oublie les seaux redevenus pleins. Le partage des seaux entre instances arrive avec le fan-out (PR 7 du plan).

Les ports `RoomDirectory` et `ChatterProfiles` sont dans `application/ports.ts`.

## Infrastructure

Vues locales dans Redis, lues sans appel à l'API (ADR 0004) :

| Clé                     | Hash                                                   |
| ----------------------- | ------------------------------------------------------ |
| `chat:room:<channelId>` | `sessionId` : session du live en cours, vide hors live |
| `chat:chatter:<userId>` | `displayName` : nom affiché de l'auteur                |

Une chaîne sans hash n'a pas de salon. Les consommateurs qui écrivent ces hashes à partir des events `channel.created`, `stream.started`, `stream.ended` et `identity.account.registered` arrivent avec la dernière partie de TWI-15.

La connexion Redis ne journalise que ses transitions : `redis injoignable` à la première erreur d'une panne, `redis rétabli` au retour, et rien pour les tentatives de reconnexion entre les deux.
