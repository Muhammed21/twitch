# @repo/chat

Service de chat temps réel, process Node séparé (ADR 0004, ADR 0022). Découpage : [plan du chat](../../plans/chat.md).

| Commande                | Effet                                                                       |
| ----------------------- | --------------------------------------------------------------------------- |
| `pnpm start`            | Lance `src/main.ts` avec le `.env` racine                                   |
| `pnpm test`             | Tests unitaires, serveur sur un port libre, process complet                 |
| `pnpm test:coverage`    | Tests et couverture 100 %                                                   |
| `pnpm test:integration` | Révocation, vues locales, consommateur et jalon C1 dans le Redis de Compose |
| `pnpm mutation`         | Stryker sur `src/`, hors `main.ts` et `testing/`                            |

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

### Salons et diffusion

Après un upgrade accepté, le profil du chatter (`chat:chatter:<userId>`) est lu pendant l'ouverture de la connexion. Un profil inconnu ou illisible refuse la connexion socket.io avec l'erreur `chatter_unavailable` ; une lecture en échec est journalisée (`profil illisible`).

Les événements d'une socket sont traités l'un après l'autre, dans leur ordre d'arrivée : un `chat:send` émis juste après `room:join` trouve le salon rejoint.

| Événement    | Effet                                                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:join`  | Entre dans le salon `room:<channelId>` d'une chaîne connue, une seule fois par socket. Sans réponse ; une chaîne inconnue ou un état illisible laissent la socket hors du salon                                                               |
| `room:leave` | Sort du salon. Sans réponse                                                                                                                                                                                                                   |
| `chat:send`  | Exige un ack. Accepté : diffusé en `chat:message` à tout le salon, auteur compris, puis ack sans valeur. Refusé : ack `RealtimeChatRejected` (`timed_out`, `banned`, `rate_limited`, ou `not_joined` hors d'un salon rejoint), sans diffusion |

Un événement inconnu, une charge invalide ou un `chat:send` sans ack sont rejetés sans réponse et comptés (`rejectedEventCount()`). Une déconnexion sort la socket de tous ses salons ; un salon sans connecté est libéré de la mémoire. `main.ts` oublie toutes les 10 s les seaux redevenus pleins.

## Domaine

`decide({ chatter, room, message, bucket, now })` décide d'un message, sans I/O :

- chatter sanctionné sur le salon → refus `timed_out`, ou `banned` pour un ban sans échéance ;
- rate limit global, propriétaire compris : seau de 5 jetons, un jeton rendu par seconde (ADR 0004, §6). L'état du seau est une entrée ;
- sinon le message est accepté dans le salon vérifié, horodaté à `now`, rattaché à la session du live en cours s'il y en a une (ADR 0032), et le seau débité est rendu.

Un seau remonté à 5 jetons vaut l'absence de seau (`isBucketFull`). Le `ChatterContext` vient de `@repo/authorization`, partagé avec l'API.

## Application

- `createRoomRegistry(directory)` tient les salons chargés en mémoire (ADR 0032, §3) : l'état d'un salon est lu à la première entrée, une seule fois pour des entrées simultanées, et libéré à la dernière sortie. Une chaîne inconnue ou une lecture en échec ne laisse aucun salon chargé ; une entrée dont le salon est libéré pendant la lecture repart sans état et ne touche pas au salon relu ensuite. `loadedCount()` donne le nombre de salons chargés.
- `createMessageSender()` applique `decide` avec un seau par utilisateur, en mémoire du process : la lecture, la décision et l'écriture du seau sont synchrones, donc sans course entre deux sockets du même utilisateur. `sweep(now)` oublie les seaux redevenus pleins. Le partage des seaux entre instances arrive avec le fan-out (PR 7 du plan).

- `chatEventHandlers({ views, rooms, log })` projette les events dans les vues locales et rafraîchit l'état d'un salon chargé, même pendant sa lecture. Un payload hors contrat est journalisé puis écarté ; une version non gérée fait échouer le handler, et l'event reste à traiter.

Les ports `RoomDirectory`, `ChatterProfiles` et `LocalViewWriter` sont dans `application/ports.ts`.

## Infrastructure

Vues locales dans Redis, lues sans appel à l'API (ADR 0004) :

| Clé                     | Hash                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `chat:room:<channelId>` | `sessionId` : session du live en cours, vide hors live ; `endedSessionId` : dernière session terminée |
| `chat:chatter:<userId>` | `displayName` : nom affiché de l'auteur                                                               |

Une chaîne sans hash n'a pas de salon. Le groupe de consommateurs `chat` lit `events.channel`, `events.stream` et `events.identity`, écrits par le relais d'outbox de l'API :

| Event                         | Écriture                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `channel.created`             | `HSETNX sessionId ""` : ouvre le salon hors live, sans fermer un live déjà enregistré |
| `stream.started`              | pose `sessionId`, sauf pour la session déjà terminée (script Lua)                     |
| `stream.ended`                | vide `sessionId` s'il porte cette session, puis retient `endedSessionId` (script Lua) |
| `identity.account.registered` | `HSET displayName`                                                                    |

Chaque écriture est idempotente et supporte le désordre : un event rejoué, ou une fin de live arrivée après le live suivant, laisse la vue juste. Un seul `XREADGROUP` bloquant lit les trois streams, sur une connexion Redis à part ; à chaque tour, `XAUTOCLAIM` reprend les entrées en attente depuis plus de 30 s. Une entrée est acquittée après son traitement, ou si elle est illisible ou sans handler ; un handler en échec la laisse en attente.

La connexion Redis ne journalise que ses transitions : `redis injoignable` à la première erreur d'une panne, `redis rétabli` au retour, et rien pour les tentatives de reconnexion entre les deux. Le consommateur se tait pendant une panne de sa connexion, qui a son propre journal de transitions (`client: "events"`).

`event-consumer.ts` et `redis-local-view-writer.ts` sont couverts par `pnpm test:integration`, hors couverture unitaire et hors Stryker. `chat-milestone.integration.test.ts` démontre le jalon C1 : une chaîne créée et deux comptes enregistrés par events, deux clients authentifiés qui échangent dans le salon, puis un message rattaché au live démarré.
