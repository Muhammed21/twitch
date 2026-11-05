# @repo/chat

Service de chat temps réel, process Node séparé (ADR 0004, ADR 0022). Découpage : [plan du chat](../../plans/chat.md).

| Commande                | Effet                                                                            |
| ----------------------- | -------------------------------------------------------------------------------- |
| `pnpm start`            | Lance `src/main.ts` avec le `.env` racine                                        |
| `pnpm test`             | Tests unitaires, serveur sur un port libre, process complet                      |
| `pnpm test:coverage`    | Tests et couverture 100 %                                                        |
| `pnpm test:integration` | Révocation, vues locales, consommateur, rate limit, fan-out et jalons dans Redis |
| `pnpm mutation`         | Stryker sur `src/`, hors `main.ts` et `testing/`                                 |

| Variable                         | Rôle                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------ |
| `CHAT_HTTP_PORT`                 | Port d'écoute, 3001 par défaut                                                 |
| `CHAT_API_BASE_URL`              | URL de l'API : JWKS `/auth/jwks`, émetteur `/auth`, audience `/v1`             |
| `CHAT_API_JWKS_URL`              | JWKS lu ailleurs qu'à `CHAT_API_BASE_URL`, émetteur et audience inchangés      |
| `REDIS_URL`                      | Redis de la liste de révocation et des vues locales, `redis://` ou `rediss://` |
| `S3_PUBLIC_BASE_URL`             | Base publique des images ; sans elle, l'auteur d'un message n'a pas d'avatar   |
| `CHAT_SATURATION_MAX_PACKETS`    | Paquets en attente au-delà desquels une socket est saturée, 100 par défaut     |
| `CHAT_SATURATION_CLOSE_AFTER_MS` | Saturation continue après laquelle la socket est fermée, 10 000 ms par défaut  |

## Image et Compose

- `Dockerfile` : élagage `turbo prune @repo/chat`, dépendances de production, sources TypeScript exécutées par Node sans build. Le process tourne sous `node`.
- Service `chat` du profil `full` (ADR 0028), démarré quand l'API et Redis sont sains, port `CHAT_HTTP_PORT` (3001) publié sur `127.0.0.1`. Il vérifie les jetons émis pour `http://127.0.0.1:3000` et lit leur JWKS à `http://api:3000/auth/jwks`. `compose.lan.yaml` le republie sur toutes les interfaces pour un iPhone réel.
- `docker/tests/infra.test.sh` démarre le service, sonde `/health/ready`, lit le JWKS de l'API depuis le conteneur, et vérifie qu'un upgrade sans jeton ou au jeton invalide reçoit `401` depuis l'hôte.

## Transport

Serveur HTTP nu, engine.io créé explicitement puis lié à socket.io (ADR 0023, §1) : WebSocket seul, trames de 4 Ko au plus, ping toutes les 30 s, délai de 60 s. Un paquet binaire ferme la connexion.

Le gestionnaire d'upgrade lit `Authorization: Bearer <jeton>` avant toute connexion engine.io :

- `401`, corps vide : jeton absent, invalide ou expiré ;
- `403`, corps vide : session révoquée. La liste de révocation est lue dans Redis en 200 ms au plus ; au-delà, ou Redis injoignable, le handshake est accepté (ADR 0005, « Panne Redis »). Le refus d'un compte suspendu arrive avec la suspension de compte ;
- `404`, corps vide : upgrade hors de `/socket.io/`.

Chaque handshake est journalisé avec son statut seul, jamais l'en-tête `Authorization`. Un client qui coupe sa connexion pendant la vérification est journalisé (`handshake interrompu`) sans arrêter le process. `GET /health/live` et `GET /health/ready` répondent `200`.

### Clients lents

Garde de l'ADR 0027 §2 : toutes les 10 ms, une socket dont le tampon d'écriture d'engine.io dépasse 100 paquets rejoint le salon interne `saturated`, et la diffusion d'un message de chat l'exclut (`io.to(room).except("saturated")`). Elle en sort dès que son tampon repasse sous le seuil ; restée saturée 10 s d'affilée, elle est fermée sans vider son tampon, et le client se reconnecte. `transport/write-buffer.ts` est le seul module qui lit `writeBuffer`, détail interne d'engine.io ; `slow-clients.test.ts` le couvre avec un client réel qui ne lit plus. `volatile` est refusé par `twitch/no-volatile` dans `apps/chat` (ADR 0027 §1).

### Fan-out entre instances

Les instances partagent salons et diffusion par `@socket.io/redis-adapter` (ADR 0022), sur deux clients Redis dédiés (`chat-fan-out`, `chat-fan-out-subscriber`) et la clé `chat`. Le fan-out est best-effort : une commande Redis en échec est journalisée (`commande de fan-out en échec`) sans arrêter le process, et la diffusion locale continue pendant une panne de Redis. Le client `chat-fan-out` n'a pas de file hors ligne : pendant une panne, ses publications sont refusées sur-le-champ, sans journal par message, la panne étant journalisée par sa connexion.

- Un message posté sur une instance est diffusé aux salons de toutes les instances ; chaque instance exclut ses propres sockets saturées.
- Une sanction ne passe jamais par le Pub/Sub de l'adapter (ADR 0006, ADR 0022). Le groupe `chat` livre chaque event à une seule instance, qui l'enregistre dans la vue locale ; en parallèle, chaque instance lit elle-même `events.moderation` en queue (`XREAD`, client `sanctions`), à partir du dernier event présent à son démarrage, et applique chaque timeout aux sockets qu'elle porte. Une application en échec est journalisée (`application de sanction en échec`) et la lecture continue ; une sanction antérieure au démarrage s'applique par la vue locale à la connexion.
- Révocation, revalidation, garde des clients lents et arrêt ne touchent que les sockets de l'instance : chaque instance reçoit elle-même le Pub/Sub de révocation.
- Le seau de rate limit d'un utilisateur est partagé dans Redis (ADR 0043) : connecté à deux instances, il a la limite d'un seul seau.

### Métriques

`GET /metrics` répond au format texte de Prometheus, pendant l'arrêt compris :

| Métrique                                | Type      | Valeur                                                                  |
| --------------------------------------- | --------- | ----------------------------------------------------------------------- |
| `chat_connections`                      | gauge     | connexions actives                                                      |
| `chat_rooms_loaded`                     | gauge     | salons chargés en mémoire                                               |
| `chat_saturated_sockets`                | gauge     | sockets exclues de la diffusion                                         |
| `chat_messages_total`                   | counter   | messages de chat diffusés                                               |
| `chat_deliveries_total`                 | counter   | livraisons : chaque `chat:message` écrit à une socket de cette instance |
| `chat_rejected_events_total`            | counter   | trames rejetées par la validation                                       |
| `chat_saturation_closures_total`        | counter   | sockets fermées après 10 s de saturation                                |
| `chat_sanction_exclusion_delay_seconds` | histogram | délai entre l'`occurredAt` d'un timeout et son application aux sockets  |

Le seuil de réévaluation du moteur est de 150 000 livraisons par seconde soutenues sur une instance (ADR 0027 §3). L'histogramme a pour seaux 0,1, 0,25, 0,5, 1, 2,5, 5 et 10 s ; le seau de 5 s porte le seuil d'alerte du délai ban → déconnexion (ADR 0006).

### Arrêt

Sur `SIGTERM` ou `SIGINT` (ADR 0028 §8), `/health/ready` passe en `503` et tout nouvel upgrade reçoit `503`, corps vide ; `/health/live` reste à `200`. Les sockets ouvertes sont fermées par 10 lots étalés sur 30 s, au niveau du transport : le client voit une coupure réseau (`transport close`) et se reconnecte avec backoff et gigue (ADR 0023 §3). Le consommateur d'events et la révocation restent actifs pendant ces 30 s ; le process sort ensuite, sous les 45 s de `stop_grace_period`.

### Révocation et revalidation

Une socket acceptée garde le `sid` et le jeton de son handshake, et rejoint le salon interne `sid:<sid>`. Une fois dans ce salon, son jeton est vérifié une seconde fois : une session révoquée pendant la lecture du profil est refusée avec l'erreur `session_revoked`.

- **Révocation** (ADR 0026 §3) : le chat s'abonne au canal Pub/Sub `identity.session.revoked` par un client Redis dédié. Pour chaque `sid` publié par l'API, toutes ses sockets reçoivent `session:revoked { action: "stop" }`, puis sont fermées. Les sockets des autres `sid` ne sont pas touchées. Un message hors contrat est journalisé (`révocation hors contrat`) et ignoré.
- **Revalidation** toutes les 5 minutes (ADR 0004 §4) : le jeton de chaque socket est vérifié de nouveau. Expiré ou invalide → `session:revoked { action: "refresh_and_reconnect" }` ; `sid` révoqué → `{ action: "stop" }`. Dans les deux cas, la socket est ensuite fermée. Ce filet rattrape une révocation publiée pendant une coupure du Pub/Sub. Le refus d'un compte suspendu arrive avec la suspension de compte.

### Timeouts

Un timeout reçu par `moderation.user.timed_out` s'ajoute aux sanctions des sockets ouvertes du chatter (`sanction`) : son message suivant sur ce salon est refusé `timed_out`, ses autres salons ne changent pas. L'instance émet ensuite `chat:user_cleared { channelId, userId }` à ses sockets du salon, saturées comprises, sans passer par l'adapter : chaque client efface les messages déjà reçus de ce chatter (ADR 0048). Un client déconnecté à ce moment ne le reçoit pas. Un timeout arrivé pendant l'ouverture d'une connexion, entre la lecture des sanctions et l'entrée de la socket, est gardé en mémoire jusqu'à son échéance. Il est ajouté à la session juste avant l'entrée de la socket, après la seconde vérification du jeton, sans attente entre les deux. Le délai entre la sanction et son application est mesuré dans `chat_sanction_exclusion_delay_seconds`.

### Salons et diffusion

Après un upgrade accepté, le profil du chatter (`chat:chatter:<userId>`) et ses timeouts (`chat:chatter:<userId>:sanctions`) sont lus pendant l'ouverture de la connexion. Un profil inconnu ou illisible refuse la connexion socket.io avec l'erreur `chatter_unavailable` ; une lecture en échec est journalisée (`profil illisible`).

Les événements d'une socket sont traités l'un après l'autre, dans leur ordre d'arrivée : un `chat:send` émis juste après `room:join` trouve le salon rejoint.

| Événement    | Effet                                                                                                                                                                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `room:join`  | Entre dans le salon `room:<channelId>` d'une chaîne connue, une seule fois par socket. Sans réponse ; une chaîne inconnue ou un état illisible laissent la socket hors du salon                                                                                                                                                                               |
| `room:leave` | Sort du salon. Sans réponse                                                                                                                                                                                                                                                                                                                                   |
| `chat:send`  | Exige un ack. Accepté : diffusé en `chat:message` à tout le salon, auteur compris, puis ack sans valeur. L'auteur porte `badges`, vide jusqu'à la vue locale des abonnés Turbo (plan `onboarding-paywall`, PR 22 et 23). Refusé : ack `RealtimeChatRejected` (`timed_out`, `banned`, `rate_limited`, ou `not_joined` hors d'un salon rejoint), sans diffusion |

Un événement inconnu, une charge invalide ou un `chat:send` sans ack sont rejetés sans réponse et comptés (`chat_rejected_events_total`). Une déconnexion sort la socket de tous ses salons ; un salon sans connecté est libéré de la mémoire. `main.ts` oublie toutes les 10 s les seaux locaux redevenus pleins.

## Domaine

Fonctions pures, sans I/O :

- `sanctionRejection({ chatter, channelId, now })` : chatter sanctionné sur le salon → `timed_out`, ou `banned` pour un ban sans échéance ;
- `takeToken({ bucket, now })` : rate limit global, propriétaire compris, seau de 5 jetons, un jeton rendu par seconde (`RATE_LIMIT`, ADR 0004 §6). Rend le seau débité, ou rien s'il reste moins d'un jeton ;
- `acceptMessage({ chatter, room, message, now })` : le message accepté dans le salon vérifié, horodaté à `now`, rattaché à la session du live en cours s'il y en a une (ADR 0032).

Un seau remonté à 5 jetons vaut l'absence de seau (`isBucketFull`). Le `ChatterContext` vient de `@repo/authorization`, partagé avec l'API.

## Application

- `createRoomRegistry(directory)` tient les salons chargés en mémoire (ADR 0032, §3) : l'état d'un salon est lu à la première entrée, une seule fois pour des entrées simultanées, et libéré à la dernière sortie. Une chaîne inconnue ou une lecture en échec ne laisse aucun salon chargé ; une entrée dont le salon est libéré pendant la lecture repart sans état et ne touche pas au salon relu ensuite. `loadedCount()` donne le nombre de salons chargés.
- `createMessageSender(limit)` vérifie d'abord les sanctions, puis prend un jeton au port `RateLimit`, puis accepte le message. Un message refusé pour sanction ne prend aucun jeton.
- `createLocalTokenBuckets()` tient un seau par utilisateur en mémoire du process, par `takeToken`. `sweep(now)` oublie les seaux redevenus pleins.

- `chatEventHandlers({ views, rooms, sockets, metrics, log })` projette les events dans les vues locales et rafraîchit l'état d'un salon chargé, même pendant sa lecture. Un payload hors contrat est journalisé puis écarté ; une version non gérée fait échouer le handler, et l'event reste à traiter.

Les ports `RoomDirectory`, `ChatterProfiles`, `TurboProfiles`, `LocalViewWriter`, `SanctionedSockets` et `SanctionMetrics` sont dans `application/ports.ts`. `TurboProfiles` rend l'échéance Turbo et la couleur de pseudo d'un chatter, lues sans appel réseau ; une valeur vide ou illisible se lit comme absente.

## Infrastructure

Vues locales dans Redis, lues sans appel à l'API (ADR 0004) :

| Clé                               | Contenu                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `chat:room:<channelId>`           | `sessionId` : session du live en cours, vide hors live                                                                                                                                                                                                                                                                                                                              |
| `chat:room:<channelId>:ended`     | set des sessions terminées, expiré 7 jours après la dernière fin de live                                                                                                                                                                                                                                                                                                            |
| `chat:chatter:<userId>`           | `displayName` : nom affiché de l'auteur ; `avatarKey` et `avatarChangedAt` : clé de son avatar et `occurredAt` de son event, en millisecondes epoch ; `turboExpiresAt` et `turboChangedAt` : échéance Turbo (vide sans Turbo) et `occurredAt` de son event ; `chatColor` et `chatColorChangedAt` : couleur de pseudo (vide pour la couleur par défaut) et `occurredAt` de son event |
| `chat:chatter:<userId>:sanctions` | par `channelId`, fin du timeout en millisecondes epoch ; expire à la fin du dernier                                                                                                                                                                                                                                                                                                 |

Une chaîne sans hash n'a pas de salon. Le groupe de consommateurs `chat` lit le stream de chaque contexte dont il traite un event (`eventStreamsOf`) : `events.channel`, `events.identity`, `events.moderation`, `events.monetization` et `events.stream`, écrits par le relais d'outbox de l'API :

| Event                              | Écriture                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channel.created`                  | `HSETNX sessionId ""` : ouvre le salon hors live, sans fermer un live déjà enregistré                                                                                  |
| `stream.started`                   | pose `sessionId`, sauf pour une session terminée (script Lua)                                                                                                          |
| `stream.ended`                     | vide `sessionId` s'il porte cette session, puis ajoute la session au set des terminées (script Lua)                                                                    |
| `identity.account.registered`      | `HSET displayName`                                                                                                                                                     |
| `identity.avatar.changed`          | pose `avatarKey` et `avatarChangedAt`, sauf si l'avatar enregistré vient d'un event plus récent (script Lua)                                                           |
| `identity.chat_color.changed`      | pose `chatColor` et `chatColorChangedAt`, sauf si la couleur enregistrée vient d'un event plus récent (script Lua) ; `null` vide la couleur                            |
| `moderation.user.timed_out`        | garde la fin la plus tardive du timeout sur ce salon (script Lua), puis l'applique aux sockets ouvertes du chatter                                                     |
| `monetization.entitlement.granted` | portée `platform` : pose `turboExpiresAt` et `turboChangedAt`, sauf si l'échéance enregistrée vient d'un event plus récent (script Lua) ; une autre portée est ignorée |
| `monetization.entitlement.revoked` | portée `platform` : vide `turboExpiresAt`, avec la même règle d'ordre ; une autre portée est ignorée                                                                   |

Chaque écriture est idempotente et supporte le désordre : un event rejoué, un début de live repris après sa fin, ou une fin de live arrivée après le live suivant, laisse la vue juste. Un seul `XREADGROUP` bloquant lit tous ces streams, sur une connexion Redis à part ; à chaque tour, `XAUTOCLAIM` reprend les entrées en attente depuis plus de 30 s. Une entrée est acquittée après son traitement, ou si elle est illisible ou sans handler ; un handler en échec la laisse en attente.

La connexion Redis ne journalise que ses transitions : `redis injoignable` à la première erreur d'une panne, `redis rétabli` au retour, et rien pour les tentatives de reconnexion entre les deux. Le consommateur se tait pendant une panne de sa connexion, qui a son propre journal de transitions (`client: "events"`).

Rate limit (ADR 0043) : le seau d'un utilisateur vit sous `chat:rate-limit:<userId>`, un hash `tokens` et `refilledAt` en millisecondes epoch, qui expire quand le seau serait redevenu plein. `redisTokenBuckets` le lit, le remplit, en prend un jeton et l'écrit par un seul `EVAL`, avec la rafale et le délai de `RATE_LIMIT` ; un refus n'écrit rien, et une instance dont l'horloge retarde ne rend aucun jeton. `sharedRateLimit` donne 200 ms au seau partagé : au-delà, ou sur une commande en échec, le message est décidé par le seau local de l'instance. Le repli est journalisé (`rate limit partagé injoignable, seau local`), sauf quand le client Redis est hors ligne.

`event-consumer.ts`, `stream-tail.ts`, `redis-local-view-writer.ts` et `redis-token-buckets.ts` sont couverts par `pnpm test:integration`, hors couverture unitaire et hors Stryker. `fan-out.integration.test.ts` fait tourner deux instances sur le Redis de Compose : message posté sur A reçu sur B, sanction lue par chaque instance dans le stream et appliquée à ses sockets, effacement reçu une seule fois par un client de l'autre instance, révocation limitée aux sockets de chaque instance, et sixième message refusé `rate_limited` pour un utilisateur connecté aux deux instances. Sur une seule instance, la rafale de 5 et le jeton rendu après une seconde restent les mêmes. `chat-milestone.integration.test.ts` démontre le jalon C1 : une chaîne créée et deux comptes enregistrés par events, deux clients authentifiés qui échangent dans le salon, puis un message rattaché au live démarré. Il démontre aussi le jalon C2 : un timeout publié refuse `timed_out` le message suivant de l'auteur en moins d'une seconde, sans toucher les autres, compte son délai sous la seconde dans l'histogramme, et s'applique à une reconnexion ultérieure. Le jalon C3 est démontré par `slow-clients.test.ts` et `metrics.test.ts`.
