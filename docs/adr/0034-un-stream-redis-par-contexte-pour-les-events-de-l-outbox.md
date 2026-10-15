# 0034 — Un stream Redis par contexte pour les events de l'outbox, plafonné à environ 100 000 entrées

- Statut : Accepté
- Date : 2026-10-15
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0002 (règle 2) écrit les events durables dans une outbox, dans la même transaction que l'état métier, puis un relais les publie sur Redis Streams. L'ADR 0025 (§3) place une outbox dans chaque schéma, et l'ADR 0028 fait tourner le relais dans un process séparé, `outbox-relay`, avec le rôle `app_outbox_relay`.

Aucun ADR ne fixe le nom des streams, le format d'un message ni la rétention. Le premier consommateur arrive avec le contexte `channel`, qui crée une chaîne à la réception de `identity.account.registered` ; le chat suivra avec `channel.created` et les sanctions de `moderation` (ADR 0004). Changer ces conventions une fois plusieurs consommateurs en place oblige à migrer chacun d'eux.

Problématique : sur quels streams Redis le relais publie-t-il les events de l'outbox, sous quelle forme et avec quelle rétention ?

## Facteurs de décision

- Un consommateur reçoit les events d'un même agrégat dans l'ordre où ils ont eu lieu (inscription avant suppression d'un compte).
- La mémoire de Redis reste bornée.
- Un consommateur reconstruit l'event du contrat (`@repo/contracts`) sans connaître le relais.
- La garantie reste _at-least-once_, avec des consommateurs idempotents (ADR 0002).

## Options envisagées

### Option A — Un stream par contexte

`events.identity`, `events.channel`… Chaque outbox publie sur le stream de son schéma. Un consommateur lit le stream du contexte qu'il suit, dans son propre consumer group, et ignore les noms d'event qui ne le concernent pas.

- Avantages : l'ordre des events d'un contexte est conservé ; une outbox correspond à un stream ; peu de streams à surveiller.
- Inconvénients : un consommateur lit aussi les events qu'il ignore.
- **Retenue.**

### Option B — Un stream par event

`identity.account.registered`, `channel.created`… Chaque consommateur ne lit que ce qu'il traite.

- Avantages : aucun filtrage côté consommateur.
- Inconvénients : deux events d'un même agrégat arrivent sur deux streams, sans ordre entre eux ; un consumer group par event et par consommateur.
- **Écartée** : elle perd l'ordre entre les events d'un même agrégat.

### Rétention

- `MAXLEN ~ 100000` : taille plafonnée, coupe approximative et peu coûteuse. **Retenue.**
- `MINID` sur sept jours : un consommateur rattrape une semaine d'arrêt, mais la mémoire suit le volume d'events. **Écartée.**
- Aucun plafond : Redis grossit sans limite. **Écartée.**

## Décision

### 1. Un stream par contexte

Le relais publie chaque event d'une outbox sur le stream `events.<contexte>`, où `<contexte>` est le schéma de l'outbox : `identity.IdentityOutbox` publie sur `events.identity`. Un consommateur crée son consumer group, nommé d'après son contexte, sur chaque stream qu'il suit.

### 2. Un message par event, au format du contrat

Une entrée du stream porte cinq champs, tous textuels :

| Champ        | Contenu                                       |
| ------------ | --------------------------------------------- |
| `id`         | identifiant de l'event (UUID de l'outbox)     |
| `name`       | nom de l'event, `identity.account.registered` |
| `version`    | version du contrat, en entier décimal         |
| `occurredAt` | date d'occurrence, ISO 8601 en UTC            |
| `payload`    | payload en JSON                               |

L'identifiant de l'entrée Redis est généré par Redis (`*`). Un consommateur déduplique par le champ `id`, jamais par l'identifiant d'entrée : un event republié après une coupure reçoit une nouvelle entrée.

### 3. Environ 100 000 entrées par stream

Chaque `XADD` coupe le stream à environ 100 000 entrées (`MAXLEN ~ 100000`). L'outbox reste la source de vérité : un event coupé du stream avant d'avoir été lu est déjà marqué publié, et se rejoue en remettant son `publishedAt` à `NULL`, ce que le relais reprend à sa passe suivante.

## Conséquences

### Positives

- Les events d'un contexte arrivent dans l'ordre de leur occurrence, tant que leur publication réussit.
- La mémoire de Redis est bornée, quel que soit le volume.
- Un consommateur reconstruit l'event avec le schéma du contrat, sans connaître l'outbox.

### Négatives

- Un consommateur lit et ignore les events qui ne le concernent pas.
- Un event dont la publication échoue est reprogrammé pendant que les suivants partent : l'ordre n'est plus garanti pour lui.
- Un consommateur arrêté assez longtemps pour que 100 000 events passent perd les plus anciens ; il faut les rejouer en remettant leur `publishedAt` à `NULL` dans l'outbox, par une opération manuelle tant qu'aucun outil de rejeu n'existe.

### Risques et mitigations

- **Risque : un consommateur traite un event avant celui qui l'a précédé, après une reprogrammation.** Mitigation : les consommateurs sont idempotents et vérifient l'état qu'ils modifient (ADR 0002) ; une reprogrammation suit en pratique une panne de Redis, qui touche tous les events du lot.
- **Risque : un contexte très bavard pousse les events utiles hors du stream.** Mitigation : le plafond se règle par stream ; un nouvel ADR le change si un contexte le dépasse.

## Notes d'implémentation

- Adapter du port `OutboxPublisher` (`@repo/db`) dans `apps/api`, sur le client `redis` : `XADD events.<contexte> MAXLEN ~ 100000 * id … name … version … occurredAt … payload …`.
- Le process `outbox-relay` parcourt la liste des outbox avec `relayOutboxBatch` (`@repo/db`) et le rôle `app_outbox_relay`.
- Le premier consommateur (`channel`, plan `api`, PR 9c) crée son groupe par `XGROUP CREATE events.identity channel 0 MKSTREAM` : il part du début du stream et lit les events publiés avant sa création, en dédupliquant par `id`. Un groupe créé avec `$` les perdrait.

## Liens

- [0002](0002-monolithe-modulaire-hexagonal.md) : outbox, Redis Streams pour les events durables, consommateurs idempotents.
- [0004](0004-chat-process-separe-topologie-temps-reel.md) : sanctions consommées par le chat sur Redis Streams.
- [0025](0025-un-client-prisma-par-contexte.md) : une outbox par schéma, rôle `app_outbox_relay`.
- [0028](0028-conteneurisation-et-environnement-local-docker-compose.md) : process `outbox-relay`.
