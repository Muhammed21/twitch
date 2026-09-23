# 0013 — Modèle d'entitlement multi-tenant : abonnement scopé par chaîne

- Statut : Proposé — bloqué par un spike technique
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le produit a besoin d'exprimer un droit de la forme :

> « l'utilisateur 42 est abonné **Tier 2** à la **chaîne 123** jusqu'au 14/10/2026 »

C'est un droit **multi-tenant** : il est scopé par chaîne, un même utilisateur pouvant détenir N abonnements actifs simultanément sur N chaînes différentes, à des tiers différents et avec des dates d'expiration différentes.

RevenueCat — le SDK d'achat retenu côté iOS — modélise au contraire un entitlement **global par utilisateur** :

```swift
customerInfo.entitlements["pro"]?.isActive // Bool, sans notion de chaîne
```

Ce n'est pas un détail de mapping cosmétique : c'est la question qui décide si RevenueCat est utilisable du tout pour les abonnements de chaîne. Si le `channelId` ne peut pas être transporté de façon fiable à travers l'achat StoreKit puis restitué côté serveur, le modèle d'abonnement du produit s'effondre.

Une réponse naïve serait de créer un produit App Store par chaîne (`channel_123_tier2`). Elle est écartée d'emblée : cela signifierait des milliers de produits à déclarer, chacun soumis à la revue Apple, avec une latence de création incompatible avec l'onboarding d'un streamer. Ingérable, a fortiori pour un développeur solo.

On part donc sur ~3 produits génériques — `channel_sub_tier1`, `channel_sub_tier2`, `channel_sub_tier3` — et **toute la difficulté est de faire voyager le `channelId` avec la transaction**.

## Facteurs de décision

- **Fiabilité de la corrélation achat → chaîne** : une corrélation erronée crée un abonnement sur la mauvaise chaîne, donc un remboursement, un payout faux et une perte de confiance. C'est le critère dominant.
- **Nombre de produits App Store** : doit rester constant, indépendant du nombre de chaînes.
- **Résistance à la concurrence et aux rejeux** : double achat rapproché, retry réseau, webhook rejoué, restauration d'achats.
- **Capacité à modéliser des abonnements sans transaction Apple** : offerts, cadeaux, promotionnels, « Prime ».
- **Coût de maintenance pour un développeur solo** : préférer une intégration managée (RevenueCat) tant qu'elle n'impose pas de compromis sur la fiabilité.
- **Indépendance du domaine vis-à-vis du fournisseur** (cf. ADR 0014).

## Options envisagées

### Option A — Un produit App Store par chaîne

- **Avantages** : le `channelId` est porté par le `productId`, corrélation triviale et infalsifiable.
- **Inconvénients** : rédhibitoires. Milliers de produits, revue Apple par produit, délai de mise à disposition, quotas App Store Connect, automatisation fragile. Élimine aussi tout onboarding self-service d'un streamer.

### Option B — Produits génériques + `appAccountToken` (StoreKit 2)

Le client crée côté serveur une **intent d'achat** et attache l'UUID retourné à la transaction via `Product.PurchaseOption.appAccountToken(UUID)`. L'UUID ressort dans les notifications serveur Apple (`appAccountToken` du `JWSTransaction`) et, en principe, dans le webhook RevenueCat.

- **Avantages** : nombre de produits constant ; corrélation explicite, portée par la transaction elle-même ; le serveur reste seul décideur ; résiste aux rejeux et à la concurrence puisque l'UUID est unique par intent.
- **Inconvénients** : dépend de la capacité du SDK RevenueCat à propager cette purchase option **et** à la restituer dans le webhook. C'est exactement l'incertitude qui bloque cet ADR.

### Option C — Produits génériques + corrélation par intent ouverte la plus récente

Le serveur retient la dernière intent non consommée de l'utilisateur et lui rattache l'achat entrant.

- **Avantages** : aucune dépendance à une fonctionnalité StoreKit avancée ; fonctionne avec n'importe quel fournisseur.
- **Inconvénients** : **fragile par construction**. Deux achats rapprochés sur deux chaînes différentes peuvent être inversés ; un retry client peut consommer la mauvaise intent ; un webhook en retard peut arriver après qu'une nouvelle intent a été ouverte. Le mode de défaillance est silencieux et se manifeste en production sur un abonnement payé.

### Option D — App Store Server API en direct, sans RevenueCat, pour les abonnements de chaîne

Le backend consomme les App Store Server Notifications V2 et interroge l'App Store Server API, avec sa propre gestion des JWS et du renouvellement.

- **Avantages** : accès non filtré à `appAccountToken`, aucune couche d'interprétation tierce, contrôle total.
- **Inconvénients** : charge de développement et de maintenance nettement supérieure (vérification de la chaîne de certificats, signature JWS, modélisation du cycle de vie des abonnements, sandbox), soit précisément ce que RevenueCat évitait. Perte des Paywalls remote config (cf. ADR 0016) pour ce périmètre.

## Décision

**Option B retenue, sous réserve d'un spike bloquant.** Cet ADR reste au statut *Proposé* tant que le spike n'a pas rendu son verdict.

### Flux d'achat cible

```
1. Client  → API   : POST /v1/subscriptions/intents { channelId, tier }
2. API             : crée une PurchaseIntent (userId, channelId, tier, uuid, expiresAt = now + 15 min)
                     retourne { intentId: uuid }
3. Client  → Apple : purchase(product, options: [.appAccountToken(uuid)])
4. Apple   → RC    → API (webhook) : résolution de l'intent par uuid
                     → création de l'Entitlement scopé (userId, channelId, tier, expiresAt)
                     → intent marquée CONSUMED
```

L'intent a un **TTL de 15 minutes** et est **à usage unique**. Une intent expirée ou déjà consommée qui reçoit un achat déclenche une alerte et bascule sur la file de réconciliation manuelle : on ne devine jamais.

### Modèle de données des entitlements

L'entitlement est la seule vérité des droits (cf. ADR 0014). Il est **scopé**, jamais global :

```
Entitlement
  userId        UserId
  channelId     ChannelId
  tier          SubscriptionTier   (TIER_1 | TIER_2 | TIER_3)
  status        ACTIVE | GRACE | EXPIRED | REVOKED
  startsAt      DateTime
  expiresAt     DateTime | null    (null = droit non expirant, ex. don manuel permanent)
  source        APPLE_IAP | STRIPE | GIFT | PRIME | PROMO | MANUAL
  sourceRef     String | null      (transactionId Apple, subscription Stripe, giftId…)
  createdAt / updatedAt

  contrainte d'unicité : (userId, channelId) pour un entitlement en statut ACTIVE | GRACE
```

Invariants du domaine :

- Un seul entitlement actif par couple `(userId, channelId)`. Un changement de tier **remplace** le tier sur l'entitlement existant (événement `PRODUCT_CHANGE`, cf. ADR 0014), il n'en crée pas un second.
- `expiresAt` est la seule référence de fin d'accès. Une annulation ne coupe pas l'accès : elle empêche le renouvellement.
- Les transitions de statut sont des événements de domaine, jamais des `UPDATE` opportunistes : l'historique doit rester reconstituable.

### Abonnements offerts et cadeaux

Un abonnement cadeau est un entitlement de `source = GIFT` posé sur `(destinataireUserId, channelId)`, avec un `sourceRef` pointant la transaction de l'acheteur. Conséquences assumées :

- l'acheteur n'obtient **aucun** droit sur la chaîne du fait de son achat ;
- le cadeau ne se renouvelle pas — c'est un achat ponctuel, donc un **consommable**, traité selon l'ADR 0015, pas un abonnement au sens StoreKit ;
- si le destinataire possède déjà un entitlement actif, le cadeau **prolonge** `expiresAt` au lieu d'en créer un second (respect de l'invariant d'unicité) ;
- un cadeau reçu alors que l'abonnement payant de l'utilisateur expire donne priorité à la date la plus lointaine.

### Abonnements « Prime » et promotionnels

Entitlements de `source = PRIME` ou `PROMO`, créés par l'API sans aucune transaction Apple. Ils partagent la même table et les mêmes règles de lecture : **le reste du système ne sait pas d'où vient un droit**, il lit l'entitlement. C'est ce qui rend le modèle extensible sans toucher aux règles d'accès (chat sub-only, emotes, VOD, badge).

## Conséquences

### Positives

- Nombre de produits App Store constant (3), onboarding d'un streamer instantané.
- Le domaine `monetization` manipule un concept unique et scopé — l'`Entitlement` — quelle que soit l'origine du droit.
- Les droits offerts, Prime et promotionnels sont modélisés dès le départ et non greffés après coup.
- Le serveur est le seul à décider de la chaîne concernée : le client ne peut pas revendiquer un abonnement sur une chaîne qu'il n'a pas payée.
- L'intent à usage unique et à TTL court donne un point d'observation net : toute divergence est détectable et alertable.

### Négatives

- Un aller-retour réseau supplémentaire avant l'achat. En cas d'échec de la création d'intent, **on ne lance pas l'achat** — mieux vaut un achat empêché qu'un achat orphelin.
- Dépendance à une fonctionnalité relativement avancée de StoreKit 2, dont la propagation par RevenueCat n'est pas garantie à ce jour.
- Une intent expirée pendant un parcours d'achat très lent (paiement Apple en attente d'approbation parentale, Ask to Buy) produit un achat sans intent résoluble. À traiter explicitement (voir risques).
- Un second système d'identité (l'UUID d'intent) à observer et à purger.

### Risques et mitigations

**Risque n°1 — bloquant : RevenueCat ne restitue pas `appAccountToken`.**
C'est l'incertitude réelle de cet ADR, et la raison de son statut. Elle n'est pas levée par la documentation : elle doit l'être par un test.

*Protocole du spike :*

1. Créer un produit d'abonnement de test dans un `StoreKit Configuration File` local, puis répliquer en sandbox Apple.
2. Effectuer un achat via le SDK RevenueCat en passant explicitement l'`appAccountToken` (UUID connu, loggué côté client).
3. Capturer le payload du webhook RevenueCat reçu par un endpoint de test, **brut**, sans transformation.
4. Vérifier la présence de l'UUID dans le payload — champ dédié, `subscriber_attributes`, ou à défaut dans la transaction Apple récupérable via l'App Store Server API à partir du `transaction_id` transmis.
5. Répéter sur un **renouvellement** en sandbox (l'UUID doit rester corrélable au-delà de l'achat initial) et sur une **restauration d'achats**.
6. Répéter avec deux achats sur deux chaînes différentes lancés à moins de 5 secondes d'intervalle.

*Critères de succès :* l'UUID est présent et exact dans 100 % des cas aux étapes 4, 5 et 6, sans recours à une heuristique temporelle.

*Critères d'échec :* UUID absent, tronqué, réécrit, ou absent des événements de renouvellement. Une récupération indirecte obligatoire via l'App Store Server API compte comme un **succès partiel** : elle fonctionne, mais elle ajoute une dépendance directe à Apple qui affaiblit l'intérêt de RevenueCat sur ce périmètre.

*Décision selon l'issue :*

- **Succès** → cet ADR passe en `Accepté` sans modification.
- **Succès partiel** → cet ADR passe en `Accepté` avec ajout explicite d'un adapter App Store Server API en complément du webhook RevenueCat.
- **Échec** → **ne pas se rabattre sur l'option C en production.** L'option C (corrélation par intent la plus récente) est acceptable uniquement comme dépannage temporaire sur un volume faible, avec alerte systématique sur toute ambiguïté. Le vrai repli est l'**option D** : App Store Server API en direct pour les abonnements de chaîne, RevenueCat conservé pour les Paywalls et l'analytics. Cette bascule est rendue peu coûteuse par la structure en ports/adapters de l'ADR 0014 — c'est précisément sa justification.

**Risque n°2 — intent expirée à l'arrivée de l'achat (Ask to Buy, paiement différé).**
Mitigation : ne pas supprimer les intents expirées ; les conserver 90 jours en statut `EXPIRED` et permettre la résolution d'un achat tardif contre une intent expirée **si et seulement si** l'UUID correspond exactement. Le TTL de 15 minutes gouverne l'UX, pas la résolution.

**Risque n°3 — webhook perdu : achat débité sans entitlement créé.**
Mitigation : job de réconciliation périodique confrontant les intents `PENDING` anciennes aux transactions connues côté fournisseur, plus un endpoint client de re-synchronisation. Un utilisateur qui a payé et n'a pas son droit doit pouvoir se débloquer sans support.

**Risque n°4 — divergence d'invariant sur les cadeaux.**
La prolongation de `expiresAt` par un cadeau alors qu'un abonnement payant est actif peut produire un double comptage côté revenu streamer. Mitigation : la prolongation modifie l'entitlement, mais les **événements de revenu restent distincts et non fusionnés** (cf. ledger, ADR 0015).

## Notes d'implémentation

- Bounded context : `monetization`. `PurchaseIntent` est un agrégat propre au contexte, pas une entité exposée.
- Le port sollicité est `PurchaseVerificationPort` (cf. ADR 0014) ; l'intent est créée par un use case `CreatePurchaseIntent` du layer application.
- Le domaine ne connaît ni RevenueCat, ni Apple, ni Stripe : il connaît `source: EntitlementSource`.
- Schéma Zod strict sur le payload webhook en frontière : un payload non conforme est rejeté et archivé, jamais interprété partiellement.
- `expiresAt` en UTC, stocké en `timestamptz`. Toute comparaison de droit se fait côté serveur, jamais avec une horloge client.
- Index PostgreSQL : unique partiel sur `(userId, channelId) WHERE status IN ('ACTIVE','GRACE')`, et index sur `(channelId, status)` pour les vérifications du chat.
- Les tests suivent le TDD strict : le cœur du domaine (invariants d'unicité, prolongation par cadeau, transitions de statut) se teste sans aucune infrastructure.
- Tant que cet ADR est `Proposé`, **aucun code de production d'achat d'abonnement ne doit être écrit**. Le spike est jetable par construction.

## Liens

- ADR 0014 — RevenueCat comme adapter, backend comme source de vérité des droits
- ADR 0015 — Séparation abonnements / consommables et ledger de monnaie virtuelle
- ADR 0016 — Répartition des responsabilités PostHog / RevenueCat
- ADR 0003 — Découpage en bounded contexts (le contexte `monetization`, non créé en tranche 1)
- ADR 0006 — Autorisation scopée par chaîne (l'entitlement est lu par le moteur de politiques ; `subscriber` n'est pas un rôle)
- ADR 0009 — Contrat API (validation Zod des webhooks entrants, après vérification de signature)
- ADR 0017 — Modèle de reversement aux streamers
