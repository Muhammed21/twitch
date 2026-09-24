# Spike — charge du service de chat socket.io

- Date : 2026-09-24
- Origine : ADR 0022 §8 (protection contre les clients lents) et §9 (seuil de réévaluation), ADR 0009 (coût du parsing, « mesurer avant d'optimiser »), ADR 0021 §4 (coût du filtrage des blocages dans la diffusion)
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

1. Combien de mémoire coûte une connexion socket.io configurée comme l'ADR 0022, et le seuil de réévaluation du §9 (2 Go ou 10 000 connexions par instance) est-il le bon ?
2. Quel débit de diffusion une instance tient-elle, et avec quelle latence ?
3. Le parsing Zod d'un message entrant est-il un coût à surveiller ?
4. La protection contre les clients lents de l'ADR 0022 §8 (`volatile` et surveillance de `socket.conn.writeBuffer`) fonctionne-t-elle ?
5. Combien coûte le filtrage des blocages par destinataire (ADR 0021 §4) ?

## Réponse courte

- **La mémoire n'est pas la limite.** 10 000 connexions coûtent 210 Mo de RSS. Le seuil « 2 Go » de l'ADR 0022 §9 correspond à environ 130 000 connexions, et le CPU sature bien avant.
- **La limite, c'est le CPU de la diffusion.** Le moteur par défaut (`ws`) sature un cœur vers **230 000 livraisons par seconde**, soit environ 45 msg/s dans un salon de 5 000 viewers. Sur uWebSockets.js (`io.attachApp`), le même cœur tient **500 000 livraisons par seconde** sans perte, et la mémoire par connexion baisse de 35 %.
- **Bloquant : `volatile` jette des messages destinés à des clients en bonne santé** avec le moteur `ws`. Un paquet `volatile` est jeté dès que le transport est en train d'écrire. Or une écriture est asynchrone, donc tout message émis dans le même tick qu'un autre est perdu, pour tous les destinataires. En test, un client rapide n'a reçu que 10 % des messages. L'ADR 0022 §8 est faux sur ce point avec le moteur `ws`.
- **`writeBuffer` se comporte comme l'ADR le suppose** avec le moteur `ws` : il grossit pour un client qui ne lit plus. Une garde « sauter le client au-delà de 100 paquets en attente » le plafonne et garde la mémoire stable. Sur uWebSockets.js, `writeBuffer` reste à 0 et c'est `maxBackpressure` qui plafonne nativement.
- **Zod est négligeable** : 0,13 à 0,6 µs par message, soit 1 à 7 millions de messages par seconde et par cœur.
- **Le filtrage des blocages est correct et abordable** avec `except` : aucune fuite vers les personnes qui bloquent. Il coûte environ 20 % de CPU sur uWebSockets.js, et presque rien sur `ws` quand la garde utilise déjà `except`.

## Montage

- Machine : Mac mini M4 (`Mac16,1`), 10 cœurs, 16 Go, macOS 26. Node 22.23.2.
- **Le serveur et les clients de charge partagent la machine.** Huit processus clients tournent sur les autres cœurs. Les chiffres absolus sont donc pessimistes pour le serveur, mais les comparaisons entre configurations restent valides.
- Serveur : `socket.io` 4.8.3 (`engine.io` 6.6.10), configuration de l'ADR 0022 (`transports: ["websocket"]`, `maxHttpBufferSize: 4096`, `pingInterval: 30 s`, `pingTimeout: 60 s`), `perMessageDeflate` désactivé. Deux moteurs : `ws` 8.21.3 (par défaut) et `uWebSockets.js` v20.52.0 via `io.attachApp`.
- Clients : `ws` brut qui parle le protocole Engine.IO v4 / socket.io v5 (ouverture, `40`, ping/pong, `42`), répartis sur 8 processus.
- Diffusion : le serveur émet lui-même dans un salon unique, à un débit cadencé sur le temps écoulé. Messages d'environ 120 octets, horodatés à l'émission. La latence mesurée va de l'émission côté serveur à la réception côté client.
- Zod : `zod` 4.6.5.
- **Pas de Redis sur la machine** : le fan-out entre instances (`@socket.io/redis-adapter`) n'est pas mesuré.

## Constats

### 1. Mémoire par connexion

RSS mesurée après deux passes de GC forcées, moins la RSS du serveur à vide (environ 58 Mo).

| Moteur | Connexions | RSS totale | Par connexion (RSS) | Par connexion (tas JS) |
|---|---|---|---|---|
| `ws` | 1 000 | 85 Mo | 27,4 Ko | 11,6 Ko |
| `ws` | 5 000 | 149 Mo | 18,8 Ko | 11,0 Ko |
| `ws` | 10 000 | 211 Mo | **15,6 Ko** | 10,9 Ko |
| uWebSockets.js | 1 000 | 75 Mo | 16,0 Ko | 6,0 Ko |
| uWebSockets.js | 5 000 | 123 Mo | 13,2 Ko | 5,8 Ko |
| uWebSockets.js | 10 000 | 158 Mo | **10,1 Ko** | 5,8 Ko |

Extrapolation : 2 Go de RSS correspondent à environ 130 000 connexions sur `ws`, et 200 000 sur uWebSockets.js. **Le couple de seuils de l'ADR 0022 §9 (2 Go ou 10 000 connexions) est incohérent** : 10 000 connexions ne pèsent que 10 % de 2 Go, et aucun des deux ne mesure la vraie limite (voir §2).

Piège de mesure rencontré : macOS n'a que 16 384 ports éphémères, et les connexions fermées restent en `TIME_WAIT` pendant 30 s. Enchaîner plusieurs essais à 10 000 connexions épuise les ports (`EADDRNOTAVAIL`). À savoir pour tout test de charge local.

### 2. Débit de diffusion

Salon unique, messages `volatile` (colonne « Livrés » : proportion des livraisons attendues effectivement reçues).

| Moteur | Viewers | Débit demandé | Livraisons/s | Livrés | p50 | p99 | CPU serveur |
|---|---|---|---|---|---|---|---|
| `ws` | 1 000 | 10 msg/s | 9 900 | 100 % | 6,3 ms | 19,2 ms | 14 % |
| `ws` | 1 000 | 50 msg/s | 50 000 | 100 % | 2,6 ms | 6,5 ms | 24 % |
| `ws` | 1 000 | 100 msg/s | 87 700 | **88 %** | 2,7 ms | 5,2 ms | 37 % |
| `ws` | 5 000 | 10 msg/s | 49 500 | 100 % | 13,9 ms | 31,0 ms | 29 % |
| `ws` | 5 000 | 50 msg/s | 212 500 | **85 %** | 9,9 ms | 23,9 ms | 99 % |
| `ws` | 5 000 | 100 msg/s | 175 000 | **35 %** | 10,9 ms | 36,4 ms | 99 % |
| uWebSockets.js | 1 000 | 10 msg/s | 9 900 | 100 % | 4,7 ms | 13,3 ms | 7 % |
| uWebSockets.js | 1 000 | 50 msg/s | 49 900 | 100 % | 3,3 ms | 6,8 ms | 24 % |
| uWebSockets.js | 1 000 | 100 msg/s | 100 000 | 100 % | 2,3 ms | 4,3 ms | 25 % |
| uWebSockets.js | 5 000 | 10 msg/s | 50 000 | 100 % | 18,2 ms | 33,6 ms | 22 % |
| uWebSockets.js | 5 000 | 50 msg/s | 250 000 | 100 % | 7,6 ms | 14,2 ms | 63 % |
| uWebSockets.js | 5 000 | 100 msg/s | 500 000 | 100 % | 7,6 ms | 14,5 ms | 94 % |

La même diffusion à 5 000 viewers, **sans** `volatile`, pour isoler la cause des pertes :

| Moteur | Débit | Livrés | p50 | p99 | CPU | RSS |
|---|---|---|---|---|---|---|
| `ws` | 50 msg/s | 100 % | 13,0 ms | 36,0 ms | 107 % | 382 Mo |
| `ws` | 100 msg/s | 100 % | **393 ms** | **1 119 ms** | 126 % | **1 179 Mo** |
| uWebSockets.js | 50 msg/s | 100 % | 7,9 ms | 16,0 ms | 67 % | 110 Mo |
| uWebSockets.js | 100 msg/s | 100 % | 7,8 ms | 15,2 ms | 94 % | 111 Mo |

Lecture :
- **Plafond du moteur `ws` : environ 230 000 livraisons par seconde et par cœur.** Au-delà, soit `volatile` jette des messages, soit (sans `volatile`) les tampons s'accumulent : latence à la seconde, RSS au gigaoctet.
- **uWebSockets.js tient 500 000 livraisons par seconde** sans perte, avec une latence et une mémoire stables. Son plafond n'est pas atteint dans ce test.
- La latence du chat reste très en dessous de l'objectif de 200 ms de l'ADR 0004 tant que l'instance n'est pas saturée.
- Le p50 plus élevé à 10 msg/s qu'à 50 msg/s vient probablement de la mise en veille du CPU entre deux messages ; ce n'est pas un problème.

### 3. Parsing Zod d'un message entrant

Schéma de l'ADR 0004 §5 (union discriminée sur `type`, `uuid`, `body` de 1 à 500 caractères). Les durées incluent le coût de `process.hrtime` et sont donc légèrement surestimées.

| Opération | p50 | p99 | Débit par cœur |
|---|---|---|---|
| `JSON.parse` seul | 0,25 µs | 0,29 µs | 3,7 M msg/s |
| `JSON.parse` + union discriminée, message valide | 0,33 µs | 0,42 µs | 2,6 M msg/s |
| `JSON.parse` + union discriminée, message invalide | 0,58 µs | 1,08 µs | 1,2 M msg/s |
| `JSON.parse` + union, `body` de 500 caractères | 0,50 µs | 0,58 µs | 1,9 M msg/s |
| Objet par nom d'événement, déjà parsé (ADR 0022 §6) | 0,13 µs | 0,13 µs | 7,2 M msg/s |

Un salon à 100 messages entrants par seconde consomme environ 0,003 % d'un cœur en validation. **Le parsing n'est pas un sujet.** La diffusion coûte trois à quatre ordres de grandeur de plus que l'entrée.

### 4. Clients lents

Un client rapide et un client lent dans le même salon. Le client lent met en pause la lecture de sa socket TCP. Le serveur émet 1 000 messages de 200 octets par seconde, par rafales de 10 dans le même tick.

| Moteur, mode | Client rapide, reçus après 15 s | `writeBuffer` du client lent | Tampon natif du client lent | RSS |
|---|---|---|---|---|
| `ws`, normal | 13 680 / 13 680 | 10 219 paquets, croissance sans fin | — | 64 → 82 Mo, en hausse |
| `ws`, **`volatile`** | **1 371 / 13 710 (10 %)** | 0 | — | stable |
| `ws`, garde « sauter au-delà de 100 » | 13 660 / 13 660 | plafonné à 101 | — | stable (66 Mo) |
| uWebSockets.js, normal | 13 730 / 13 730 | 0 | plafonné à 64 Ko (`maxBackpressure`) | stable (66 Mo) |
| uWebSockets.js, `volatile` | 13 700 / 13 700 | 0 | plafonné à 64 Ko | stable (66 Mo) |

**Cause de la perte en `volatile` sur `ws`**, lue dans le code :
- `socket.io/dist/client.js:166` : un paquet `volatile` est jeté si `!this.conn.transport.writable`.
- `engine.io/build/transports/websocket.js:63` : `send()` passe `writable` à `false`, et ne le remet à `true` que dans le callback d'écriture de `ws`, qui est asynchrone.
- Conséquence : tout message émis dans le même tick qu'un message précédent trouve le transport « non inscriptible » et **il est jeté, pour tous les destinataires**, lents ou non. Un chat actif émet précisément par rafales. `volatile` n'est donc pas une protection contre les clients lents avec ce moteur : c'est une perte de messages pour tout le monde dès que le salon s'anime.
- `engine.io/build/transports-uws/websocket.js:49-52` : le transport uWebSockets.js écrit de façon synchrone et remet `writable` à `true` aussitôt. `volatile` y est inoffensif, et c'est uWebSockets.js qui gère la saturation, avec `maxBackpressure` (au-delà, il jette les messages de ce seul client).

**Garde manuelle qui fonctionne sur `ws`** : une fois par tick de 10 ms, on relève les sockets dont `writeBuffer.length > 100`, puis on diffuse sans `volatile`, avec `io.to(room).except(saturés)`. À 5 000 viewers et 50 msg/s : 100 % livrés, p50 de 10,7 ms, sans perte. Le seuil de fermeture de l'ADR 0022 §8 (« au-delà d'un seuil haut, la socket est fermée ») **n'est jamais atteint avec cette garde**, puisqu'elle empêche le tampon de grossir. La fermeture doit donc se décider sur la **durée** passée en saturation, pas sur la taille du tampon.

### 5. Filtrage des blocages (ADR 0021 §4)

5 000 viewers, dont 2 % (100) bloquent l'auteur des messages. Trois implémentations :
- `except` : chaque personne qui bloque X rejoint un salon `hides:X`, et la diffusion fait `io.to(room).except("hides:X")` ;
- boucle : parcours des sockets du salon et test d'un `Set` par destinataire ;
- référence : sans filtrage.

« Fuites » : messages de l'auteur bloqué reçus par une personne qui l'a bloqué.

| Moteur | Mode | Débit | Livrés (hors personnes qui bloquent) | Fuites | CPU | p99 |
|---|---|---|---|---|---|---|
| uWebSockets.js | sans filtrage | 50 msg/s | 100 % | (sans objet) | 66 % | 15,0 ms |
| uWebSockets.js | `except` | 50 msg/s | 99,9 % | **0** | 80 % | 17,4 ms |
| uWebSockets.js | boucle | 50 msg/s | 99,9 % | 0 | 88 % | 19,0 ms |
| uWebSockets.js | sans filtrage | 100 msg/s | 100 % | (sans objet) | 94 % | 14,2 ms |
| uWebSockets.js | `except` | 100 msg/s → **80 tenus** | 99,9 % | 0 | 97 % (saturé) | 16,7 ms |
| uWebSockets.js | boucle | 100 msg/s → **75 tenus** | 99,9 % | 0 | 98 % (saturé) | 18,3 ms |
| `ws` | garde seule | 40 msg/s | 100 % | (sans objet) | 86 % | 19,1 ms |
| `ws` | garde + `except` | 40 msg/s | 99,9 % | **0** | 83 % | 18,6 ms |
| `ws` | boucle `volatile` | 40 msg/s | **95 %** | 0 | 111 % | 24,0 ms |

Lecture :
- **`except` est la bonne implémentation** : correcte (zéro fuite) et moins coûteuse que la boucle.
- Sur uWebSockets.js, le filtrage fait perdre environ 20 % du plafond de diffusion (de 100 à 80 msg/s à 5 000 viewers).
- Sur `ws`, quand la garde contre les clients lents utilise déjà `except`, ajouter les blocages ne coûte rien de mesurable.
- La boucle par destinataire est à proscrire : plus chère, et elle encode le paquet une fois par socket au lieu d'une fois par diffusion.

## Ce que le spike n'a pas vérifié

- **Le fan-out entre instances** via `@socket.io/redis-adapter` : Redis n'est pas installé sur la machine. Or c'est le chemin de toute diffusion dès qu'il y a deux instances. Son coût (sérialisation, aller-retour Redis) reste à mesurer.
- **Des clients sur d'autres machines**, un vrai réseau et du TLS (`wss://`). Ici, tout passe par la boucle locale, sans chiffrement.
- **Un profil de salon réaliste** : plusieurs salons, des tailles hétérogènes, des entrées et sorties de viewers pendant la diffusion.
- **Une cible Linux de production** : les ordres de grandeur devraient tenir, pas les chiffres exacts.
- **Le coût du chiffrement TLS**, qui s'ajoute par livraison et peut devenir dominant.

## Recommandation

1. **Ne pas utiliser `volatile` avec le moteur `ws`.** Le remplacer par la garde « relever les sockets saturées à chaque tick, puis diffuser avec `except(saturés)` ». Fermer une socket restée saturée plus de 10 s d'affilée, au lieu de la fermer sur la taille de son tampon.
2. **Changer la métrique de réévaluation de l'ADR 0022 §9** : la mémoire n'est pas la limite. Le bon indicateur est le nombre de **livraisons par seconde par instance**. Seuil proposé : 150 000 livraisons par seconde soutenues, soit environ 65 % du plafond mesuré sur `ws`. La mémoire reste suivie, mais comme alarme secondaire.
3. **Garder uWebSockets.js (`io.attachApp`) comme porte de sortie**, avec des gains maintenant chiffrés : deux fois plus de débit, 35 % de mémoire en moins, et une gestion native des clients lents qui rend `volatile` sûr. Le coût reste celui qu'avait noté l'ADR 0022 : un binaire natif, installé depuis GitHub et non depuis le registre npm.
4. **Implémenter le filtrage des blocages avec `except`** sur un salon `hides:<userId>`, et jamais par une boucle par destinataire.
5. **Rayer le parsing Zod des risques de performance** (ADR 0009) : il est négligeable.
6. **Mesurer l'adapter Redis** avant de dimensionner le multi-instance ; c'est le principal angle mort de ce spike.
