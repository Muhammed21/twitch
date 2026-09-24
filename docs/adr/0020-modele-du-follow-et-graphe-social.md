# 0020 — Modèle du follow et graphe social

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0003 (consommations d'events de `chat`, `notification`, `discovery` ; agrégat `Follow` de `channel`)

## Contexte et problématique

L'ADR 0003 place l'agrégat `Follow` dans `channel` et déclare deux events, `channel.followed` et `channel.unfollowed`. C'est la bonne frontière — un follow est gratuit, permanent, et distinct d'un abonnement payant — mais le modèle s'arrête là. Une relecture a relevé six trous, dont deux produisent des bugs silencieux dès la mise en production du follow :

1. **`channel.unfollowed` n'a aucun consommateur.** `chat` et `notification` consomment `channel.followed` mais pas son inverse. Leurs projections ne font que croître : un ex-follower continue d'écrire en mode followers-only et continue de recevoir « X est en live ». Rien ne le signale ; le bug ne se voit que sur plainte.
2. **La page « Suivis » n'a pas de propriétaire.** C'est l'écran le plus consulté d'une plateforme de live après le player : la liste des chaînes suivies, celles en direct d'abord. `discovery` ne consomme aucun event de follow, et la règle « pas de lecture synchrone chez le voisin » (ADR 0003) lui interdit d'interroger `channel`.
3. **« Follower depuis N minutes » (ADR 0004, §6) n'est pas modélisable.** Rien ne dit que l'event porte la date du follow, ni ce qu'elle devient après un unfollow suivi d'un re-follow.
4. **La préférence de notification par chaîne n'a pas de place.** Sur une plateforme de live, on choisit chaîne par chaîne d'être notifié ou non (la « cloche »). Attribut du follow dans `channel`, ou préférence dans `notification` : ce n'est pas tranché, et chaque option a une conséquence sur le langage des deux contextes.
5. **Cycle de vie non défini.** Rien sur la suppression de compte côté follower ou côté chaîne, ni sur le compteur de followers.
6. **Aucun invariant.** Suivre sa propre chaîne, suivre deux fois, suivre 10 000 chaînes en une minute : rien n'est dit.

Il faut aussi un problème d'ordre. Un utilisateur qui clique follow / unfollow / follow en une seconde produit trois events. Un consommateur qui les reçoit dans le désordre (retry, rejeu) et applique « le dernier reçu » peut conclure qu'il ne suit pas la chaîne — et ne jamais se corriger.

Problématique : définir le follow comme un modèle complet — invariants, events, projections, cycle de vie — sans le transformer en neuvième contexte ni coupler `channel` au vocabulaire des notifications.

## Facteurs de décision

- **Justesse des projections** : chaque consommateur doit converger vers l'état réel, quel que soit l'ordre de réception des events.
- **Langage des contextes** (ADR 0003) : `channel` ne doit pas apprendre le mot « notification ».
- **Scaling asymétrique** : une chaîne peut avoir 500 000 followers ; un utilisateur en suit rarement plus de quelques centaines. Les écritures sont petites, les fan-out sont énormes.
- **Vie privée** : qui suit qui est une donnée personnelle (RGPD, ADR 0008 sur l'anonymisation).
- **Coût pour un solo** : pas de base graphe, pas de nouveau contexte, pas d'infrastructure nouvelle.

## Options envisagées

### Sur la persistance du follow

**Option A — Ligne supprimée à l'unfollow (`DELETE`).** Le plus simple. Mais la ligne emporte avec elle le numéro de version de la paire : un event tardif ne peut plus être comparé à rien, et le problème d'ordre ci-dessus n'a pas de solution locale. Écarté.

**Option B — Ligne conservée, avec un état et une version monotone par paire (follower, chaîne).** Une ligne par paire, jamais supprimée hors anonymisation. Chaque transition incrémente la version, que l'event transporte. Un consommateur n'applique un event que si sa version est supérieure à celle qu'il connaît. **Retenu.**

**Option C — Journal append-only des transitions (event sourcing du follow).** Fidèle, rejouable, mais un journal entier à maintenir pour un état à deux valeurs. Disproportionné. Écarté.

### Sur la préférence de notification par chaîne

**Option D — Attribut `notificationsEnabled` sur le `Follow`, dans `channel`.** Colle à l'UI (la cloche est à côté du bouton follow). Mais `channel` porte alors une notion de notification, et chaque changement de préférence devient un event de `channel` que seul `notification` consomme. C'est du langage emprunté. Écarté.

**Option E — Préférence par chaîne dans `notification`, créée activée à la réception de `channel.followed`.** `channel` ne connaît que le fait de suivre ; `notification` possède entièrement la question « faut-il te prévenir ». L'UI appelle deux ressources distinctes, ce qui se voit dans le contrat API (ADR 0009) mais pas pour l'utilisateur. **Retenu.**

### Sur le compteur de followers

**Option F — Colonne `followerCount` sur `Channel`, incrémentée dans la transaction du follow.** Juste à l'unité près, mais la ligne de la chaîne devient un point de contention : un raid ou un pic viral déclenche des milliers de follows simultanés, sérialisés sur un seul verrou de ligne. Écarté.

**Option G — Compteur dérivé, mis à jour de façon asynchrone et réconcilié périodiquement.** Légèrement en retard (quelques secondes), jamais contendu, réparable par un `COUNT`. **Retenu.**

## Décision

### 1. Agrégat `Follow` dans `channel`

Une ligne par paire `(followerId, channelId)`, clé unique composite :

| Champ | Sens |
|---|---|
| `followerId` | Identifiant nu d'un `Account` (ADR 0003, règle 1) — aucune FK cross-schéma |
| `channelId` | La chaîne suivie |
| `state` | `FOLLOWING` ou `NOT_FOLLOWING` |
| `followedAt` | Début du follow **en cours** ; `null` quand `state = NOT_FOLLOWING` |
| `version` | Entier monotone par paire, incrémenté à chaque transition |
| `endedReason` | `UNFOLLOWED`, `ACCOUNT_DELETED`, `CHANNEL_ARCHIVED`, `BLOCKED` — renseigné quand le follow s'arrête |

Un re-follow **remet `followedAt` à l'instant présent**. Suivre une chaîne, la quitter puis la suivre à nouveau ne permet pas de contourner « follower depuis N minutes » (ADR 0004) — c'est précisément la manœuvre d'un compte de raid.

### 2. Invariants

Portés par le domaine `channel`, testés au niveau du use-case :

- **Pas d'auto-follow** : `followerId` ne peut pas être le propriétaire de `channelId`.
- **Idempotence** : suivre une chaîne déjà suivie, ou quitter une chaîne non suivie, est un succès sans effet — **aucune transition, aucune version incrémentée, aucun event**. Le contrat HTTP est donc `PUT` / `DELETE` sur `/v1/channels/{id}/follow`, pas un `POST` qui bascule.
- **Chaîne suivable** : une chaîne archivée ou suspendue ne peut pas recevoir de nouveau follow. Les follows existants d'une chaîne suspendue sont conservés (la suspension est réversible) ; ceux d'une chaîne archivée sont clos.
- **Débit** : token bucket Redis par compte, de l'ordre de 30 transitions par minute avec une rafale de 10, en plus du rate limiting HTTP. C'est la contre-mesure au follow-bot, qui gonfle artificiellement une chaîne et pollue ensuite la recommandation. Aucune limite sur le nombre total de chaînes suivies.
- **Blocage** : quand un blocage entre utilisateurs est posé (ADR 0021), le follow de la personne bloquée vers la chaîne de celle qui bloque est clos avec `endedReason = BLOCKED`, et un nouveau follow est refusé tant que le blocage dure.

### 3. Events et garantie de livraison

```
channel.followed    { followerId, channelId, followedAt, version, occurredAt }
channel.unfollowed  { followerId, channelId, reason, version, occurredAt }
```

- Les deux events passent par l'**outbox** (ADR 0002, règle 2). L'ADR 0002 réserve l'outbox aux events qui coûtent de l'argent ou de la sécurité ; un follow perdu ne coûte ni l'un ni l'autre, mais il **désynchronise durablement trois projections sans aucun signal**. L'outbox est ajoutée à la liste des events concernés.
- **Règle de convergence, obligatoire pour tout consommateur** : un consommateur stocke la dernière `version` appliquée par paire et **ignore tout event de version inférieure ou égale**. L'ordre de réception n'a alors plus d'importance, et le rejeu complet est sûr.
- Le contrat Zod vit dans `packages/contracts/src/events/channel/` (ADR 0003, ADR 0009). La `version` y est obligatoire : un event sans version est rejeté à la validation, pas corrigé.

### 4. Consommateurs et projections

| Contexte | Projection | Consomme | Usage |
|---|---|---|---|
| `channel` (lui-même) | `followerCount` par chaîne | ses propres events | Compteur public, en retard de quelques secondes, réconcilié par un job quotidien (`COUNT` par chaîne) |
| `chat` | Ensemble Redis des followers par salon, avec `followedAt` | `followed`, `unfollowed` | Mode followers-only et « depuis N minutes » : `now - followedAt >= N`, sans I/O vers l'API (ADR 0004) |
| `notification` | Followers par chaîne + `ChannelNotificationPreference` | `followed`, `unfollowed`, `stream.started` | Fan-out « X est en live » |
| `discovery` | `FollowedChannelsView` par utilisateur | `followed`, `unfollowed`, `stream.started`, `stream.ended`, `channel.metadata.updated` | Page « Suivis », lives d'abord |

**Amendement de l'ADR 0003** : `discovery` consomme désormais `channel.followed` et `channel.unfollowed`, et `chat` comme `notification` consomment `channel.unfollowed`. La context map de 0003 est inchangée ; seules les listes de consommation s'allongent.

La page « Suivis » est une projection par utilisateur, et non une jointure entre les follows et les lives. Elle se lit en une requête indexée `(userId, isLive desc, lastLiveAt desc, channelId)`, avec une pagination par curseur à tri total (ADR 0008, §a).

### 5. Préférence de notification par chaîne

Elle appartient à `notification` (option E) :

- À la réception de `channel.followed`, `notification` crée une `ChannelNotificationPreference(userId, channelId, enabled = true)` si elle n'existe pas. Si elle existe déjà (re-follow), **elle est conservée** : quelqu'un qui avait coupé la cloche ne la voit pas se rallumer parce qu'il a re-suivi la chaîne.
- À la réception de `channel.unfollowed`, la préférence est conservée mais n'a plus d'effet, puisque le fan-out part des followers **actuels**.
- Le fan-out sur `stream.started` pagine la projection des followers par lots, via une file ; il ne charge jamais une liste entière en mémoire. La déduplication et les fenêtres d'envoi restent la responsabilité de `notification` (ADR 0003).

### 6. Cycle de vie

- **`identity.account.deleted` (côté follower)** : `channel` clôt tous les follows de ce compte avec `endedReason = ACCOUNT_DELETED` et émet un `channel.unfollowed` pour chacun, afin que les projections se vident par le chemin nominal. Les lignes sont ensuite anonymisées selon l'ADR 0008 : un pseudonyme stable remplace l'identifiant ; la ligne subsiste pour que la version reste monotone.
- **Archivage d'une chaîne** : nouvel event `channel.archived`. Les follows vers cette chaîne sont clos (`CHANNEL_ARCHIVED`), mais **sans un `unfollowed` par ligne** : pour une chaîne de 500 000 followers, ce serait un demi-million d'events pour un seul fait. Les consommateurs traitent `channel.archived` en purgeant la chaîne de leurs projections.
- **`identity.account.suspended`** : aucun effet sur les follows. La suspension est réversible, et la diffusion est déjà coupée par `stream` (ADR 0003).

### 7. Vie privée et visibilité

- **Le nombre de followers est public.**
- **La liste des followers d'une chaîne** n'est visible que par `owner` et `editor` de cette chaîne. La règle est évaluée dans le use-case, via `authz` (ADR 0006), jamais dans le contrôleur.
- **La liste des chaînes suivies par un utilisateur** n'est visible que par lui-même.
- Les champs `followerId` sont marqués `/// @personal` (ADR 0008) et entrent dans l'export RGPD.

### 8. Reconstruction des projections

Chaque projection de follow doit pouvoir être reconstruite sans passer par l'historique complet des events, puisque l'outbox est purgée (ADR 0002). `channel` expose une commande interne d'export de l'état courant des follows (`FOLLOWING` uniquement, avec `version` et `followedAt`), paginée, qu'un consommateur rejoue comme autant d'events `channel.followed`. C'est la même exigence que celle posée à `discovery` par l'ADR 0003, étendue à `chat` et à `notification`.

### 9. Analytics

`follow:added` et `follow:removed` sont émis **côté serveur** (ADR 0012 : les faits métier sont serveur), avec `channel_id` et `reason` pour le second. Un clic sur le bouton côté client est un événement d'interface distinct (`follow_button:tapped`), qui permet de mesurer l'écart entre intention et fait.

## Conséquences

### Positives

- Les trois projections convergent quel que soit l'ordre de livraison ; le rejeu est sûr par construction.
- `channel` garde un langage étroit (suivre, ne plus suivre), et `notification` possède toute la question de la notification.
- La page « Suivis » a un propriétaire et une requête indexée, au lieu d'une jointure interdite.
- Le contournement de « follower depuis N minutes » par unfollow/re-follow est fermé par le modèle, pas par une règle de chat.
- Le compteur ne crée aucune contention, même pendant un raid.

### Négatives

- Une ligne subsiste pour chaque paire ayant un jour existé : la table croît avec l'historique, pas avec l'état. Acceptable à notre échelle ; un archivage des lignes `NOT_FOLLOWING` anciennes reste possible sans casser la monotonie, tant qu'une version plancher est conservée par chaîne.
- Quatre projections du même fait (compteur, chat, notification, discovery), et donc quatre handlers à tester.
- Le compteur public est en retard de quelques secondes, ce qu'un streamer qui regarde son compteur pendant un raid remarquera.
- L'UI de la cloche appelle une ressource différente du bouton follow ; le client iOS doit composer les deux.

### Risques et mitigations

- **Risque : un consommateur oublie la règle de version.** Il fonctionne en test, où les events arrivent dans l'ordre, et diverge en production. Mitigation : un test de contrat partagé, exécuté contre chaque handler, qui livre `followed(v1)`, `unfollowed(v2)`, `followed(v3)` dans les six ordres possibles et exige le même état final.
- **Risque : fan-out de notification massif.** Une chaîne à 500 000 followers démarre un live. Mitigation : pagination par lots et file dédiée (§5) ; mesure du temps de fan-out dès qu'une chaîne dépasse 10 000 followers en seed de charge.
- **Risque : dérive du compteur.** Un handler en échec laisse le compteur faux. Mitigation : réconciliation quotidienne, et alerte si l'écart dépasse 1 % sur une chaîne.
- **Incertitude réelle : le seuil de débit (§2).** Trente transitions par minute est une estimation, pas une mesure. Mitigation : la valeur est un paramètre de configuration, et les refus sont comptés dans PostHog pour réviser le seuil sur données réelles.

## Notes d'implémentation

- Tranche : le follow arrive en **tranche 2** (l'ADR 0003 l'exclut explicitement de la tranche 1). Ordre : agrégat et invariants, puis events et outbox, puis projection `discovery` (page « Suivis »), puis `chat` (followers-only), puis `notification`.
- Tests à écrire en premier : auto-follow refusé ; follow idempotent sans event ; re-follow qui remet `followedAt` à zéro ; convergence dans les six ordres ; suppression de compte qui vide les quatre projections ; archivage de chaîne qui purge sans un event par follow.
- Index de `channel.Follow` : unique `(followerId, channelId)` ; `(channelId, state, followedAt desc, followerId)` pour la liste des followers d'une chaîne.
- Contrat API (ADR 0009) : `PUT` et `DELETE /v1/channels/{id}/follow`, `GET /v1/me/follows?cursor=` (servi par `discovery`), `GET /v1/channels/{id}/followers?cursor=` (servi par `channel`, restreint à `owner` et `editor`), `PUT /v1/me/notification-preferences/channels/{id}` (servi par `notification`).
