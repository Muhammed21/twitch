# 0003 — Découpage en bounded contexts

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0002 acte un monolithe modulaire dont les modules correspondent à des bounded contexts. Reste à dire lesquels, et à le dire avant d'écrire du code — sinon le découpage sera une rationalisation a posteriori de l'arborescence qui aura émergé toute seule.

Le piège concret du domaine : le mot « utilisateur ». Selon le contexte, il désigne un compte authentifiable, un propriétaire de canal, un viewer anonyme connecté à un chat, un abonné payant, un modérateur, ou un destinataire de notification. Traiter tout cela comme une seule entité `User` produit une classe de 40 champs dont chaque module n'utilise que trois — et un couplage total.

Même problème pour « stream » : un canal permanent (l'adresse `twitch.tv/x`, qui existe même hors ligne) et une session de diffusion (qui commence et finit) sont deux choses différentes. Les confondre est l'erreur de modélisation la plus coûteuse à corriger ensuite, parce qu'elle contamine le schéma de données.

Problématique : découper le domaine en contextes autonomes, avec un langage propre à chacun, des relations explicites, et une règle claire de référencement croisé.

## Facteurs de décision

- **Cohésion du langage** : dans un contexte, un terme a un sens et un seul.
- **Autonomie transactionnelle** : un contexte doit pouvoir décider sans consulter un autre en synchrone.
- **Profil de changement** : ce qui change ensemble vit ensemble.
- **Praticité pour un solo** : trop de contextes tue la vélocité ; trop peu tue la modularité.
- **Alignement sur la tranche verticale n°1** : le découpage doit permettre de livrer d'abord, pas de tout modéliser d'abord.

## Options envisagées

### Option A — 3 gros contextes (`users`, `streaming`, `money`)

- **Avantages** : très peu de cérémonie, rapide à démarrer.
- **Inconvénients** : `streaming` regrouperait canal, session, chat et modération — quatre langages et quatre profils de scaling dans un même module. Le chat, qui doit être extrait (ADR 0004), n'aurait pas de frontière propre. Reproduit le problème que l'ADR 0002 cherche à éviter.

### Option B — 8 contextes alignés sur les capacités métier

- **Avantages** : chaque contexte a un langage cohérent et un propriétaire de données clair ; les frontières correspondent aux points d'extension prévisibles ; le chat est nativement isolable.
- **Inconvénients** : 8 modules à maintenir seul ; certains resteront quasi vides longtemps ; plus de contrats d'events à écrire.

### Option C — 12+ contextes très fins (clips, VOD, raids, recommandation, paiements, payouts, badges… séparés)

- **Avantages** : granularité maximale, très fidèle à la réalité d'une plateforme mûre.
- **Inconvénients** : beaucoup de contextes seraient vides pendant des mois ; l'overhead de contrats dépasserait largement le code métier. C'est du design pour un produit qui n'existe pas encore.

## Décision

**Nous retenons 8 bounded contexts.** Chacun possède exclusivement ses données : aucune table n'est écrite par deux contextes.

### Règles de référencement inter-contextes

1. **Référence par identifiant uniquement.** Un contexte stocke un `UserId`, jamais un objet `User` d'un autre contexte. Aucune clé étrangère SQL ne traverse une frontière de contexte — la cohérence référentielle inter-contextes est applicative, pas déclarative.
2. **Pas de lecture synchrone chez le voisin.** Si `discovery` a besoin du nom d'affichage d'un streamer, il en maintient une copie locale, alimentée par les events de `identity`. Cette duplication est volontaire : elle achète l'autonomie.
3. **Cohérence éventuelle assumée** entre contextes ; cohérence forte **dans** un agrégat.
4. **Chaque contexte a son propre modèle du même concept.** `identity` connaît un `Account`, `channel` un `Owner`, `chat` un `Chatter`, `monetization` un `Subscriber`. Ils partagent un identifiant, pas une classe.

### Context map

```
identity ──(customer/supplier)──▶ channel ──(partnership)──▶ stream
    │                                 │                        │
    │                                 ▼                        ▼
    └──────────────────────────▶ moderation ◀────────────── chat
                                      │                        ▲
                                      └──(anti-corruption)─────┘
stream ──▶ discovery        monetization ──(ACL sur Stripe/RevenueCat)──▶ externe
stream, channel, monetization ──▶ notification  (downstream pur, ne publie rien)
```

- `identity → channel`, `identity → *` : **customer/supplier**. `identity` est upstream, publie un contrat stable, et ne connaît aucun consommateur.
- `channel ↔ stream` : **partnership**. Les deux évoluent ensemble ; ils restent séparés parce que leur cycle de vie diffère (un canal est permanent, une session est éphémère).
- `chat → moderation` : **anti-corruption layer**. `chat` ne consulte jamais les règles de `moderation` ; il consomme des events de sanction et maintient sa propre vue locale « qui est muet ici, maintenant », en mémoire/Redis. Aucun appel synchrone n'est acceptable dans le chemin d'un message.
- `monetization → Stripe / RevenueCat` : **ACL obligatoire**. Aucun type vendor ne franchit `infrastructure/`. Le domaine connaît un `Subscription`, jamais un `stripe.Subscription`.
- `notification` : **downstream pur**. Il consomme et ne publie rien que quiconque consomme.

---

### 1. `identity`

- **Responsabilité** : comptes, authentification, sessions, profil canonique (pseudo, avatar, email). **Aucun rôle ni permission** : les attributions vivent dans le noyau partagé `authz` (ADR 0006).
- **Agrégats** : `Account` (racine), `Session`.
- **Publie** : `identity.account.registered`, `identity.account.deleted`, `identity.display_name.changed`, `identity.account.suspended`.
- **Consomme** : rien. C'est volontaire : `identity` est le contexte le plus upstream, il ne doit dépendre de personne.
- **Hors périmètre** : la notion de canal (c'est `channel`), les préférences de notification (`notification`), les droits de modération par canal (`moderation`), le statut d'abonné payant (`monetization`). `identity` répond à « qui es-tu », jamais à « qu'as-tu le droit de faire ici ».
- **Implémentation** : better-auth est un adapter de ce contexte, pas sa définition.

### 2. `channel`

- **Responsabilité** : le canal permanent — slug, titre, catégorie, bannière, followers, paramètres de diffusion. Existe hors ligne.
- **Agrégats** : `Channel` (racine), `Follow`.
- **Publie** : `channel.created`, `channel.metadata.updated`, `channel.followed`, `channel.unfollowed`.
- **Consomme** : `identity.account.registered` (crée le canal), `identity.account.deleted` (archive), `stream.started` / `stream.ended` (met à jour le drapeau dénormalisé `isLive`).
- **Hors périmètre** : la session de diffusion elle-même (`stream`), l'abonnement payant (`monetization`), les messages (`chat`). Un follow est gratuit et vit ici ; un abonnement est payant et vit dans `monetization`. Ce sont deux notions distinctes qui se ressemblent — les confondre serait une faute.

### 3. `stream`

- **Responsabilité** : le cycle de vie d'une session de diffusion, l'intégration provider (ADR 0001), les clés de stream, les URLs de playback signées, le compteur de viewers persisté.
- **Agrégats** : `StreamSession` (racine), `StreamKey`.
- **Publie** : `stream.started`, `stream.ended`, `stream.viewer_count.sampled`.
- **Consomme** : `channel.created` (provisionne le canal provider), `identity.account.suspended` (coupe la diffusion).
- **Hors périmètre** : le transcodage et la distribution (délégués, ADR 0001), le chat, le compteur temps réel (`chat`/Redis — ici on ne persiste que des échantillons pour l'historique), la mise en avant (`discovery`).

### 4. `chat`

- **Responsabilité** : salons, messages, présence, débit, rate limiting, modes de salon (slow mode, followers-only, subscribers-only).
- **Agrégats** : `ChatRoom` (racine), `ChatMessage`.
- **Publie** : `chat.message.posted` (échantillonné, pas systématique), `chat.room.mode.changed`, `chat.viewer.joined`, `chat.viewer.left`.
- **Consomme** : `stream.started` / `stream.ended` (ouvre et ferme le salon), `moderation.user.banned` / `moderation.user.timed_out` (applique la sanction immédiatement), `monetization.subscription.activated` (badges et mode subscribers-only), `channel.followed` (mode followers-only).
- **Hors périmètre** : **décider** d'une sanction — `chat` applique, `moderation` décide. Aussi hors périmètre : la persistance longue de l'historique complet (coût disproportionné pour la valeur), et l'authentification (déléguée à `identity` à la poignée de main).
- **Particularité** : seul contexte déployé séparément (ADR 0004).

### 5. `moderation`

- **Responsabilité** : décider et faire respecter les sanctions — bans, timeouts, listes de mots interdits, signalements, rôles de modérateur par canal, journal d'audit.
- **Agrégats** : `ModerationPolicy` (par canal), `Sanction`, `Report`.
- **Publie** : `moderation.user.banned`, `moderation.user.unbanned`, `moderation.user.timed_out`, `moderation.moderator.appointed`, `moderation.report.filed`.
- **Consomme** : `chat.message.posted` (filtrage automatique), `identity.account.suspended` (sanction globale).
- **Hors périmètre** : l'application technique de la sanction (c'est `chat` qui coupe la socket), la suspension de compte globale (`identity`), le contenu vidéo (pas de modération vidéo au programme).
- **Point de vigilance** : les **invariants** d'une sanction (durée, motif, appel, qui peut bannir qui) vivent ici, et nulle part ailleurs. En revanche, l'**attribution** résultante est écrite dans le noyau partagé `authz`, où tous les contextes la lisent (ADR 0006). Distinction essentielle : `moderation` décide et porte les règles ; `authz` stocke et évalue. Remonter la décision dans `identity` reste interdit.

### 6. `discovery`

- **Responsabilité** : home, listings de lives, catégories, tags, recherche, recommandations. Contexte de **lecture** quasi exclusive.
- **Agrégats** : aucun au sens strict — des modèles de lecture (`LiveChannelView`, `CategoryView`). C'est délibéré : `discovery` ne décide de rien, il présente.
- **Publie** : rien de métier.
- **Consomme** : `stream.started`, `stream.ended`, `stream.viewer_count.sampled`, `channel.metadata.updated`, `identity.display_name.changed`.
- **Hors périmètre** : posséder la moindre donnée de référence. Toutes ses données sont des projections ; en cas de doute, la source de vérité est ailleurs, et il doit pouvoir être reconstruit intégralement par rejeu.

### 7. `monetization`

- **Responsabilité** : abonnements payants aux canaux, achats in-app iOS, entitlements, revenus des streamers, payouts.
- **Agrégats** : `Subscription`, `Entitlement`, `PayoutAccount`, `LedgerEntry`.
- **Publie** : `monetization.subscription.activated`, `monetization.subscription.expired`, `monetization.payout.completed`.
- **Consomme** : `identity.account.deleted`, `channel.created`.
- **Adapters externes** : RevenueCat (webhooks d'achat iOS), Stripe Connect (payouts). Les deux derrière un ACL strict.
- **Hors périmètre** : les follows gratuits (`channel`), les badges affichés dans le chat (`chat` les dérive d'un event d'entitlement), la facturation fiscale détaillée (hors scope produit).
- **Point de vigilance** : c'est le seul contexte où une erreur coûte de l'argent réel. Outbox obligatoire sur tous ses events (ADR 0002), et journal en append-only.

### 8. `notification`

- **Responsabilité** : notifications push APNs, préférences par utilisateur, déduplication, fenêtres d'envoi.
- **Agrégats** : `NotificationPreference`, `DeviceToken`.
- **Publie** : rien.
- **Consomme** : `stream.started` (« X est en live »), `channel.followed`, `monetization.subscription.expired`, `moderation.user.banned`.
- **Hors périmètre** : le temps réel in-app (c'est `chat` et le canal SSE, ADR 0004), l'email transactionnel d'authentification (appartient à `identity` via better-auth), le contenu éditorial des campagnes marketing.

---

### Périmètre de la tranche verticale n°1

Objectif : un streamer lance un live, un viewer le regarde et chatte.

| Contexte | Tranche 1 | Contenu minimal |
|---|---|---|
| `identity` | **Oui** | Inscription, connexion, session. Via better-auth. |
| `channel` | **Oui** | Création automatique à l'inscription, slug, titre. Pas de follow. |
| `stream` | **Oui** | Clé de stream, webhooks `started`/`ended`, URL de playback signée. |
| `chat` | **Oui** | Salon par session, envoi/réception, rate limit basique. |
| `moderation` | Minimal | Un seul use-case : le propriétaire du canal peut timeout un utilisateur. Suffit à valider le couple `chat ↔ moderation` et l'ACL qui va avec. |
| `discovery` | Minimal | Une liste des lives en cours. Pas de recherche, pas de catégories, pas de reco. |
| `monetization` | **Non** | Aucun code. Le module n'existe pas encore. |
| `notification` | **Non** | Aucun code. |

Le choix d'inclure un fragment de `moderation` est délibéré : il force la relation inter-contextes la plus risquée (décision asynchrone, application immédiate) à être exercée dès la première tranche, plutôt que découverte plus tard. Les deux contextes exclus le sont franchement : pas de dossier vide, pas de stub. Ils seront créés quand ils auront un use-case.

## Conséquences

### Positives

- Le langage est désambiguïsé : `Channel` (permanent) et `StreamSession` (éphémère) ne seront jamais confondus dans le schéma.
- Chaque contexte a un propriétaire de données unique, ce qui rend l'extraction (ADR 0002, étape 3) mécanique plutôt qu'archéologique.
- `chat` est naturellement isolable, ce qui rend l'ADR 0004 possible sans contorsion.
- `discovery` étant purement dérivé, ses performances peuvent être optimisées librement sans risque métier.
- Le périmètre de la tranche 1 est petit et vertical : il traverse toute la stack sans tout construire.

### Négatives

- Duplication délibérée de données (le nom d'affichage existe dans `identity`, `channel`, `discovery`, `chat`). C'est le prix de l'autonomie, mais c'est un vrai coût de maintenance.
- Plus de code total qu'un modèle relationnel unique et normalisé.
- Les jointures inter-contextes deviennent des projections à maintenir, ce qui déplace la complexité du SQL vers les handlers d'events.
- Un changement transverse (renommer un concept dans l'ubiquitous language) touche plusieurs modules.

### Risques et mitigations

- **Risque : contexte anémique.** `channel` et `stream` pourraient dériver en simples CRUD sans règles, auquel cas l'hexagone ne paie pas son coût. Incertitude réelle : je ne saurai qu'à l'usage. Mitigation : réévaluer après la tranche 2 ; si `channel` n'a toujours aucune règle non triviale, envisager de le fusionner dans `stream` plutôt que de maintenir une cérémonie gratuite.
- **Risque : projections désynchronisées.** Un handler `discovery` qui échoue laisse la home affichant un live terminé. Mitigation : `discovery` doit être reconstructible intégralement par rejeu depuis la source de vérité, et cette commande de rebuild doit exister dès la tranche 1 — pas « plus tard ». Plus un TTL défensif sur les entrées de live.
- **Risque : `moderation` contourné par urgence.** Sous pression, la tentation d'appeler `moderation` en synchrone depuis `chat` pour vérifier un ban sera forte, et elle détruirait l'ACL. Mitigation : la vue locale des sanctions dans `chat` doit être rapide et correcte dès le départ (Redis, mise à jour par event), pour qu'il n'y ait jamais de raison de contourner.
- **Risque : `identity` devient un god context.** Les rôles, permissions et préférences y convergent naturellement. Mitigation : règle explicite — `identity` répond à « qui es-tu », jamais à « qu'as-tu le droit de faire ». Toute autorisation contextuelle appartient au contexte concerné.
- **Risque : découpage prématuré.** Ces 8 contextes sont des hypothèses formulées avant d'avoir écrit une ligne. Certaines seront fausses. Mitigation : c'est l'argument central de l'ADR 0002 — dans un monolithe modulaire, corriger une frontière est un refactoring, pas une migration.

## Notes d'implémentation

- Arborescence : `apps/api/src/modules/{identity,channel,stream,moderation,discovery}` pour la tranche 1. `chat` vit dans `apps/chat` (ADR 0004). `monetization` et `notification` ne sont pas créés.
- Isolation physique des tables : **voir l'ADR 0008, qui fait autorité sur ce point**. Décision retenue : un schéma PostgreSQL par contexte via `multiSchema` de Prisma, avec repli documenté sur un schéma unique à tables préfixées par contexte (`identity_accounts`, `channel_channels`, `stream_sessions`…) si le statut *preview* de `multiSchema` se révèle bloquant.
- Aucune clé étrangère SQL ne traverse une frontière de contexte, y compris quand Prisma le permettrait et que ce serait pratique. C'est ce qui rendra la séparation de base possible.
- **`authz` est un noyau partagé, pas un neuvième contexte** (ADR 0006). Il n'a ni langage métier propre ni décision à prendre : il stocke les attributions et évalue les politiques. L'écriture appartient aux contextes métier (`channel` pour les nominations, `moderation` pour les sanctions), la lecture est ouverte à tous. C'est la seule exception assumée à la règle « aucun module partagé entre contextes » ; toute autre demande d'exception doit être refusée.
- Les contrats d'events vivent dans `packages/contracts/src/events/<context>/`, versionnés, avec un schéma Zod pour les événements franchissant un process.
- Glossaire de l'ubiquitous language tenu dans `docs/glossaire.md`, avec la définition de chaque terme **par contexte** — un terme peut y apparaître plusieurs fois avec des sens différents, et c'est normal.
