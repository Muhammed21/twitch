# 0041 — Les outbox de `channel` et `stream` sont un historique lisible pour reconstruire une projection

- Statut : Accepté
- Date : 2026-11-02
- Décideurs : Muhammed Cavus
- Amende : ADR 0025 (§3, lecteurs d'une outbox)

## Contexte et problématique

L'ADR 0003 exige que la projection des lives de `discovery` se reconstruise dès la tranche 1. Les streams Redis ne suffisent pas : ils sont plafonnés à environ 100 000 entrées (ADR 0034, §3), et le `channel.created` d'une chaîne ancienne n'y est plus. Les outbox (ADR 0002, règle 2 ; ADR 0025, §3) gardent, elles, chaque event publié.

L'ADR 0025 interdit pourtant à un contexte de lire le schéma d'un autre, et seul le relais lit les outbox, avec le rôle `app_outbox_relay` (ADR 0028), qui a aussi `UPDATE` sur elles. Les ADR 0002 et 0020 supposent par ailleurs que l'outbox sera purgée.

Problématique : une projection peut-elle se reconstruire depuis les outbox d'autres contextes, avec quel rôle, et où vit le code qui les lit ?

## Facteurs de décision

- Une projection de `discovery` se reconstruit sans dépendre de la rétention de Redis (ADR 0003).
- Un contexte ne dépend que du contrat d'event (`@repo/contracts`), jamais des colonnes d'une table qu'il ne possède pas (ADR 0025).
- Le moindre privilège : reconstruire n'écrit rien dans une outbox.
- Pas de nouvelle infrastructure en tranche 1.

## Options envisagées

### Option A — Lire les outbox avec un rôle en lecture seule, par une fonction de `@repo/db`

`@repo/db`, qui possède le format des outbox et le relais, expose une lecture paginée de l'historique de plusieurs outbox. Elle rend l'enveloppe de l'event (`id`, `name`, `version`, `payload`, `occurredAt`), la même que le message d'un stream (ADR 0034, §2). Un rôle dédié n'a que `SELECT` sur les outbox lues.

- Avantages : aucune donnée nouvelle à tenir ; le contexte ne voit que l'enveloppe, comme sur un stream ; la base refuse toute écriture.
- Inconvénients : les outbox concernées ne sont plus purgeables librement.
- **Retenue.**

### Option B — Rejouer les streams après avoir remis `publishedAt` à `NULL`

Le rejeu de l'ADR 0034 (§3) : le relais republie tout l'historique, et le consommateur le relit.

- Avantages : aucun nouveau rôle.
- Inconvénients : republie chaque event pour tous les consommateurs du stream, pas seulement pour la projection reconstruite ; un historique plus long que le plafond du stream se perd pendant le rejeu.
- **Écartée.**

### Option C — Demander à chaque contexte source un export de son état courant

L'approche de l'ADR 0020 pour les follows : `channel` et `stream` exposent leur état courant, rejoué comme des events.

- Avantages : survit à une purge de l'outbox.
- Inconvénients : deux commandes d'export à écrire et à maintenir en tranche 1, pour un volume que les outbox tiennent sans peine.
- **Écartée pour la tranche 1**, et reste la voie si une purge devient nécessaire.

## Décision

### 1. Les outbox de `channel` et `stream` ne sont pas purgées

`channel.ChannelOutbox` et `stream.StreamOutbox` gardent chaque event publié : elles sont l'historique dont `discovery` reconstruit sa projection. Une purge de ces outbox exige d'abord un export de l'état courant (option C), par un ADR qui remplace celui-ci.

### 2. Un rôle `app_projection_rebuild` en lecture seule

La migration qui ouvre une outbox à la reconstruction accorde à `app_projection_rebuild` `USAGE` sur son schéma et `SELECT` sur la table, rien d'autre. Le rôle ne lit aucune autre table de ces schémas et n'écrit nulle part. Il se connecte par `DATABASE_URL_PROJECTION_REBUILD`.

### 3. La lecture de l'historique vit dans `@repo/db`

`readOutboxHistory({ pool, outboxes, after, take })` rend une page d'events de plusieurs outbox, triée par `occurredAt` puis `id`, après l'event `after`. Un contexte n'y voit que l'enveloppe de l'event ; il décode le payload avec le contrat de `@repo/contracts`, comme pour un stream.

### 4. La reconstruction est une commande, pas un process de l'API

`discovery:rebuild` tourne à la demande. Elle lit l'historique avec `app_projection_rebuild` et écrit la projection avec `app_discovery`.

## Conséquences

### Positives

- La projection se reconstruit quelle que soit la rétention de Redis.
- La base refuse toute écriture du rôle de reconstruction dans les outbox.
- `discovery` ne connaît ni le nom ni les colonnes des tables de `channel` et `stream`.

### Négatives

- Les outbox de `channel` et `stream` grossissent sans limite tant qu'aucun export ne permet de les purger.
- La reconstruction lit tout l'historique : sa durée croît avec le nombre d'events, pas avec le nombre de chaînes.

### Risques et mitigations

- **Risque : la taille des outbox pèse sur le relais.** Mitigation : le relais ne lit que les lignes où `publishedAt` est nul, par un index partiel ; l'historique publié ne ralentit pas sa passe.
- **Risque : une reconstruction trop longue sous verrou.** Mitigation : la reconstruction est linéaire en nombre d'events ; un ADR revoit l'option C si sa durée dépasse le délai de la commande.

## Notes d'implémentation

- `docker/postgres/init-roles.sh` crée `app_projection_rebuild` ; `expectedRoles` (`@repo/db`) le liste ; `.env.example` porte `PG_PASSWORD_APP_PROJECTION_REBUILD` et `DATABASE_URL_PROJECTION_REBUILD`.
- Une migration accorde `USAGE` sur `channel` et `stream`, et `SELECT` sur `ChannelOutbox` et `StreamOutbox`.
- `discovery` adapte son port `OutboxHistory` sur `readOutboxHistory`.

## Liens

- [0002](0002-monolithe-modulaire-hexagonal.md) : outbox et relais.
- [0003](0003-decoupage-bounded-contexts.md) : projection de `discovery` reconstructible.
- [0020](0020-modele-du-follow-et-graphe-social.md) : export de l'état courant, voie de l'option C.
- [0025](0025-un-client-prisma-par-contexte.md) : un rôle par contexte, une outbox par schéma.
- [0028](0028-conteneurisation-et-environnement-local-docker-compose.md) : rôle `app_outbox_relay` du relais.
- [0034](0034-un-stream-redis-par-contexte-pour-les-events-de-l-outbox.md) : rétention des streams et format de l'enveloppe.
