# Spike — client iOS socket.io

- Date : 2026-09-24
- Origine : point ouvert de l'ADR 0022 (« état de maintenance du client Swift officiel et compatibilité avec la concurrence stricte non vérifiés »)
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

Le client Swift officiel de socket.io peut-il servir de base à `ChatSession` (ADR 0011), avec les exigences de l'ADR 0022 : WebSocket uniquement, token dans l'en-tête `Authorization`, reconnexion pilotée par l'app, distinction entre « rafraîchis puis reconnecte » et « n'essaie plus », Swift 6 en concurrence stricte (ADR 0010) ?

## Réponse courte

**Non, pas comme base de `ChatSession`.** Le client officiel fonctionne sur le chemin nominal, mais :

1. il n'est plus maintenu en pratique ;
2. il **avale le statut HTTP d'un handshake refusé**, ce qui rend impossible la distinction 401 / 403 exigée par l'ADR 0022 ;
3. il embarque environ 7 600 lignes de code (lui-même et Starscream) pour les quelques types de paquets dont on se sert.

Le repli prévu par l'ADR 0022 — un client minimal du protocole au-dessus de `URLSessionWebSocketTask` — a été prototypé : **environ 150 lignes, tous les scénarios passent**, en Swift 6 strict, sans dépendance.

Le spike a aussi révélé **une erreur dans l'ADR 0022, côté serveur** : `allowRequest` ne permet pas de répondre `401` ou `403`.

## Montage

- Serveur : `socket.io` 4.8.3 (`engine.io` 6.6.10), Node 22, configuré comme l'ADR 0022 (`transports: ["websocket"]`, `maxHttpBufferSize: 4096`, `pingInterval: 30 s`, `pingTimeout: 60 s`).
- Client officiel : `socket.io-client-swift` 16.1.1, dans un package SPM en `swift-tools-version:6.0` et `swiftLanguageMode(.v6)`, Swift 6.3.3, Xcode 26.6, cible macOS 14.
- Client minimal : même toolchain, zéro dépendance, `URLSessionWebSocketTask`.
- Scénarios : connexion valide avec message acquitté puis révocation (`session:revoked`) ; token invalide ; token d'un compte banni ; message de 5 000 octets au-delà du plafond de 4 Ko.

## Constats

### 1. Maintenance du client officiel

| Indicateur | Valeur au 2026-09-24 |
|---|---|
| Dernière release | v16.1.1, 2024-10-01 (précédente : 2023-08) |
| Dernier commit | 2024-10-01 |
| Issues ouvertes | 259 |
| Issue « Swift 6 Rewrite » (#1416) | Ouverte depuis 2022, sans suite |
| Crash ouvert sur les acks en 16.1.1 (#1509, `handleAck`) | Ouvert depuis 2024-12, sans réponse |
| Dépendance Starscream | Dernier commit 2024-05, dernière release 4.0.8 (2024-03) |

Deux ans sans commit, sur les deux étages de la pile.

### 2. Compilation en Swift 6 strict : OK, mais pour une mauvaise raison

Le code applicatif compile sans avertissement en mode Swift 6. Mais c'est parce que la bibliothèque est déclarée en `swift-tools-version:5.4` : **elle est compilée en mode Swift 5, et ses types ne sont pas `Sendable`**. Côté app, les callbacks arrivent sur la file principale (valeur par défaut de `handleQueue`), et chaque handler doit être enveloppé dans `MainActor.assumeIsolated`. Ça compile, mais la sûreté repose sur une convention d'exécution que le compilateur ne vérifie pas. Si quelqu'un change `handleQueue`, l'app plante à l'exécution, sans aucun avertissement à la compilation.

### 3. Chemin nominal : OK

| Exigence (ADR 0022) | Client officiel | Client minimal |
|---|---|---|
| Token dans `Authorization` à l'upgrade | OK (`.extraHeaders`) | OK (`URLRequest`) |
| WebSocket uniquement | OK (`.forceWebsockets(true)`) | OK (par construction) |
| Reconnexion de la bibliothèque désactivée | OK (`.reconnects(false)`) | Sans objet (aucune reconnexion intégrée) |
| Message avec ack | OK | OK |
| `session:revoked` reçu avant la déconnexion | OK | OK |
| Message au-delà de 4 Ko coupé par le serveur | OK (déconnexion) | OK (fermeture `1009`, « message too big ») |
| Refus au handshake : **statut HTTP lisible** | **Non** | **Oui** (`401` / `403` distingués) |

### 4. Le client officiel perd le statut HTTP d'un refus

Sur un token refusé, l'app reçoit seulement `disconnect ["Socket Disconnected"]` : impossible de distinguer un 401, un 403 ou une coupure réseau.

Cause, dans `SocketEngine.swift` (v16.1.1) : Starscream remonte bien l'erreur `HTTPUpgradeError.notAnUpgrade(code, headers)` via un événement `.error`, mais le `switch` de `didReceive(event:client:)` ne traite pas ce cas. Il tombe dans `case _: break`, puis la déconnexion qui suit est signalée sans erreur.

Conséquence pour l'ADR 0022 §4 et §5 : `ChatSession` ne peut pas savoir s'il doit rafraîchir le token ou s'arrêter. Contournements possibles, tous mauvais : forker la bibliothèque, ou retenter une fois après rafraîchissement puis considérer un second refus comme définitif (une tentative inutile à chaque ban).

### 5. Côté serveur : `allowRequest` répond toujours `400`

Avec `allowRequest`, **tout refus d'upgrade est renvoyé en `400 Bad Request`**, quel que soit le code d'erreur passé au callback. C'est codé en dur dans `abortUpgrade` (`engine.io/build/server.js:751`, version 6.6.10). L'ADR 0022 §4 (« au handshake, `401` … et `403` … ») est donc faux tel qu'écrit, et ce quel que soit le client.

**Contournement validé** : ne pas attacher socket.io au serveur HTTP, et gérer soi-même l'événement `upgrade`. On vérifie le token, on répond `401` ou `403` en écrivant directement sur la socket TCP, puis on détruit la socket ; sinon, on passe la main à `engine.handleUpgrade`. Le refus a toujours lieu avant toute allocation Engine.IO : aucune connexion n'est créée, vérifié dans les logs du serveur.

```js
const engine = new EngineServer({ transports: ["websocket"], maxHttpBufferSize: 4096, pingInterval: 30000, pingTimeout: 60000 });
const io = new Server();
io.bind(engine);

httpServer.on("upgrade", (req, socket, head) => {
  const status = verifyUpgrade(req.headers.authorization); // JWKS local, sans I/O (ADR 0005)
  if (status !== 200) {
    socket.write(`HTTP/1.1 ${status} ${status === 403 ? "Forbidden" : "Unauthorized"}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    return socket.destroy();
  }
  engine.handleUpgrade(req, socket, head);
});
```

`engine.handleUpgrade` et `io.bind` sont des API publiques, documentées. Contrairement à `writeBuffer` (ADR 0022 §8), on ne dépend ici d'aucun détail interne.

### 6. Client minimal : ce que couvre le prototype

Un `actor` Swift 6 d'environ 90 lignes, plus un parseur de trames pur d'environ 55 lignes. Il gère :
- l'ouverture Engine.IO (`0`) et la connexion au namespace par défaut (`40`) ;
- le ping/pong (`2` → `3`) ;
- les événements (`42[...]`), l'émission avec ack (`42<id>[...]` / `43<id>[...]`) et la déconnexion serveur (`41`) ;
- la lecture de `task.response.statusCode` sur un handshake refusé.

Il ne gère pas encore, et devra gérer avant d'être utilisé :
- **un chien de garde de ping** : fermer si aucun ping n'est reçu dans `pingInterval + pingTimeout`. C'est la détection des connexions mortes sur mobile ;
- **un délai d'expiration sur les acks**, et l'échec des acks en attente quand la connexion se ferme. Le prototype laisse une continuation suspendue pour toujours, ce qui est un bug ;
- **la validation des trames entrantes** contre les schémas `ServerMessage` générés (ADR 0009) ;
- **les tests** : le parseur est une fonction pure, testable sans réseau.

Estimation, avec les tests : 300 à 400 lignes. Pas de namespaces, pas de binaire, pas de long-polling : l'ADR 0022 les exclut tous.

## Ce que le spike n'a pas vérifié

- **Exécution sur un iPhone réel** : passage arrière-plan / premier plan, bascule Wi-Fi / 4G, mode basse consommation. Le spike tourne sur macOS, avec le même Foundation mais pas le même cycle de vie applicatif.
- **TLS** (`wss://`) et vrais JWT signés : le spike utilise des jetons factices en clair.
- **Charge** : aucune mesure de débit ni de mémoire.
- **Reconnexion avec backoff** : c'est le rôle de `ChatSession` (ADR 0011), hors du client de protocole dans les deux options.

## Recommandation

1. **Client iOS** : écrire un client minimal du protocole socket.io au-dessus de `URLSessionWebSocketTask`, dans un package SPM local `Core/ChatTransport` (ADR 0010). Ne pas utiliser `socket.io-client-swift`.
2. **Serveur** : remplacer `allowRequest` par un gestionnaire d'upgrade maison, qui répond `401` / `403` puis délègue à `engine.handleUpgrade`.
3. **Consigner ces deux points dans un ADR 0023** qui amende l'ADR 0022 (§3 authentification, §4 révocation, section risques). L'ADR 0022 est accepté et ne se modifie pas.

Le choix de socket.io côté serveur n'est pas remis en cause. Le serveur apporte bien ce pour quoi il a été choisi : salons, adapter Redis, heartbeat. Côté client, ce que socket.io aurait apporté (la reconnexion) est de toute façon désactivé par l'ADR 0022 §5. Il ne reste qu'un protocole simple à parler.
