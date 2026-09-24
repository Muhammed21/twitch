# 0023 — Client iOS socket.io minimal et refus HTTP au handshake

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0022 (§3 authentification, §4 révocation, §5 reconnexion, risque « bibliothèque cliente iOS »), ADR 0010 (nouveau module `Core/ChatTransport`)
- Source : [spike du 2026-09-24](../spikes/2026-09-24-client-ios-socketio.md)

## Contexte et problématique

L'ADR 0022 a retenu socket.io comme transport du chat, et laissé un point ouvert : la viabilité du client Swift officiel. Le spike du 2026-09-24 l'a testé contre un serveur configuré comme l'ADR 0022 le prescrit. Il a produit deux constats, dont un invalide une affirmation de l'ADR 0022 lui-même.

**Constat 1 — le client officiel ne convient pas.** `socket.io-client-swift` (v16.1.1) n'a reçu aucun commit depuis octobre 2024 ; sa dépendance Starscream est arrêtée depuis mai 2024. Il compile en Swift 6 uniquement parce qu'il est lui-même compilé en mode Swift 5, avec des types non `Sendable`. Et surtout, **il perd le statut HTTP d'un handshake refusé** : Starscream remonte l'erreur `notAnUpgrade(code, …)`, mais le moteur du client la jette dans un `case _: break`. L'app ne voit que « Socket Disconnected », sans pouvoir distinguer « rafraîchis ton token », « tu es banni » et « le réseau a coupé ». Or c'est précisément la distinction qu'exigent les §4 et §5 de l'ADR 0022.

**Constat 2 — `allowRequest` ne peut pas répondre `401` ou `403`.** Engine.IO répond `400 Bad Request` à tout refus d'upgrade, quel que soit le code passé au callback : c'est codé en dur (`abortUpgrade`, `engine.io` 6.6.10). L'ADR 0022 §4 (« au handshake, `401` … et `403` … ») est donc faux tel qu'écrit, et ce **quel que soit le client**.

Problématique : comment tenir les garanties de l'ADR 0022 — rejet avant toute allocation, et sémantique `401` / `403` exploitable par l'app — avec un client iOS maintenable ?

## Facteurs de décision

- **Sémantique de refus exploitable** : sans elle, `ChatSession` retente inutilement après chaque ban, ou ne se remet jamais d'un token expiré.
- **Swift 6 strict réel** (ADR 0010), pas obtenu en compilant une dépendance en Swift 5.
- **Maintenabilité** : ne pas dépendre de deux bibliothèques arrêtées dans le chemin le plus sollicité de l'app.
- **Taille du protocole réellement utilisé** : l'ADR 0022 exclut long-polling, binaire et *connection state recovery*. Le sous-ensemble restant est petit.
- **Ne pas remettre en cause socket.io côté serveur** : salons, adapter Redis et heartbeat y apportent ce pour quoi il a été choisi.

## Options envisagées

### Côté client

**Option A — Client officiel, contournement par retentative.** Sur un refus, `ChatSession` rafraîchit le token et retente une fois ; un second refus est considéré comme définitif. Garde la bibliothèque, mais au prix d'une tentative inutile à chaque ban, d'un faux « arrêt définitif » sur une simple coupure réseau pendant la retentative, et de deux dépendances arrêtées. Écarté.

**Option B — Fork du client officiel.** Corrige le `case _: break` en quelques lignes. Mais on hérite alors d'environ 7 600 lignes (client et Starscream) à maintenir seul, en Swift 5, pour ne se servir que de quelques types de paquets. Écarté.

**Option C — Client minimal du protocole au-dessus de `URLSessionWebSocketTask`.** Prototypé pendant le spike : environ 150 lignes, zéro dépendance, Swift 6 strict, tous les scénarios passent, y compris la lecture du statut `401` / `403`. **Retenu.**

### Côté serveur

**Option D — `allowRequest` avec un code d'erreur.** Impossible : la réponse est toujours `400`. Écarté.

**Option E — Refus par un code applicatif après connexion** (paquet `connect_error` avec un motif). Suppose d'ouvrir la connexion Engine.IO avant de refuser : c'est la variante « connexion anonyme » que l'ADR 0004 a écartée. Écarté.

**Option F — Gestionnaire d'upgrade maison, avant Engine.IO.** On vérifie le token sur la requête d'upgrade, on répond `401` ou `403` en écrivant directement sur la socket TCP, puis on détruit la socket ; sinon on délègue à `engine.handleUpgrade`. Validé pendant le spike : aucune connexion Engine.IO n'est créée sur refus. Repose uniquement sur des API publiques (`io.bind`, `engine.handleUpgrade`). **Retenu.**

## Décision

### 1. Serveur : le handshake est traité avant Engine.IO

- socket.io n'est **pas attaché** au serveur HTTP. Un `engine.io` `Server` est créé explicitement avec les options de l'ADR 0022 (`transports: ["websocket"]`, `maxHttpBufferSize: 4096`, `pingInterval: 30 s`, `pingTimeout: 60 s`), puis lié à socket.io par `io.bind(engine)`.
- L'événement `upgrade` du serveur HTTP est géré par un handler maison qui vérifie l'en-tête `Authorization` localement, via le JWKS en cache et sans I/O (ADR 0005), puis :
  - **`401 Unauthorized`** : token absent, mal formé, signature invalide ou expiré. Pour l'app, cela signifie « rafraîchis puis reconnecte ».
  - **`403 Forbidden`** : token valide, mais le compte est suspendu, ou la session (`sid`) est dans la liste de révocation (ADR 0005). Pour l'app, cela signifie « n'essaie plus ».
  - sinon, délégation à `engine.handleUpgrade(req, socket, head)`.
- La réponse de refus a un corps vide : aucun détail exploitable (ADR 0004, §5).
- **`allowRequest` n'est pas utilisé.** Ce paragraphe remplace l'ADR 0022 §3 sur ce point ; le reste du §3 est conservé (en-tête `Authorization`, pas de champ `auth`, en-tête jamais journalisé).
- Consulter la liste de révocation pour répondre `403` suppose une lecture Redis sur le handshake. C'est la seule I/O autorisée à cet endroit. Elle est bornée par un délai d'expiration court ; si Redis ne répond pas, le handshake est accepté, et la révocation sera appliquée par l'event de révocation et par la revalidation périodique (ADR 0004, §4).

### 2. Client iOS : `Core/ChatTransport`, un client minimal du protocole

Nouveau package SPM local **`Core/ChatTransport`** (amende la liste des modules de l'ADR 0010) :

- Implémente un protocole de `Domain` (par exemple `ChatConnection`) ; aucun type de transport ne sort du module (ADR 0010, règle 2).
- Ne dépend que de `Domain` (règle 5 de l'ADR 0010 respectée). Le token lui est fourni par un protocole de `Domain`, implémenté par `Core/Networking` et injecté par la racine de composition. `Core/ChatTransport` n'importe pas `Core/Networking`.
- Un `actor` possède la `URLSessionWebSocketTask` ; l'isolation est structurelle, comme pour `Core/Networking` (ADR 0010).
- **Sous-ensemble du protocole implémenté, et rien d'autre** : Engine.IO v4 en WebSocket (ouverture `0`, ping `2` / pong `3`, fermeture) et socket.io v5 sur le namespace par défaut (connexion `40`, déconnexion `41`, événement `42`, ack `43`). Pas de long-polling, pas de binaire, pas de namespaces multiples, pas de *connection state recovery* — tous exclus par l'ADR 0022.
- **Le parseur de trames est une fonction pure** `String → ServerFrame`, testée sans réseau. Les charges utiles sont validées contre les types `ServerMessage` générés depuis `packages/contracts` (ADR 0009) ; une trame invalide est ignorée et comptée, jamais propagée.
- **Chien de garde de ping** : si aucun ping serveur n'est reçu dans `pingInterval + pingTimeout` (valeurs lues dans le paquet d'ouverture, pas codées en dur), la connexion est déclarée morte et fermée.
- **Acks** : délai d'expiration obligatoire. Tous les acks en attente échouent à la fermeture de la connexion, aucune continuation ne reste suspendue.
- **Refus au handshake** : le statut est lu dans `task.response` et remonté comme une erreur typée — `unauthorized` (401), `forbidden` (403) ou `unavailable` (tout le reste, réseau compris).

### 3. `ChatSession` : table de décision de reconnexion

`ChatSession` (ADR 0011) reste seul responsable de la reconnexion (ADR 0022, §5). Ce paragraphe précise le §5 de l'ADR 0022, qui parlait de la « reconnexion de la bibliothèque » : il n'y a plus de bibliothèque.

| Signal | Action |
|---|---|
| Handshake `401` | Rafraîchir le token, puis reconnecter immédiatement ; un second `401` consécutif avec un token neuf passe en backoff |
| Handshake `403` | Arrêt définitif, état « accès refusé » affiché |
| `session:revoked { action: "refresh_and_reconnect" }` | Comme `401` |
| `session:revoked { action: "stop" }` | Comme `403` |
| Erreur réseau, fermeture sans `session:revoked`, chien de garde de ping | Backoff exponentiel avec gigue, token rafraîchi s'il expire avant la tentative |
| Fermeture `1009` (message trop gros) | Pas de reconnexion automatique : c'est un bug client, journalisé |

## Conséquences

### Positives

- La sémantique `401` / `403` de l'ADR 0022 devient réellement tenue, de bout en bout.
- Aucune dépendance tierce dans le chemin du chat iOS ; Swift 6 strict effectif, sans enclave en Swift 5.
- Le client ne contient que le protocole utilisé : quelques centaines de lignes lisibles, contre environ 7 600 lignes héritées.
- Côté serveur, le refus ne dépend que d'API publiques d'Engine.IO, et plus d'un comportement de `allowRequest` qu'on ne contrôle pas.

### Négatives

- Un client de protocole à écrire, tester et maintenir : estimé entre 300 et 400 lignes avec les tests.
- Une évolution du protocole socket.io (Engine.IO v5, socket.io v6) devra être répercutée à la main côté client. Les versions serveur sont donc épinglées, et une montée de version majeure du serveur devient un chantier client.
- Une lecture Redis sur le handshake, pour le `403` de révocation.

### Risques et mitigations

- **Risque : divergence de protocole silencieuse.** Une montée de version mineure du serveur modifie un détail de trame. Mitigation : un test d'intégration en CI fait tourner le vrai serveur socket.io épinglé contre le client Swift (scénarios du spike : nominal, `401`, `403`, trame trop grosse, ack, révocation). Une montée de version serveur doit le passer.
- **Risque : comportement sur appareil réel non vérifié.** Le spike a tourné sur macOS : passage en arrière-plan, bascule Wi-Fi / 4G et mode basse consommation n'ont pas été testés. **Incertitude réelle.** Mitigation : test sur iPhone réel avant la fin de la tranche 1, avec coupure réseau provoquée et retour au premier plan après 10 minutes.
- **Risque : le gestionnaire d'upgrade maison oublie un cas** que `allowRequest` traitait (chemin, origine, en-têtes invalides). Mitigation : il ne fait que vérifier le token ; toute autre validation reste celle d'`engine.handleUpgrade`, appelé ensuite.

## Notes d'implémentation

- Tests à écrire en premier, côté serveur : upgrade sans token → `401` et aucune connexion Engine.IO ; token d'une session révoquée → `403` ; Redis indisponible → handshake accepté dans le délai borné.
- Tests à écrire en premier, côté client : parseur (chaque type de trame, trames malformées) ; chien de garde qui ferme après `pingInterval + pingTimeout` ; ack qui expire ; acks en attente qui échouent à la fermeture ; chaque ligne de la table de décision du §3, contre un faux transport.
- Ordre de création iOS (ADR 0010) : `Core/ChatTransport` avant la feature `Chat`.
- Le code du spike est jetable ; le rapport est la seule trace conservée.
