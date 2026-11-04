# 0043 — Le seau de rate limit du chat vit dans Redis, et se replie sur le seau local de l'instance quand Redis ne répond pas

- Statut : Proposé
- Date : 2026-11-04
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0004 (§6) fixe un rate limit global par utilisateur sur le chat : un token bucket Redis, un message par seconde en régime permanent, rafale de 5, modérateurs et propriétaire compris. Depuis le fan-out par `@socket.io/redis-adapter` (ADR 0022), plusieurs instances du chat tournent. Le seau d'un utilisateur était en mémoire de l'instance : un utilisateur dont les sockets tombent sur deux instances avait deux seaux, donc deux fois la limite (https://github.com/Muhammed21/twitch/issues/159).

Mettre le seau dans Redis pose la question de sa panne. Les ADR existants ne la tranchent pas pour le rate limit du chat :

- L'ADR 0004 (« Risques ») accepte Redis comme SPOF et dit que sa perte fait tomber fan-out, compteurs et rate limiting, le chat étant best-effort.
- L'ADR 0022 garde le fan-out best-effort : pendant une panne de Redis, la diffusion locale continue.
- L'ADR 0005 (« Panne Redis ») et le chat acceptent un handshake quand la liste de révocation ne répond pas en 200 ms.
- L'ADR 0042 laisse échouer en `500` un heartbeat de présence quand Redis est indisponible. C'est une limite HTTP de l'API, pas celle d'un message de chat.

Problématique : quand le seau partagé ne répond pas, le chat refuse-t-il le message (repli fermé), l'accepte-t-il sans limite (repli ouvert), ou applique-t-il une autre limite ?

## Facteurs de décision

- Un utilisateur connecté à plusieurs instances a la limite d'un seul seau.
- Chaque décision est atomique : deux messages simultanés sur deux instances ne prennent pas le même jeton.
- Une panne de Redis ne coupe pas le chat des sockets déjà connectées, qui diffusent localement (ADR 0022).
- Une panne de Redis ne retire pas toute limite à un client qui boucle.
- Un message n'attend pas Redis plus longtemps qu'un handshake n'attend la liste de révocation.

## Options envisagées

### Option A — Affinité utilisateur → instance

- Avantages : le seau reste en mémoire, sans aller-retour Redis.
- Inconvénients : demande un routage par utilisateur devant le chat, que socket.io et Compose n'ont pas ; une reconnexion sur une autre instance repart d'un seau plein.
- **Écartée.**

### Option B — Seau Redis, repli fermé

Redis ne répond pas : le message est refusé `rate_limited`.

- Avantages : la limite n'est jamais dépassée.
- Inconvénients : une panne de Redis fait taire tout le chat, alors que la diffusion locale, elle, continue (ADR 0022). Le client voit un motif faux : il n'a pas dépassé sa limite.
- **Écartée.**

### Option C — Seau Redis, repli ouvert sans limite

- Avantages : le chat continue comme si de rien n'était.
- Inconvénients : pendant une panne, un client qui boucle n'a plus aucune limite.
- **Écartée.**

### Option D — Seau Redis, repli ouvert sur le seau local de l'instance

Redis ne répond pas : le message est décidé par un seau en mémoire de l'instance, aux mêmes seuils.

- Avantages : le chat continue pendant la panne, et chaque instance garde la limite qu'elle avait avant le seau partagé ; au pire, un utilisateur a la limite multipliée par le nombre d'instances où il est connecté.
- Inconvénients : deux seaux à tenir ; la limite globale n'est pas exacte pendant une panne.
- **Retenue.**

## Décision

### 1. Un seau par utilisateur dans Redis

Le seau d'un utilisateur vit sous `chat:rate-limit:<userId>`, un hash `tokens` et `refilledAt` (millisecondes epoch). Chaque message le lit, le remplit du temps écoulé, prend un jeton s'il en reste au moins un, et l'écrit, en une seule commande atomique (`EVAL` d'un script Lua). Un refus n'écrit rien.

La rafale (5) et le délai d'un jeton (1000 ms) sont passés au script par le domaine, seul endroit où ils sont écrits. L'instant du message est celui de l'instance qui le reçoit. Une instance dont l'horloge retarde ne rend aucun jeton : le temps écoulé n'est jamais négatif, et `refilledAt` ne recule pas.

La clé expire quand le seau serait redevenu plein : un seau absent vaut un seau plein. La clé est perdable (ADR 0008).

### 2. Le repli

Le seau partagé a 200 ms pour répondre, comme la liste de révocation au handshake. Au-delà, ou si la commande échoue, le message est décidé par le seau local de l'instance, aux mêmes seuils. Le seau local n'est débité que pendant un repli. Une commande partie vers Redis n'est pas annulée : si elle s'exécute après le délai, elle débite aussi le seau partagé. Les seaux locaux redevenus pleins sont oubliés toutes les 10 s.

Un repli est journalisé (`rate limit partagé injoignable, seau local`), sauf quand le client Redis est hors ligne : la connexion journalise déjà la panne.

### 3. Le comportement vu du client

Inchangé : un message refusé reçoit l'ack `{ reason: "rate_limited" }`, sans diffusion. Une sanction est vérifiée avant le seau, et un message refusé pour sanction ne prend aucun jeton.

## Conséquences

### Positives

- Un utilisateur connecté à deux instances a la limite d'un seul seau.
- Une panne de Redis ne fait pas taire le chat et ne retire pas toute limite.
- Le rate limit ne demande aucun routage devant le chat.

### Négatives

- Chaque message coûte une commande Redis sur le chemin de l'ack.
- Pendant une panne, la limite est celle de chaque instance, et un utilisateur sur N instances a N seaux.
- Le passage au seau local repart d'un seau plein : jusqu'à 5 messages de plus à l'entrée d'une panne.
- Redis lent mais en ligne : un message décidé par le seau local après le délai est aussi débité dans le seau partagé, quand l'`EVAL` s'exécute. La limite est plus stricte, jamais plus large.
- L'algorithme du seau est écrit deux fois, en TypeScript dans le domaine et en Lua dans le script.

### Risques et mitigations

- **Les deux algorithmes divergent.** Mitigation : les mêmes cas (sixième message refusé, jeton rendu à 1000 ms et pas à 999, plafond de 5) sont testés sur le domaine et sur le script dans Redis.
- **Un Redis lent fait passer tous les messages par le repli, journalisés un par un.** Mitigation : le journal nomme le repli ; le délai de 200 ms borne l'attente de chaque ack.
- **Les horloges des instances s'écartent.** Mitigation : le script ne rend jamais de jeton pour un temps négatif ; une instance en avance rend des jetons un peu tôt, dans la limite de la rafale.

## Notes d'implémentation

- Domaine : `takeToken`, `sanctionRejection`, `acceptMessage` et `RATE_LIMIT` dans `apps/chat/src/domain/decide.ts`.
- Port `RateLimit` dans `application/ports.ts` ; seau local dans `application/local-token-buckets.ts`.
- Script Lua dans `infrastructure/redis-token-buckets.ts`, couvert par `pnpm test:integration` ; délai et repli dans `infrastructure/shared-rate-limit.ts`.
- Le limiteur à fenêtre fixe de l'API (ADR 0042) compte autrement et n'est pas partagé : `apps/chat` ne dépend pas d'`apps/api`.

## Liens

- ADR 0004 (§6) — le rate limit global par utilisateur et ses seuils.
- ADR 0005 — l'acceptation d'un handshake quand la révocation ne répond pas en 200 ms.
- ADR 0008 — le rate limiting vit dans Redis, et ce qui est dans Redis est perdable.
- ADR 0022 — plusieurs instances derrière l'adapter Redis, fan-out best-effort.
- ADR 0042 — le limiteur à fenêtre fixe de l'API.
