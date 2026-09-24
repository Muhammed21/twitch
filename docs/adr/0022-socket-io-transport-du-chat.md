# 0022 — socket.io comme transport du chat, à la place de uWebSockets.js

- Statut : Accepté — authentification (§3), révocation (§4), reconnexion (§5) et client iOS amendés par [0023](0023-client-ios-socketio-minimal-et-refus-http-au-handshake.md)
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Remplace partiellement : ADR 0004 (§1 choix du transport, §5 plafond de trame, §7 backpressure, heartbeat des notes d'implémentation)
- Amende : ADR 0005 (support du token à la poignée de main, codes de fermeture `4401` / `4403`), ADR 0011 (`ChatSession`)

## Contexte et problématique

L'ADR 0004 a pris deux décisions de nature très différente, et il faut les séparer :

1. **Le chat est un process séparé de l'API.** C'est une décision d'isolation des défaillances : une surcharge du chat ne doit jamais faire tomber l'authentification ou le paiement. Elle n'est pas remise en cause.
2. **Le transport de ce process est `uWebSockets.js`.** C'est une décision de performance. L'ADR 0004 la qualifiait lui-même de **pari** : « je ne sais pas si le gain de performance sera visible aux volumes réels d'un projet perso, et il est très possible qu'il ne le soit jamais ».

Le rejet de socket.io dans l'ADR 0004 tenait surtout à l'option A, socket.io **dans l'API NestJS**, et donc au couplage de défaillance. Ce motif ne s'applique pas à socket.io dans un process séparé (option B de l'ADR 0004). Contre l'option B, il restait deux arguments : un coût mémoire et d'allocation par connexion supérieur, et un protocole propriétaire au-dessus de WebSocket.

En contrepartie, `uWebSockets.js` laisse à écrire soi-même tout ce qui n'est pas du transport : salons, heartbeat, reconnexion, fan-out entre instances, sérialisation. C'est du code d'infrastructure sans valeur produit, qui retarde la tranche 1, et qu'il faudra tester et maintenir seul. S'y ajoutent un binaire natif (contraintes de build CI et d'image Docker) et une communauté restreinte.

Problématique : pour un projet de cette taille, le gain mémoire de `uWebSockets.js` vaut-il le code d'infrastructure qu'il impose ? Et si on passe à socket.io, que deviennent les garanties de sécurité et de backpressure que l'ADR 0004 fondait sur des primitives de `uWebSockets.js` ?

## Facteurs de décision

- **Vitesse de livraison de la tranche 1** : le chat est dans la tranche 1 (ADR 0003).
- **Volume réaliste** : quelques centaines à quelques milliers de connexions simultanées, pas des centaines de milliers.
- **Garanties non négociables de l'ADR 0004** : rejet des connexions non authentifiées avant allocation, validation Zod de chaque message, sanction appliquée immédiatement, protection contre les clients lents.
- **Réversibilité** : pouvoir revenir sur un transport plus sobre sans réécrire le domaine du chat.
- **Client iOS natif** (ADR 0010, 0011) : la bibliothèque cliente doit exister et être maintenable.

## Options envisagées

**Option A — Garder `uWebSockets.js`.** Performance maximale, mais le coût d'écriture des salons, de la reconnexion et du fan-out reste entier, pour un gain que l'ADR 0004 lui-même doute de voir un jour. Écarté.

**Option B — `ws` brut.** Pas de binaire natif. Mais il faut toujours écrire salons, heartbeat, fan-out et reconnexion : on garde l'essentiel du coût sans le principal bénéfice. Écarté.

**Option C — socket.io dans le process de chat séparé, transport WebSocket uniquement.** Salons, heartbeat, fan-out Redis (adapter officiel) et reconnexion côté client sont fournis. Coût mémoire par connexion plus élevé, acceptable au volume visé. **Retenu.**

## Décision

### 1. Ce qui ne change pas

Le process séparé `apps/chat`, les trois canaux temps réel, le compteur de viewers en Redis, l'authentification au handshake puis la revalidation périodique, la validation Zod de chaque message, le rate limiting, la règle « aucun appel synchrone vers l'API dans le chemin d'un message » : tout l'ADR 0004 reste en vigueur, hors des sections listées en en-tête. La logique métier du chat reste une fonction pure `(ChatterContext, RoomState, Message) → décision`, qui ignore le transport.

### 2. socket.io v4, standalone, WebSocket uniquement

- **`transports: ["websocket"]` côté serveur et côté client.** Le long-polling est désactivé. Un client iOS natif n'en a pas besoin (ADR 0004, option A). Le désactiver supprime aussi les sessions collantes (sticky sessions) qu'exige le polling derrière un load balancer, et la requête HTTP d'ouverture de session du polling.
- **Pas de NestJS** dans `apps/chat` (ADR 0004). socket.io est monté sur un serveur HTTP Node nu.
- **Salons** : un salon socket.io par salon de chat (`room:<roomId>`), et un salon par utilisateur (`user:<userId>`) pour cibler toutes ses sockets lors d'un ban ou d'une révocation.
- **Fan-out entre instances** : `@socket.io/redis-adapter`, qui repose sur Redis Pub/Sub. Même choix que l'ADR 0004 : le fan-out de chat est best-effort. Les sanctions continuent de passer par Redis Streams et l'outbox (ADR 0002, 0004) ; l'adapter ne transporte que la diffusion.
- **Pas de *connection state recovery*** (la fonctionnalité de rejeu des messages manqués après reconnexion) : un message de chat manqué n'est pas rejoué (ADR 0004, §7).

### 3. Authentification : rejet avant l'ouverture de la WebSocket

L'ADR 0005 plaçait le token dans `Sec-WebSocket-Protocol`. Le client socket.io ne gère pas ce mécanisme ; il faut donc un autre support qui garde les deux propriétés recherchées : pas de token dans l'URL, et un rejet **avant toute allocation**.

- Le token est présenté dans l'en-tête **`Authorization: Bearer <access token>`** de la requête d'upgrade. Le client iOS le pose via les en-têtes additionnels de la bibliothèque cliente.
- Il est vérifié dans le hook **`allowRequest`** du serveur (hérité d'Engine.IO), qui s'exécute sur la requête HTTP d'upgrade, avant que la WebSocket et la session socket.io n'existent. La vérification est locale, via le JWKS en cache, sans I/O (ADR 0005). Une requête sans token valide est refusée en HTTP `401` : aucune socket n'est ouverte.
- Le `ChatterContext` est construit ensuite, dans le middleware de connexion (`io.use`), et attaché à `socket.data`.
- **Le token n'est pas transporté dans le champ `auth` du paquet de connexion socket.io.** Ce paquet arrive après l'ouverture de la connexion : l'utiliser reviendrait exactement à la variante « premier message applicatif » que l'ADR 0004 a écartée, parce qu'elle laisse vivre une connexion anonyme.
- Les logs d'accès du load balancer et du serveur ne doivent **jamais** enregistrer l'en-tête `Authorization`. C'est une règle de configuration, vérifiée par un test sur le format de log.

### 4. Révocation : un événement au lieu d'un code de fermeture

Le client socket.io n'expose pas les codes de fermeture WebSocket applicatifs. `4401` et `4403` (ADR 0005) sont remplacés par un événement serveur émis juste avant la déconnexion :

```ts
session:revoked { action: "refresh_and_reconnect" }  // ancien 4401
session:revoked { action: "stop" }                   // ancien 4403
```

Le serveur émet l'événement puis appelle `socket.disconnect(true)`. Le schéma fait partie de l'union `ServerMessage` du package `contracts` (ADR 0009). Au handshake, `401` signifie « rafraîchis puis reconnecte » et `403` « n'essaie plus » : même sémantique, portée par le statut HTTP.

### 5. Reconnexion : pilotée par `ChatSession`, pas par la bibliothèque

La reconnexion automatique de la bibliothèque cliente est **désactivée**. Elle réutiliserait l'en-tête `Authorization` initial, donc un access token potentiellement expiré, et ne sait pas qu'après `stop` il ne faut plus rien tenter. `ChatSession` (ADR 0011) garde la main : backoff exponentiel avec gigue, rafraîchissement du token avant chaque tentative, arrêt définitif sur `stop` ou `403`.

### 6. Taille de trame et validation

- `maxHttpBufferSize` est fixé à **4 Ko**, plafond appliqué par le transport avant parsing. Il remplace `maxPayloadLength` (ADR 0004, §5) ; la valeur par défaut de socket.io (1 Mo) est très au-dessus d'un message de 500 caractères.
- Chaque handler d'événement entrant valide sa charge utile contre le schéma Zod correspondant (ADR 0004 §5, ADR 0009). Le discriminant n'est plus un champ `type` dans le JSON : c'est le **nom de l'événement** socket.io. L'union `ClientMessage` du package `contracts` devient une table `{ nomEvénement → schéma }`, et **un événement inconnu est rejeté et compté** comme une trame invalide.
- Les pièces jointes binaires de socket.io ne sont pas utilisées ; un paquet binaire entrant est rejeté.
- Les accusés de réception (acks) ne sont utilisés que pour l'envoi d'un message par l'auteur (retour « accepté / refusé + motif »), jamais pour la diffusion.

### 7. Heartbeat

Le ping/pong intégré d'Engine.IO remplace le heartbeat applicatif de l'ADR 0004 : `pingInterval: 30 s`, `pingTimeout: 60 s`, soit une socket morte détectée en 90 s au plus, la même borne que l'ADR 0004.

### 8. Backpressure

C'est la garantie qui perd le plus au changement, et il faut le dire franchement. socket.io n'expose pas de `getBufferedAmount()` public. Politique retenue :

- **La diffusion du chat utilise `volatile`** : un message est abandonné pour un client dont le transport n'est pas prêt à écrire, au lieu d'être mis en file. C'est exactement la sémantique best-effort du canal 1.
- **Surveillance du tampon d'écriture** par socket (`socket.conn.writeBuffer`), échantillonnée à chaque tick d'agrégation. Au-delà d'un seuil haut, la socket est fermée ; le client se reconnecte et repart du présent (ADR 0004, §7).
- `writeBuffer` est un détail interne d'Engine.IO, pas une API publique. Son accès est isolé dans un seul module de l'adapter de transport, couvert par un test d'intégration qui échoue si une montée de version en change la forme.

### 9. Porte de sortie : socket.io sur `uWebSockets.js`

socket.io peut être monté sur un serveur `uWebSockets.js` (`io.attachApp`) sans changer le code applicatif ni le client. Si la mémoire par connexion devient le facteur limitant, c'est la première piste, avant tout retour à un transport écrit à la main. Le seuil de réévaluation : **plus de 2 Go de mémoire résidente par instance de chat**, ou une instance qui ne tient plus **10 000 connexions**.

L'interface `ChatTransport` de l'ADR 0004 est conservée. socket.io est un adapter derrière elle ; aucun type socket.io ne franchit l'adapter.

## Conséquences

### Positives

- Salons, fan-out entre instances, heartbeat et gestion de connexion côté client sont fournis : la tranche 1 perd un chantier d'infrastructure entier.
- Plus de binaire natif : build CI et image Docker standards.
- Écosystème, documentation et communauté bien plus larges.
- La porte de sortie (§9) garde l'essentiel du bénéfice de `uWebSockets.js` accessible, sans le payer aujourd'hui.

### Négatives

- Mémoire par connexion et allocations par message plus élevées : il faudra plus d'instances de chat à volume égal.
- Protocole socket.io au-dessus de WebSocket : le client doit parler socket.io, et un simple client WebSocket ne suffit plus pour tester ou déboguer.
- La backpressure repose sur un détail interne (`writeBuffer`) plutôt que sur une primitive exposée.
- Deux ADR acceptés (0004, 0005) et le protocole iOS (0011) sont amendés.

### Risques et mitigations

- **Risque : la bibliothèque cliente iOS.** Le client Swift officiel de socket.io est le maillon le moins actif de l'écosystème. **Incertitude réelle : son état de maintenance et sa compatibilité avec la concurrence stricte de Swift 6 (ADR 0010) ne sont pas vérifiés.** Mitigation : spike avant la tranche 1. Si le client officiel ne tient pas, l'option de repli est un client minimal du protocole socket.io au-dessus de `URLSessionWebSocketTask` : WebSocket uniquement, sans polling ni binaire, le protocole se réduit à quelques types de paquets.
- **Risque : `writeBuffer` change à une montée de version.** Mitigation : accès isolé et test d'intégration dédié (§8) ; version de socket.io épinglée, montées de version relues.
- **Risque : fuite du token dans les logs** via l'en-tête `Authorization`. Mitigation : test de format de log (§3), et masquage de l'en-tête au niveau du load balancer.
- **Risque : le coût mémoire dépasse le budget plus tôt que prévu.** Mitigation : la métrique de mémoire par instance est déjà exigée par l'ADR 0004 ; le seuil du §9 déclenche la réévaluation.

## Notes d'implémentation

- Dépendances de `apps/chat` : `socket.io`, `@socket.io/redis-adapter`. Pas de `socket.io` dans `apps/api`.
- Tests à écrire en premier : upgrade sans token refusé en `401` sans qu'aucune connexion socket.io ne soit créée ; événement inconnu rejeté et compté ; message au-delà de 4 Ko refusé par le transport ; ban qui émet `session:revoked` puis déconnecte toutes les sockets du salon `user:<id>` ; fan-out entre deux instances via l'adapter Redis.
- `ChatSession` (ADR 0011) : reconnexion de la bibliothèque désactivée, WebSocket forcé, en-tête `Authorization` recalculé avant chaque tentative.
- Les métriques de l'ADR 0004 restent exigées, plus une nouvelle : fermetures pour dépassement de `writeBuffer`.
