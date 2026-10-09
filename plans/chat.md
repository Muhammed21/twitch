# Plan — service de chat (`apps/chat`)

Décisions de référence : [ADR 0004](../docs/adr/0004-chat-process-separe-topologie-temps-reel.md) (process séparé, trois canaux, revalidation), [ADR 0022](../docs/adr/0022-socket-io-transport-du-chat.md) (socket.io, WebSocket seul), [ADR 0023](../docs/adr/0023-client-ios-socketio-minimal-et-refus-http-au-handshake.md) (refus 401 / 403 au handshake), [ADR 0027](../docs/adr/0027-backpressure-et-dimensionnement-du-chat.md) (clients lents, livraisons par seconde, blocages), [ADR 0032](../docs/adr/0032-salon-de-chat-permanent-par-chaine.md) (salon permanent par chaîne), [ADR 0006](../docs/adr/0006-autorisation-scopee-par-chaine.md) (§6, sanctions par Redis Streams), [ADR 0024](../docs/adr/0024-conventions-de-contrat-pour-la-compatibilite.md) (§7, messages temps réel).

Chaque PR suit le TDD (RED, GREEN, mutation, REFACTOR), reste sous le plafond de revue et liste ses tests à écrire en premier.

## Architecture

```
apps/chat/src/
├── main.ts            # environnement parsé par Zod, serveur HTTP nu, engine.io lié à socket.io (ADR 0023, §1)
├── domain/            # décision pure : (ChatterContext, RoomState, Message, now) → Accept | Reject(motif)
├── application/       # envoi d'un message, entrée dans un salon, application d'une sanction, revalidation
├── infrastructure/    # Redis (rate limit, vues locales, Streams), client Prisma `chat`, adapter de transport
└── transport/         # gestionnaire d'upgrade, handlers d'événements socket.io, garde de saturation
```

- Pas de NestJS (ADR 0004). Aucun appel synchrone vers l'API dans le chemin d'un message, jamais.
- **Aucun type socket.io ne sort de `transport/`** : l'interface `ChatTransport` est conservée (ADR 0022, §9), pour garder la porte de sortie uWebSockets.js.
- Le salon a l'identité de la chaîne : `room:<channelId>` (ADR 0032). Un salon par utilisateur, `user:<userId>`, cible toutes ses sockets lors d'une sanction ou d'une révocation (ADR 0022, §2).
- Les vues locales (sanctions actives, followers, blocages) vivent dans Redis, alimentées par des events : c'est ce qui rend le chemin d'un message sans I/O vers l'API (ADR 0003, ACL `chat → moderation`).

## Point de départ et dépendances

| Il faut d'abord                                                           | Plan                                          |
| ------------------------------------------------------------------------- | --------------------------------------------- |
| `packages/contracts` et ses conventions                                   | [API](api.md), PR 2                           |
| `packages/auth-verifier` (JWT via JWKS, liste de révocation)              | [API](api.md), PR 7                           |
| `packages/authorization` (rôles par chaîne)                               | [API](api.md), PR 8                           |
| Schéma `chat` et client du contexte ; outbox et idempotence               | [Socle de la base](socle-db.md), PR 1, 2 et 4 |
| Events `channel.created` et `moderation.user.timed_out` sur Redis Streams | [API](api.md), PR 9 et 13                     |

Les PR 1 à 3 ci-dessous n'ont besoin que de `packages/contracts` ; elles peuvent avancer pendant le sprint `identity` de l'API.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                  |
| ----- | ----------- | ---------------------------------------------------------------------------------------------- |
| C1    | 4           | Un client authentifié rejoint le salon d'une chaîne et échange des messages ; sans token → 401 |
| C2    | 6           | Un timeout posé par le propriétaire coupe l'auteur en moins d'une seconde                      |
| C3    | 8           | Un client lent est exclu puis fermé, sans perte pour les autres ; métriques exposées           |

## Les PR de la tranche 1

### PR 1 — Contrat temps réel

Dans `packages/contracts` : la table `{ nomÉvénement → schéma }` des messages client (`chat:send`, `room:join`, `room:leave`) et serveur (`chat:message`, `chat:rejected`, `session:revoked`), les charges utiles nommées `Realtime*` publiées dans `openapi.json` (ADR 0024, §7), avec variante de repli sur `ServerMessage`. Corps de message limité à 500 caractères.
_Tests d'abord_ : un événement inconnu n'a pas de schéma ; corps vide ou de 501 caractères refusé ; `RealtimeChatMessage` présent dans `components.schemas` d'`openapi.json`.

### PR 2 — Domaine : décider d'un message

Fonction pure `decide(chatter, room, message, now)`. Tranche 1 : chatter sanctionné sur ce salon → refus ; rate limit global (jeton à 1 message par seconde, rafale de 5, ADR 0004 §6) exprimé comme un état passé en entrée, pas lu dans Redis ; message valide → accepté et horodaté. Le `ChatterContext` (identité, rôle sur la chaîne, sanctions actives) est construit par une fonction pure partagée avec l'API (ADR 0004, risque « duplication de la logique d'autorisation »).
_Tests d'abord_ : timeout actif → refus `timed_out` ; timeout expiré → accepté ; sixième message de la rafale → refus `rate_limited` ; le propriétaire est soumis au rate limit comme les autres. Mutation : aucun survivant hors équivalents justifiés.

### PR 3 — Serveur et handshake

`apps/chat` : serveur HTTP nu, engine.io créé explicitement (`transports: ["websocket"]`, `maxHttpBufferSize: 4096`, `pingInterval: 30 s`, `pingTimeout: 60 s`) puis `io.bind`. **Gestionnaire d'upgrade maison** : token de l'en-tête `Authorization` vérifié par `AccessTokenVerifier` ; `401` (absent, invalide, expiré), `403` (compte suspendu ou `sid` révoqué, lecture Redis bornée par un délai court, acceptation si Redis ne répond pas), corps vide ; sinon `engine.handleUpgrade` (ADR 0023, §1). Logs sans `Authorization`. Sondes de santé.
_Tests d'abord_ : upgrade sans token → `401` et aucune connexion engine.io créée ; `sid` révoqué → `403` ; Redis injoignable → handshake accepté dans le délai ; trame de plus de 4 Ko refusée par le transport ; paquet binaire refusé.

### PR 4 — Salons et diffusion (jalon C1)

Salon permanent créé à la réception de `channel.created` (consommateur Redis Streams idempotent), état chargé à la première connexion et libéré après la dernière (ADR 0032, §3). Handlers `room:join` et `chat:send` : validation Zod, `decide`, rate limit Redis (token bucket), diffusion `io.to(room)`, ack « accepté / refusé + motif » à l'auteur seulement (ADR 0022, §6). Messages hors live acceptés sans `sessionId`, avec `sessionId` pendant un live.
_Tests d'abord_ : deux clients dans un salon reçoivent le message, un client d'un autre salon non ; événement inconnu rejeté et compté ; message refusé → ack avec motif, aucune diffusion ; salon sans connecté libéré de la mémoire.

### PR 5 — Révocation de session

Abonnement au Pub/Sub de révocation (ADR 0026, §3) : émission de `session:revoked { action }` puis `socket.disconnect(true)` sur toutes les sockets du `sid`. Revalidation toutes les 5 minutes : token expiré → `refresh_and_reconnect`, `sid` révoqué ou compte suspendu → `stop` (ADR 0004, §4.3).
_Tests d'abord_ : révocation publiée → toutes les sockets du `sid` reçoivent l'événement puis sont fermées ; revalidation qui ferme une socket dont le token a expiré ; aucune socket d'un autre `sid` touchée.

### PR 6 — Sanctions par Redis Streams (jalon C2)

Groupe de consommateurs sur `moderation.user.timed_out` (et `banned` quand il existera), consommation idempotente (`processed_events` du schéma `chat`), mise à jour de la vue locale des sanctions, puis exclusion immédiate de l'utilisateur du salon. Au démarrage et après toute reconnexion Redis, le cache local est vidé (ADR 0006, §6).
_Tests d'abord_ : timeout publié → l'utilisateur ne peut plus écrire en moins d'une seconde ; event rejoué → sans effet ; chat redémarré pendant la publication → la sanction est appliquée au redémarrage ; mesure du délai sanction → exclusion exposée en métrique.

### PR 7 — Fan-out entre instances

`@socket.io/redis-adapter`. **Mesurer avant de dépasser une instance** (point ouvert de l'ADR 0027) : test de charge à deux instances, livraisons par seconde et latence p99 consignées dans la PR.
_Tests d'abord_ : un message posté sur l'instance A est reçu par un client de l'instance B ; une sanction appliquée sur A exclut l'utilisateur connecté à B.

### PR 8 — Clients lents et métriques (jalon C3)

Garde de l'ADR 0027 : tick de 10 ms, sockets au-delà de 100 paquets dans `writeBuffer` placées dans `saturated`, diffusion par `except("saturated")`, fermeture après 10 s de saturation continue ; accès à `writeBuffer` isolé dans un module, couvert par un test d'intégration. Lint qui interdit `.volatile` (ADR 0027, §1). Métriques : connexions actives, messages et livraisons par seconde, sockets saturées, fermetures pour saturation, trames rejetées, salons chargés.
_Tests d'abord_ : client qui ne lit plus → exclu au-delà du seuil puis fermé après 10 s, sans perte chez un client rapide du même salon ; `.volatile` refusé par le lint ; métriques exposées et à zéro au démarrage.

### PR 9 — Image et Compose

`Dockerfile` par `turbo prune`, service `chat` dans le profil `full` après `api` (ADR 0028, §5), arrêt propre qui étale les fermetures (§8), `compose.lan.yaml` pour un iPhone réel.
_Tests d'abord_ : `docker/tests/infra.test.sh` vérifie que `chat` démarre après l'API et refuse un upgrade sans token.

## Après la tranche 1

| Sujet                                                                                        | Horizon |
| -------------------------------------------------------------------------------------------- | ------- |
| Modes de salon persistants : slow mode, followers-only « depuis N minutes » (ADR 0020, 0032) | T2      |
| Blocages : salons `hides:<userId>` et `except` (ADR 0021, 0027)                              | T2      |
| Filtrage automatique, mots interdits, first-time chatter (ADR 0004, §6)                      | T2      |
| Persistance asynchrone et échantillonnée des messages, rétention de 90 jours (ADR 0008)      | T2      |
| Emotes et badges (ADR 0021, §6)                                                              | T3      |

## Risques suivis pendant l'exécution

- **`writeBuffer` est un détail interne d'Engine.IO** : version épinglée, test d'intégration dédié (PR 8) rejoué à chaque montée de version.
- **Divergence de protocole avec le client iOS minimal** : le test d'intégration du [plan iOS](ios.md) fait tourner ce serveur épinglé contre le client Swift (ADR 0023).
- **Sanction appliquée en retard** : lag du groupe de consommateurs surveillé, alerte au-delà de 5 s (ADR 0006).
