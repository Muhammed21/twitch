# 0049 — Le suivi d'une catégorie vit dans `channel` sur le modèle du follow, la fusion le transfère, et `discovery` le projette pour la page de la catégorie

- Statut : Accepté
- Date : 2026-11-04
- Décideurs : Muhammed Cavus
- Amende : ADR 0003 (consommations d'events de `discovery`)

## Contexte et problématique

La page d'une catégorie de l'app iOS reçoit l'en-tête de Twitch : pochette, nom, viewers, tags et bouton Follow. Sur Twitch, ce bouton suit la **catégorie**, pas une chaîne, et le nombre de followers de la catégorie s'affiche dans l'en-tête.

L'ADR 0020 décrit le follow d'une chaîne : une ligne par paire, un état, une version monotone par paire, des events par l'outbox, et une règle de convergence pour chaque consommateur. Il ne dit rien d'une catégorie. L'ADR 0021 (§3) place le catalogue des catégories dans `channel`. L'ADR 0045 fixe leur cycle de vie : une catégorie fusionnée garde son slug, qui mène à la cible, et une catégorie retirée répond `404`. L'ADR 0047 fait servir l'audience des catégories par `discovery`. L'[ADR 0050](0050-tags-d-une-categorie-poses-par-l-administration-et-lus-par-discovery.md) fait servir l'en-tête de la catégorie par `discovery`, sur `GET /v1/categories/{slug}`.

Plusieurs points ne sont couverts par aucun ADR :

- le contexte qui possède le suivi d'une catégorie, et son modèle ;
- ce que devient le suivi quand la catégorie est fusionnée ou retirée ;
- le compte des followers d'une catégorie ;
- ce qui est idempotent ;
- comment l'en-tête, servi par `discovery`, connaît le suivi, qui n'est pas dans `discovery`.

Problématique : où vit le suivi d'une catégorie, avec quel modèle, que devient-il quand la catégorie est fusionnée ou retirée, et comment l'en-tête servi par `discovery` le lit-il ?

## Facteurs de décision

- **Une seule autorité par entité** (ADR 0021) : le contexte qui sait si une catégorie est active valide le suivi.
- **Les modules ne se parlent que par events** (ADR 0002) : `discovery` n'appelle pas un cas d'usage de `channel`.
- **Projections convergentes** (ADR 0020 §3) : une projection du suivi converge quel que soit l'ordre des events.
- **Projections reconstructibles** (ADR 0041) : l'outbox de `channel` est l'historique dont une projection se reconstruit.
- **Cycle de vie de l'ADR 0045** : aucune action d'administration ne laisse un suivi sur une catégorie qui n'est plus `active`.
- **Un seul appel pour l'en-tête** : l'app lit l'en-tête de la catégorie par une route.
- **Capacité d'un développeur solo** : pas de nouveau contexte, pas de nouvelle infrastructure.

## Options envisagées

### Sur le propriétaire du suivi

**Option A — Le suivi dans `discovery`.** `discovery` connaît déjà les catégories par projection et sert l'en-tête. Mais il devient le propriétaire d'une donnée écrite par l'utilisateur, alors qu'il n'a que des projections. Il valide un suivi contre sa copie du catalogue, qui peut être en retard sur `channel`, et un suivi posé pendant une fusion échappe à la transaction de la fusion. **Écartée.**

**Option B — Le suivi dans `channel`, sur le modèle de l'ADR 0020.** `channel` possède le catalogue (ADR 0021) et le follow d'une chaîne (ADR 0020). Le suivi d'une catégorie prend le même modèle : une ligne par paire `(userId, categoryId)`, un état, une version monotone, des events par l'outbox. Sa transaction verrouille la ligne de la catégorie, et se sérialise avec la fusion et le retrait. **Retenue.**

**Option C — Une ligne supprimée au désabonnement, sans version ni event.** C'est le plus simple, mais l'ADR 0020 a écarté ce modèle (son option A) : une ligne supprimée emporte sa version, et aucune projection ne peut ordonner les events. **Écartée.**

### Sur la lecture par l'en-tête

**Option D — Une route de `channel`, composée par l'app.** `GET /v1/categories/{slug}/follow` servie par `channel`, lue juste après une écriture. L'app fait alors deux appels pour un en-tête. **Écartée** : l'en-tête est une seule route.

**Option E — `discovery` compose au niveau du contrôleur, en appelant `channel`.** Un appel synchrone d'un module à un autre, interdit par l'ADR 0002. **Écartée.**

**Option F — `discovery` projette le suivi à partir des events de `channel`.** `discovery` tient les paires et le compteur de chaque catégorie, et `GET /v1/categories/{slug}` les lit. C'est le schéma de la page « Suivis » de l'ADR 0020 (§4). L'en-tête a quelques secondes de retard sur une écriture. **Retenue.**

### Sur la fusion

**Option G — La fusion publie le seul `channel.category.merged`, et le consommateur transfère lui-même.** C'est le choix de l'ADR 0045 pour les chaînes. Pour le suivi, il casse la règle de version : le consommateur ne connaît pas la version que `channel` a donnée à la paire cible. Exemple : la paire cible est à `followed(v1)` dans `discovery`, `unfollowed(v2)` est en retard, et la fusion la passe à `following(v3)` dans `channel`. `discovery` transfère, garde `v1`, puis applique `unfollowed(v2)` en retard : l'utilisateur ne suit plus la cible, alors qu'il la suit dans `channel`. **Écartée.**

**Option H — Chaque paire qui change d'état publie son event, y compris pendant la fusion et le retrait.** Une seule règle pour le consommateur : la version. La fusion d'une catégorie suivie par N utilisateurs publie jusqu'à 2N events. **Retenue.**

## Décision

### 1. Le suivi d'une catégorie vit dans `channel`

La table `channel.ChannelCategoryFollow` tient une ligne par paire `(userId, categoryId)`, clé unique composite :

| Champ         | Sens                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `userId`      | Identifiant nu d'un `Account` (ADR 0003, règle 1), sans clé étrangère cross-schéma ; `/// @personal` |
| `categoryId`  | La catégorie suivie                                                                                  |
| `state`       | `following` ou `not_following`                                                                       |
| `followedAt`  | Début du suivi en cours ; `null` quand `state = not_following`                                       |
| `version`     | Entier monotone par paire, incrémenté à chaque transition                                            |
| `endedReason` | `unfollowed`, `category_merged` ou `category_retired`, renseigné quand le suivi s'arrête             |

La ligne n'est jamais supprimée, pour que la version reste monotone (ADR 0020 §1). Un nouveau suivi remet `followedAt` à l'instant présent.

### 2. Invariants et idempotence

- Seule une catégorie `active` se suit. Le slug d'une catégorie `merged` mène à sa cible (ADR 0045 §1) : `PUT` et `DELETE` sur ce slug agissent sur la cible. Le slug d'une catégorie `retired` ou inconnue répond `404`.
- **Idempotence** : suivre une catégorie déjà suivie, ou quitter une catégorie non suivie, réussit sans effet. Aucune transition, aucune version incrémentée, aucun event. La réponse est la même `204` que pour une transition.
- La transaction d'une transition verrouille la ligne de la catégorie en partage (`FOR SHARE`). Elle se sérialise ainsi avec la fusion et le retrait, qui la verrouillent en écriture (`FOR UPDATE`) : un suivi ne se pose jamais sur une catégorie fusionnée ou retirée entre la lecture du slug et l'écriture. Deux suivis d'une même catégorie ne s'attendent pas.
- Aucune limite de débit propre au suivi d'une catégorie. Le follow-bot de l'ADR 0020 (§2) gonfle une chaîne pour polluer la recommandation ; le suivi d'une catégorie ne profite à aucune chaîne.

### 3. Events

```
channel.category.followed    { userId, categoryId, followedAt, version }
channel.category.unfollowed  { userId, categoryId, reason, version }
```

- **Toute transition d'une paire publie son event**, dans la transaction qui l'écrit, par l'outbox de `channel` (ADR 0002, règle 2). Cela vaut pour un suivi, un désabonnement, une fusion et un retrait.
- `reason` vaut `unfollowed`, `category_merged` ou `category_retired`. C'est un enum ouvert (ADR 0024).
- La règle de convergence de l'ADR 0020 (§3) s'applique à tout consommateur : il ignore un event dont la version est inférieure ou égale à celle qu'il connaît pour la paire. Il n'a pas besoin de `channel.category.merged` ni de `channel.category.retired` pour tenir les suivis.

### 4. Fusion : le suivi passe sur la cible, sans doublon

La transaction de `merge(source, target)` (ADR 0045 §2) transfère aussi les suivis :

1. chaque utilisateur qui suit la source suit la cible. S'il suivait déjà la cible, sa ligne cible ne change pas : ni version, ni `followedAt`, ni event. Sinon, sa ligne cible passe à `following`, avec la version suivante et le `followedAt` de son suivi de la source, et publie `channel.category.followed` ;
2. chaque ligne suivie de la source passe à `not_following`, avec `endedReason = category_merged` et la version suivante, et publie `channel.category.unfollowed` avec `reason = category_merged`.

Le transfert est fait de requêtes ensemblistes : la mise à jour des lignes et l'écriture de leurs events dans l'outbox se font sans boucle applicative.

### 5. Retrait : les suivis sont clos

La transaction du retrait (ADR 0045 §3) clôt les suivis de la catégorie : `not_following`, `endedReason = category_retired`, version suivante, et un `channel.category.unfollowed` avec `reason = category_retired` par suivi. Des followers n'empêchent pas le retrait : seule une chaîne l'empêche (ADR 0045 §3).

### 6. `discovery` projette le suivi et sert l'en-tête

`discovery` consomme `channel.category.followed` et `channel.category.unfollowed` :

- `DiscoveryCategoryFollow { userId, categoryId, following, version }` garde la dernière version appliquée par paire ;
- `DiscoveryCategoryFollowerCount { categoryId, followerCount }` change dans la même transaction, seulement quand l'état de la paire change.

`GET /v1/categories/{slug}` ([ADR 0050](0050-tags-d-une-categorie-poses-par-l-administration-et-lus-par-discovery.md)) ajoute à l'en-tête `followerCount` et, si un jeton est présent, `isFollowing`. Le jeton est optionnel : sans jeton, `isFollowing` est absent. Le slug d'une catégorie fusionnée rend l'en-tête de la cible.

Ces deux tables se reconstruisent par `discovery:rebuild`, depuis l'outbox de `channel` (ADR 0041).

**Amendement des consommations de l'ADR 0003** : `discovery` consomme `channel.category.followed` et `channel.category.unfollowed`.

### 7. Contrat HTTP de l'écriture

`PUT /v1/me/followed-categories/{slug}` suit la catégorie, `DELETE` la quitte. Un jeton d'accès est requis. Les deux répondent `204`, et `404` pour un slug inconnu ou retiré. L'app affiche l'état voulu dès la réponse, sans relire l'en-tête, qui a quelques secondes de retard.

### 8. Vie privée

Le nombre de followers d'une catégorie est public. La liste des followers d'une catégorie n'est exposée par aucune route. Les catégories suivies par un utilisateur ne sont lisibles que par lui. `userId` est marqué `/// @personal` (ADR 0008) dans les tables de `channel` et de `discovery`.

### 9. Suppression de compte

Quand `identity.account.deleted` existera, `channel` clôt les suivis de catégories du compte comme ses follows de chaînes (ADR 0020 §6) : un `channel.category.unfollowed` par suivi, puis l'anonymisation de l'ADR 0008. Cet event n'existe pas encore ; la règle s'appliquera avec lui.

## Conséquences

### Positives

- Un seul contexte valide la catégorie et pose le suivi, dans la même transaction que la fusion et le retrait.
- L'en-tête de la catégorie tient en un appel, sans lecture synchrone entre modules.
- Un consommateur n'a qu'une règle, la version par paire, même à travers une fusion.
- Une fusion ne fait perdre son suivi à personne, et ne crée aucun doublon.
- La projection se reconstruit depuis l'outbox, sans export.

### Négatives

- Une ligne subsiste par paire ayant un jour existé, dans `channel` comme dans `discovery`.
- La fusion d'une catégorie suivie par N utilisateurs publie jusqu'à 2N events, et son retrait N.
- `followerCount` et `isFollowing` ont quelques secondes de retard sur une écriture.
- Deux projections de plus dans `discovery`, et leur handler à tester.

### Risques et mitigations

- **Fusion d'une catégorie très suivie.** La transaction et la file d'events grossissent avec le nombre de followers de la source. Mitigation : les requêtes sont ensemblistes, et la fusion est un geste d'administration rare. À mesurer au seed de charge, comme la réaffectation des chaînes (ADR 0045).
- **Un consommateur oublie la règle de version.** Mitigation : le test de convergence de l'ADR 0020 (six ordres de `followed(v1)`, `unfollowed(v2)`, `followed(v3)`) s'exécute contre le handler de `discovery`.
- **L'app relit l'en-tête juste après un `PUT`** et voit l'ancien état. Mitigation : l'app garde l'état voulu après la réponse `204` (§7).

## Notes d'implémentation

1. `channel` : migration (enums, table `ChannelCategoryFollow`, unique `(userId, categoryId)`, index `(categoryId, state)`), contrats des deux events, cas d'usage `followCategory` et `unfollowCategory`, `PUT` et `DELETE /v1/me/followed-categories/{slug}`.
2. `channel` : transfert dans `merge`, clôture dans `retire`, events par paire.
3. `discovery` : projection des paires et du compteur, handler, reconstruction.
4. `discovery` : `followerCount` et `isFollowing` dans `GET /v1/categories/{slug}`, une fois la route de l'[ADR 0050](0050-tags-d-une-categorie-poses-par-l-administration-et-lus-par-discovery.md) en place.

## Liens

- ADR 0020 : modèle du follow, dont celui-ci reprend la ligne par paire, la version et la règle de convergence.
- ADR 0021 : place le catalogue des catégories dans `channel`.
- ADR 0045 : fusion et retrait d'une catégorie, que le suivi accompagne.
- ADR 0041 : l'outbox de `channel`, historique d'où la projection se reconstruit.
- ADR 0047 : audience des catégories servie par `discovery`.
- [ADR 0050](0050-tags-d-une-categorie-poses-par-l-administration-et-lus-par-discovery.md) : en-tête de la catégorie servi par `discovery`, qui reçoit `followerCount` et `isFollowing`.
- ADR 0002 : les modules ne se parlent que par events.
