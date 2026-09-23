# 0004 — Chat en process séparé et topologie temps réel à trois canaux

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0002 acte un monolithe modulaire, avec une exception annoncée : le chat. Cet ADR instruit cette exception, et traite plus largement la question du temps réel.

Le chat n'a rien du profil de l'API. L'API sert des requêtes HTTP courtes, sans état, où la mémoire par requête est libérée immédiatement. Le chat maintient des dizaines de milliers de connexions WebSocket ouvertes pendant des heures, chacune consommant de la mémoire en permanence, avec un routage fan-out : un message posté doit être diffusé à tous les connectés du salon.

Colocaliser les deux revient à faire dépendre la disponibilité de l'API de la charge du chat. Un pic de connexions (un gros streamer démarre) sature l'event loop et la mémoire du processus, et **toute l'API tombe** : plus d'authentification, plus de page d'accueil, plus de paiement. Un incident de chat devient un incident total. Ce n'est pas un risque théorique : c'est le mode de défaillance par défaut d'un Node colocalisé.

Second problème, souvent mal traité : par facilité, on fait passer **tout** le temps réel dans le même WebSocket — messages, compteur de viewers, statut du live, notifications. On obtient alors un canal unique où un flux à haut débit (le chat) et un flux à faible débit mais critique (« le live a démarré ») partagent le même sort. Si le WebSocket se déconnecte, l'utilisateur perd tout.

Problématique : quelle topologie temps réel, quel déploiement, et quelles garanties de sécurité sur un canal qui échappe aux réflexes du REST ?

## Facteurs de décision

- **Isolation des défaillances** : le chat ne doit jamais pouvoir faire tomber l'authentification ou le paiement.
- **Profils de scaling divergents** : connexions longues stateful vs requêtes courtes stateless.
- **Coût mémoire par connexion** : c'est la ressource limitante, pas le CPU.
- **Sécurité** : le WebSocket est le trou classique — on valide et on autorise le REST, et on oublie le canal temps réel.
- **Latence perçue** : un message de chat doit apparaître en moins de 200 ms.
- **Complexité acceptable pour un solo** : un processus de plus est acceptable ; huit ne le seraient pas.

## Options envisagées

### Option A — Chat dans l'API NestJS avec `@WebSocketGateway` (socket.io)

- **Avantages** : un seul déploiement, DX excellente, fallback long-polling, rooms et reconnexion fournies.
- **Inconvénients** : couplage du destin de l'API à la charge du chat — l'argument rédhibitoire. De plus, socket.io ajoute un protocole propriétaire par-dessus WebSocket, un handshake HTTP supplémentaire et une surcharge mémoire par connexion nettement supérieure à une WebSocket brute. Le fallback long-polling est inutile ici : le client est une app iOS native, pas un navigateur d'entreprise derrière un proxy de 2012.

### Option B — Service de chat séparé avec `ws` ou socket.io standalone

- **Avantages** : isolation obtenue, écosystème Node familier, socket.io apporte rooms et reconnexion gratuitement.
- **Inconvénients** : socket.io reste coûteux en mémoire et en allocations par message ; `ws` est plus sobre mais reste sensiblement en deçà d'une implémentation native pour le nombre de connexions par instance.

### Option C — Service de chat séparé avec `uWebSockets.js`

- **Avantages** : implémentation C++ native, mémoire par connexion très inférieure, débit de messages d'un ordre de grandeur au-dessus des solutions JS pures, backpressure exposée nativement (`getBufferedAmount`) — ce qui est exactement le mécanisme dont un fan-out a besoin.
- **Inconvénients** : API bas niveau — rooms, reconnexion, heartbeat et sérialisation sont à écrire ; dépendance à un binaire natif (contraintes de build et de déploiement) ; distribué hors npm registry standard historiquement ; communauté plus petite ; pas de fallback non-WebSocket.

### Option D — Déléguer à un service managé (Ably, Pusher, PubNub)

- **Avantages** : zéro opération, scaling et présence gratuits, SDK iOS fournis.
- **Inconvénients** : tarification par message et par connexion qui devient prohibitive précisément sur le cas d'usage du chat live (fort volume, faible valeur unitaire) ; la logique métier de modération devrait être appliquée soit avant publication (aller-retour), soit côté client (inacceptable) ; perte de contrôle sur le rate limiting. Le chat est un différenciateur produit, pas une commodité — contrairement au transcodage (ADR 0001), où l'arbitrage inverse a été retenu.

## Décision

### 1. Le chat est un déploiement séparé, dès le premier jour

`apps/chat`, process distinct, scalé horizontalement et indépendamment de l'API. Ce n'est pas une optimisation prématurée : c'est une décision de découplage de défaillance, et la coloc serait bien plus coûteuse à défaire plus tard (l'état est dans les connexions, pas dans une base qu'on migre).

**Transport : `uWebSockets.js`**, pour la mémoire par connexion et la backpressure native. Le coût — écrire soi-même rooms, heartbeat et reconnexion — est un coût borné et compris, contrairement au coût non borné de la saturation mémoire.

**Fan-out inter-instances : Redis Pub/Sub.** Avec plusieurs instances de chat, un viewer connecté à l'instance A doit recevoir un message posté sur l'instance B. Chaque instance s'abonne aux salons qu'elle héberge et rediffuse localement. Redis Pub/Sub (et non Streams) est le bon choix ici : le fan-out de chat est explicitement best-effort — un message de chat perdu pendant une déconnexion de 200 ms n'a aucune valeur, et payer la durabilité pour ça serait absurde. Les events qui doivent survivre (bans) passent, eux, par Redis Streams et l'outbox de l'ADR 0002.

### 2. Trois canaux temps réel distincts

Un seul canal pour tout est un anti-pattern. Nous en séparons trois, selon leur débit, leur criticité et leur direction.

| Canal | Contenu | Transport | Direction | Criticité |
|---|---|---|---|---|
| 1 | Messages de chat | WebSocket (`uWebSockets.js`) | Bidirectionnel | Best-effort |
| 2 | Compteur de viewers, statut live, raids | SSE (ou WS pub/sub) | Serveur → client | Important, pas critique |
| 3 | Mise en ligne d'un streamer suivi | APNs | Push, hors app | Critique, hors session |

**Canal 1 — chat.** Le seul qui soit réellement bidirectionnel. Haut débit, faible valeur unitaire.

**Canal 2 — état du live.** Unidirectionnel, faible débit, et **agrégé côté serveur** : un tick par seconde et par salon, pas un message par entrée/sortie de viewer. Sans cette agrégation, 10 000 viewers qui se connectent produisent 10 000 broadcasts à 10 000 destinataires — 100 millions de messages pour afficher un nombre. SSE suffit largement, coûte moins cher qu'un WebSocket, se reconnecte tout seul et traverse les proxies sans histoire.

**Canal 3 — APNs.** Par nature hors application. Ne doit pas dépendre d'une connexion ouverte, puisque tout son intérêt est d'atteindre un utilisateur qui n'est pas là. Possédé par le contexte `notification` (ADR 0003).

Bénéfice principal de la séparation : la dégradation devient partielle. Si le WebSocket de chat tombe, le viewer continue à regarder le live et à voir le compteur. Si tout passait par un canal, il perdrait tout.

### 3. Le compteur de viewers n'est jamais calculé en SQL

`SELECT COUNT(*) FROM viewer_sessions WHERE stream_id = ?` rafraîchi toutes les secondes est une manière fiable de tuer une base PostgreSQL. C'est une écriture par connexion, plus un scan par tick, pour une donnée approximative et jetable.

**Redis est la source de vérité du compteur temps réel :**

- **HyperLogLog** (`PFADD` / `PFCOUNT`) pour le nombre de viewers uniques : mémoire constante (~12 Ko par salon quel que soit le volume), erreur ~0,81 %. Sur un compteur affiché à l'écran, cette erreur est invisible. Le sorted set présenté comme alternative « exacte » ne l'est de toute façon pas — un viewer avec deux onglets ou un réseau instable fausse le comptage bien plus que 0,81 %.
- **Sorted set avec score = timestamp** pour la présence active, quand la liste des viewers est réellement nécessaire (petits salons, liste de modération) : `ZADD` au heartbeat, `ZREMRANGEBYSCORE` pour expirer les inactifs. Coûteux en mémoire, donc réservé aux salons sous un seuil.

**Flush périodique en base** : toutes les 30 secondes, un échantillon `(sessionId, timestamp, viewerCount)` est persisté par le contexte `stream` pour l'historique et les statistiques. C'est de la série temporelle, pas de l'état.

PostgreSQL ne voit jamais le compteur temps réel. Il ne voit que des échantillons historiques.

### 4. Authentification au handshake **puis revalidation périodique**

C'est le point que la plupart des implémentations ratent.

Authentifier uniquement à l'ouverture de la connexion signifie qu'un ban ne prend effet qu'à la reconnexion — soit potentiellement jamais, puisqu'un utilisateur banni n'a aucune raison de recharger. Le modérateur voit le banni continuer à écrire.

Donc :

1. **Au handshake** : l'access token est présenté dans le sous-protocole `Sec-WebSocket-Protocol` et **vérifié localement via le JWKS mis en cache, sans aucun I/O** — pas d'appel à `identity` sur le chemin d'ouverture (ADR 0005). Une poignée de main sans token valide est **refusée** : aucune socket n'est ouverte. Le `ChatterContext` est ensuite construit — identité, rôle sur ce canal, statut d'abonné, sanctions actives — et attaché à la socket.
2. **En continu** : le service de chat consomme `moderation.user.banned` / `timed_out` via Redis Streams et **ferme immédiatement** les sockets concernées. C'est le chemin rapide, et c'est lui qui fait l'essentiel du travail.
3. **Périodiquement** (toutes les 5 minutes) : revalidation du contexte de la socket — le token n'a-t-il pas expiré, le compte n'est-il pas suspendu. Filet de sécurité contre un event perdu, pas mécanisme principal.

Le point 2 seul serait insuffisant (les events se perdent) ; le point 3 seul serait trop lent (5 minutes de ban ignoré). Les deux sont nécessaires.

Le token n'est **ni en query string** — les URLs fuient dans les logs d'accès, les proxies et l'historique — **ni dans un premier message applicatif après l'ouverture**. Cette seconde variante a été envisagée puis écartée : elle laisse vivre une socket non authentifiée pendant quelques secondes, c'est-à-dire une ressource mémoire allouée sur simple demande anonyme, et donc un vecteur d'épuisement de connexions trivial à exploiter. Le rejet a lieu **au handshake, avant toute allocation**.

Corollaire : il n'existe pas de message `auth` dans le protocole applicatif. Une socket ouverte est une socket déjà authentifiée.

### 5. Validation Zod de **tous** les messages entrants

Trou de sécurité classique et systématique : le projet valide rigoureusement chaque DTO REST, puis fait `JSON.parse(data)` sur le WebSocket et accède directement aux champs. Le canal temps réel est une frontière de confiance exactement au même titre qu'un endpoint HTTP, et il est en général moins surveillé.

```ts
const IncomingMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), roomId: z.string().uuid(), body: z.string().min(1).max(500) }),
  z.object({ type: z.literal("join"), roomId: z.string().uuid() }),
  z.object({ type: z.literal("heartbeat") }),
]);
```

Toute trame invalide est rejetée sans détail d'erreur exploitable, et comptabilisée. Au-delà d'un seuil, la socket est fermée : un client qui envoie du bruit malformé est soit bogué, soit hostile.

Le `JSON.parse` lui-même est protégé (try/catch) et la taille de trame est plafonnée **au niveau du transport** (`maxPayloadLength`), avant parsing. Parser d'abord et valider la taille ensuite est déjà une vulnérabilité.

### 6. Rate limiting spécifique au chat

Le rate limiting HTTP par IP ne convient pas : un salon de chat, ce sont beaucoup de messages légitimes et courts, depuis des IP mobiles souvent partagées. Quatre limites cumulatives :

- **Global par utilisateur** : token bucket Redis, ~1 message/seconde en régime permanent, rafale de 5. S'applique à tout le monde, modérateurs compris.
- **Slow mode** : délai minimum configurable par le streamer entre deux messages d'un même utilisateur dans son salon.
- **Followers-only** : seuls les followers (optionnellement depuis N minutes) peuvent écrire. Contre-mesure directe aux raids de comptes jetables.
- **First-time chatter** : le premier message d'un utilisateur dans un salon est marqué, éventuellement mis en attente de validation. Signal à forte valeur pour la modération, coût quasi nul.

Ces états sont maintenus par le contexte `chat`, à partir des events consommés de `channel`, `moderation` et `monetization` (ADR 0003). Aucun appel synchrone vers l'API dans le chemin d'un message — jamais.

### 7. Backpressure

Un client lent (réseau mobile dégradé) dans un salon rapide ne draine pas son buffer. Sans traitement, le buffer serveur croît jusqu'à la saturation mémoire du processus. Un seul client lent peut ainsi dégrader tout un salon.

`uWebSockets.js` expose `ws.getBufferedAmount()`. Politique retenue :

- Au-delà d'un seuil de buffer, on **cesse d'envoyer à ce client** plutôt que de continuer à empiler.
- Au-delà d'un seuil haut, la socket est **fermée** — le client se reconnectera et repartira du présent.
- On ne rejoue jamais l'historique manqué : un message de chat vieux de 30 secondes n'intéresse personne.

Ce choix est cohérent avec le best-effort du canal 1. La correction du chat, c'est « maintenant », pas « tout ».

## Conséquences

### Positives

- Une panne de chat ne touche ni l'authentification, ni le live, ni le paiement. C'est le bénéfice central.
- Le chat se scale horizontalement selon son propre profil, sans répliquer l'API.
- Le compteur de viewers coûte une mémoire constante et n'approche jamais PostgreSQL.
- La séparation en trois canaux rend la dégradation partielle et compréhensible pour l'utilisateur.
- Le WebSocket bénéficie du même niveau de validation et d'autorisation que le REST — ce qui, en pratique, est rarement le cas.
- La backpressure empêche qu'un client dégradé devienne un incident serveur.

### Négatives

- Un deuxième déploiement, un deuxième pipeline, une deuxième source de logs et de métriques — sur un projet solo, ce n'est pas anodin.
- `uWebSockets.js` impose d'écrire soi-même rooms, heartbeat, reconnexion et sérialisation, là que socket.io offrait gratuitement.
- Redis devient une dépendance critique : sans lui, plus de fan-out, plus de compteur, plus de rate limiting.
- Le client iOS doit gérer trois canaux avec trois politiques de reconnexion distinctes.
- Duplication partielle de la logique d'authentification entre API et chat.

### Risques et mitigations

- **Risque : `uWebSockets.js` est un pari.** Binaire natif, distribution historiquement hors registry npm standard, communauté restreinte, API bas niveau. Incertitude réelle et assumée : je ne sais pas si le gain de performance sera visible aux volumes réels d'un projet perso, et il est très possible qu'il ne le soit jamais. Mitigation : le transport est isolé derrière une interface `ChatTransport` ; passer à `ws` est un changement d'adapter, pas une réécriture. Si le build natif pose problème en CI ou en déploiement, basculer sans état d'âme.
- **Risque : Redis en SPOF.** Sa perte fait tomber fan-out, compteurs et rate limiting simultanément. Mitigation : à court terme, accepter — le chat est best-effort, et un projet perso n'a pas besoin de Redis Sentinel. Documenter que la dégradation attendue est « chat indisponible », pas « API indisponible ». Plus tard : Redis managé avec réplication.
- **Risque : ban toujours pas instantané.** Les points 2 et 3 réduisent la fenêtre sans l'annuler : si l'event de ban se perd, la sanction peut attendre jusqu'à 5 minutes. Incertitude : ce délai est-il acceptable produit ? Probablement oui en pratique, mais il faudra le vérifier auprès d'un vrai modérateur avant de considérer la question close. Mitigation possible si non : abaisser l'intervalle, ou ajouter un canal de commande de révocation direct.
- **Risque : duplication de la logique d'autorisation.** Deux implémentations divergentes de « qui a le droit d'écrire » finiraient par créer une faille. Mitigation : la construction du `ChatterContext` vit dans un package partagé `packages/contracts`, testée une seule fois, consommée par les deux applications.
- **Risque : seuils de backpressure arbitraires.** Les valeurs initiales seront des devinettes. Mitigation : les rendre configurables par variable d'environnement, instrumenter le nombre de déconnexions pour backpressure dans PostHog, et ajuster sur données réelles — pas sur intuition.
- **Risque : imprécision du HyperLogLog contestée.** Un streamer qui compare notre compteur à celui d'une autre plateforme verra un écart. Mitigation : c'est un problème de communication, pas de technique. Ne pas céder à la tentation de passer à un comptage « exact » qui ne le serait pas davantage et coûterait beaucoup plus cher.

## Notes d'implémentation

- `apps/chat` est une application du monorepo Turborepo, partageant `packages/contracts` avec l'API. Elle ne dépend pas de NestJS.
- La logique métier du chat (droit d'écrire, application du rate limit, modes de salon) est une fonction **pure** prenant `(ChatterContext, RoomState, Message)` et renvoyant une décision. Testable sans socket ni Redis — condition du TDD strict sur ce service.
- Heartbeat applicatif dans les deux sens toutes les 30 s ; une socket sans heartbeat pendant 90 s est fermée. Les connexions mortes sur mobile sont la norme, pas l'exception.
- Le canal 2 (SSE) est servi par l'API, pas par le service de chat : c'est un flux de lecture d'état, il appartient naturellement à `stream`/`discovery`.
- `chat` n'écrit dans PostgreSQL que de façon asynchrone et échantillonnée. Le chemin chaud d'un message ne touche jamais la base.
- Métriques minimales exposées dès le départ : connexions actives par instance, messages par seconde, déconnexions pour backpressure, trames rejetées par la validation Zod. Sans elles, aucune des décisions ci-dessus n'est vérifiable.
- En développement, Redis tourne dans le Docker Compose existant ; aucun service managé n'est requis pour le dev local.
