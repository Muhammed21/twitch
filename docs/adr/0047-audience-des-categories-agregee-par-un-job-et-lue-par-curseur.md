# 0047 — L'audience des catégories est agrégée par un job périodique, et Browse la lit par curseur

- Statut : Accepté
- Date : 2026-11-04
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'onglet Browse de l'app iOS liste les catégories en live, de la plus regardée à la moins regardée (ADR 0045). `GET /v1/categories` rend, pour chaque catégorie, son nombre de lives et la somme des viewers de ces lives.

Le nombre de viewers d'un live vit dans Redis : ce sont les heartbeats de présence. La catégorie d'un live vit dans la projection `DiscoveryLiveChannelView` de `discovery`. Pour classer les catégories, il faut donc connaître tous les lives en cours et leurs viewers.

La première version (https://github.com/Muhammed21/twitch/pull/225) calcule cet agrégat à chaque requête. Elle lit tous les lives en cours sans `LIMIT`, demande à Redis le nombre de viewers de chacun, puis rend la liste entière sans curseur. La revue l'a relevé : l'ADR 0008 §a interdit un `findMany` sans `take`, et exige un curseur sur toute liste qui peut croître.

Problématique : comment classer les catégories par audience sans que chaque requête de Browse lise tous les lives en cours ?

## Facteurs de décision

- **Coût d'une requête** borné, quel que soit le nombre de lives (ADR 0008 §a).
- **Pagination** par curseur, avec un tri total (ADR 0008 §a).
- **Fraîcheur** : sur Twitch, Browse affiche une audience approximative. Un retard de quelques secondes est acceptable.
- **Simplicité** : pas de nouveau service, ni de nouvelle brique d'infrastructure.

## Options envisagées

### Option A — Agréger à chaque requête, sans curseur

C'est la première version de #225 : une lecture de tous les lives en cours, et un appel Redis sur tous leurs `channelId`. Le coût d'une requête croît avec le nombre de lives, et la liste n'a pas de curseur. **Écartée** : elle contredit l'ADR 0008 §a.

### Option B — Un job périodique écrit l'audience de chaque catégorie, et Browse la lit par curseur

Toutes les N secondes, un job de `discovery` parcourt les lives en cours par lots (keyset, `take`). Il lit leurs viewers dans Redis par lots, puis écrit dans `DiscoveryCategoryAudience { categoryId, liveCount, viewerCount, refreshedAt }` la somme par catégorie résolue, fusions suivies. `GET /v1/categories` lit cette table par keyset sur `(viewerCount desc, liveCount desc, categoryId)`, avec `take`, et rend `nextCursor`.

Le job s'appuie sur `startPeriodicJob`. Le calcul remplace l'agrégat entier, donc deux instances qui le lancent écrivent le même résultat. Le coût de la requête ne dépend plus du nombre de lives. **Retenue.**

### Option C — Tenir l'audience à jour à chaque heartbeat

Chaque heartbeat de présence incrémente un compteur Redis par catégorie, et un `ZSET` trié sert Browse. L'audience est fraîche à la seconde. En revanche, l'expiration des viewers, un changement de catégorie en plein live et une fusion obligent à rejouer les compteurs. Toute la logique de présence change. **Écartée** : bien plus complexe, pour une fraîcheur dont Browse n'a pas besoin.

## Décision

### 1. Un job tient l'audience de chaque catégorie

`discovery` ajoute la table `DiscoveryCategoryAudience`. Un job périodique la recalcule toutes les 15 s, par lots bornés de lives (keyset, `take`) et de lectures Redis. Seule une catégorie qui a au moins un live figure dans la table ; une catégorie qui n'a plus de live en sort au calcul suivant.

### 2. Browse lit la table par curseur

`GET /v1/categories?cursor=&limit=` lit cette table par keyset, sur le tri total `(viewerCount desc, liveCount desc, categoryId asc)`, avec `take`, et rend `nextCursor` comme `GET /v1/lives`.

### 3. Redis indisponible

Si Redis est indisponible, le job garde l'agrégat précédent et journalise l'échec. La réponse ne perd pas `viewerCount`.

## Conséquences

### Positives

- Une requête de Browse coûte une lecture indexée bornée, quel que soit le nombre de lives.
- La liste se pagine par curseur, comme `GET /v1/lives`.

### Négatives

- L'audience affichée a jusqu'à 15 s de retard.
- Un job de plus à surveiller, et une table de plus, reconstructible : il suffit de relancer le calcul.
- Chaque instance de l'API refait le calcul : le travail est multiplié par le nombre d'instances.

### Risques et mitigations

- **Un live qui monte change de rang entre deux pages.** Le keyset garantit qu'aucun élément n'apparaît deux fois, comme l'ADR 0008 §a le prévoit pour les lives triés par audience.

## Notes d'implémentation

1. Migration de `DiscoveryCategoryAudience`, avec l'index `(viewerCount desc, liveCount desc, categoryId)`.
2. Job de calcul sur `startPeriodicJob`, par lots de lives et de `channelId` lus dans Redis, fusions résolues par `resolveCategory`.
3. `GET /v1/categories` lit la table, et son contrat gagne `nextCursor`.

## Liens

- ADR 0008 §a : pagination par curseur, aucun `findMany` sans `take`.
- ADR 0045 : cycle de vie d'une catégorie, et fusions suivies en lecture.
- https://github.com/Muhammed21/twitch/pull/225 : première version, à reprendre selon cet ADR.
