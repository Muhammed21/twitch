# 0013 — Modèle d'entitlement multi-tenant : abonnement scopé par chaîne

- Statut : Accepté
- Date : 2026-09-22 (spike tranché le 2026-09-23, décision révisée le 2026-09-23 — voir « Verdict du spike » puis « Révision »)
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
- **Inconvénients** : dépend de la capacité du SDK RevenueCat à propager cette purchase option **et** à la restituer dans le webhook. **Vérification faite : ce n'est pas possible** — voir « Verdict du spike ». Le mécanisme reste valable en soi, mais pas via le chemin d'achat RevenueCat.

### Option C — Produits génériques + corrélation par intent ouverte la plus récente

Le serveur retient la dernière intent non consommée de l'utilisateur et lui rattache l'achat entrant.

- **Avantages** : aucune dépendance à une fonctionnalité StoreKit avancée ; fonctionne avec n'importe quel fournisseur.
- **Inconvénients** : **fragile par construction**. Deux achats rapprochés sur deux chaînes différentes peuvent être inversés ; un retry client peut consommer la mauvaise intent ; un webhook en retard peut arriver après qu'une nouvelle intent a été ouverte. Le mode de défaillance est silencieux et se manifeste en production sur un abonnement payé.

### Option D — App Store Server API en direct, sans RevenueCat, pour les abonnements de chaîne

Le backend consomme les App Store Server Notifications V2 et interroge l'App Store Server API, avec sa propre gestion des JWS et du renouvellement.

- **Avantages** : accès non filtré à `appAccountToken`, aucune couche d'interprétation tierce, contrôle total.
- **Inconvénients** : charge de développement et de maintenance nettement supérieure (vérification de la chaîne de certificats, signature JWS, modélisation du cycle de vie des abonnements, sandbox), soit précisément ce que RevenueCat évitait. Perte des Paywalls remote config (cf. ADR 0016) pour ce périmètre.

## Décision

**Le mécanisme de l'option B (intent serveur + `appAccountToken`) est retenu, mais mis en œuvre par le chemin de l'option D : achat StoreKit 2 en direct, validation par App Store Server Notifications V2 et App Store Server API.** Le chemin d'achat RevenueCat est écarté pour les abonnements de chaîne.

### Verdict du spike

Le spike portait sur une seule question : le SDK RevenueCat permet-il d'attacher un `appAccountToken` choisi par nous à un achat, et de le récupérer dans le webhook ? **Non.**

La documentation et les réponses officielles de l'équipe RevenueCat sont sans ambiguïté : depuis la version 5.0.0 du SDK iOS, `appAccountToken` est **renseigné automatiquement à partir de l'App User ID**, à condition que celui-ci soit un UUID v4 valide. Ce n'est pas une option d'achat exposée au développeur : le SDK occupe le champ, et il l'occupe avec une valeur **stable par utilisateur** — exactement l'inverse de ce dont nous avons besoin, à savoir une valeur **unique par achat** portant le `channelId`. Par ailleurs, il n'existe pas de mécanisme généralement disponible pour attacher des métadonnées arbitraires à un achat intégré iOS et les voir ressortir dans les webhooks ; cette capacité existe côté Web Billing, pas côté App Store.

Nuance importante : l'option B n'est pas fausse, elle est **inaccessible à travers le chemin d'achat RevenueCat**. En achetant directement avec StoreKit 2, c'est nous qui passons `Product.PurchaseOption.appAccountToken(_:)`.

### Révision du 2026-09-23 — RevenueCat reste le chemin d'achat

Le verdict ci-dessus conduisait à l'option D, c'est-à-dire à écrire nous-mêmes toute l'intégration Apple. **Décision revue : RevenueCat est conservé comme chemin d'achat.** Ce qui est abandonné, c'est le transport de l'attribution par `appAccountToken` — pas RevenueCat.

Le raisonnement : ce que RevenueCat fournit n'est pas un confort, c'est le **cycle de vie complet de l'abonnement** — validation des reçus, renouvellements, périodes de grâce, changements de formule, remboursements, transferts entre comptes, sandbox, et la normalisation de tout cela entre Apple et Stripe le jour où le web arrivera. Réécrire cette machinerie représente plusieurs semaines pour un développeur solo, et elle n'a aucune valeur produit visible. Le problème d'attribution, lui, est un problème de **corrélation d'un identifiant**, soluble autrement et pour un coût sans commune mesure.

Autrement dit : on ne renonce pas au moteur parce que le porte-étiquette ne convient pas.

### Mécanisme d'attribution retenu

Trois chemins, par ordre d'autorité décroissante, avec un invariant serveur qui rend l'ambiguïté structurellement impossible.

**Invariant fondateur — une seule intent ouverte par utilisateur.** L'API refuse de créer une seconde `PurchaseIntent` tant qu'une intent non consommée et non expirée existe pour cet utilisateur. C'est ce qui distingue radicalement ce mécanisme de l'option C rejetée plus haut : il n'y a jamais de « choisir la plus récente », parce qu'il n'y en a jamais deux. L'achat est de toute façon un parcours modal côté client : on ne s'abonne pas à deux chaînes simultanément.

```
1. Client → API : POST /v1/subscriptions/intents { channelId, tier }
   API           : refuse si une intent est déjà ouverte pour cet utilisateur
                   sinon crée PurchaseIntent (userId, channelId, tier, intentId, TTL 15 min)

2. Client       : Purchases.shared.attribution.setAttributes(["pending_intent_id": intentId])
                  puis syncAttributesAndOfferingsIfNeeded()  ← attendu, pas lancé en arrière-plan
                  puis purchase(package)

3. RevenueCat → API (webhook INITIAL_PURCHASE)
   a. subscriber_attributes.pending_intent_id présent
      → résolution, vérification que l'intent appartient bien à app_user_id, entitlement créé.
        CHEMIN NOMINAL, AUTORITAIRE.
   b. absent
      → entitlement créé en statut PENDING_ATTRIBUTION, rattaché à original_transaction_id.
        Le paiement est acquis, la chaîne est inconnue. On ne devine pas.

4. Client → API : POST /v1/subscriptions/attach { intentId, transactionId }
   API           : vérifie que l'intent appartient à l'utilisateur authentifié, qu'elle est
                   ouverte, et que la transaction existe et est active côté RevenueCat
                   (GET /v1/subscribers/{app_user_id})
                   → attribue l'entitlement PENDING_ATTRIBUTION. CHEMIN DE RATTRAPAGE.

5. Filet : au-delà de 10 minutes en PENDING_ATTRIBUTION, si exactement une intent ouverte
   existe pour cet utilisateur, résolution automatique + journalisation. Sinon, file de
   réconciliation et invite in-app : « à quelle chaîne rattacher cet abonnement ? »
```

**Renouvellements** : l'attribut n'est **jamais** relu après l'achat initial. Un renouvellement survenant un mois plus tard porterait la valeur courante de l'attribut, qui peut concerner une autre chaîne — c'est le piège de ce mécanisme, et il est évité en corrélant les renouvellements par `original_transaction_id`, stocké sur l'entitlement à sa création. L'attribut n'établit le lien qu'une fois ; `original_transaction_id` le maintient.

**Pourquoi ce n'est pas l'option C déguisée.** L'option C devinait, silencieusement, en se fondant sur l'ordre d'arrivée. Ici : l'information voyage avec l'événement (3a), un second chemin indépendant existe (4), l'invariant d'intent unique supprime l'ambiguïté, et surtout **l'échec est un état explicite** (`PENDING_ATTRIBUTION`) qui s'alerte et se résout, au lieu d'une attribution fausse qu'on ne découvre jamais. Le système sait qu'il ne sait pas — c'est toute la différence.

L'intent a un **TTL de 15 minutes** et est **à usage unique**. Une intent expirée ou déjà consommée qui reçoit un achat déclenche une alerte et bascule sur la file de réconciliation : on ne devine jamais.

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

**Risque n°1 — `subscriber_attributes` n'est pas garanti dans le webhook.**
C'est le risque central du mécanisme retenu, et il est documenté par RevenueCat lui-même : le champ est présent « parfois », c'est-à-dire quand la donnée a été synchronisée à temps. Les attributs sont synchronisés à la configuration du SDK, à la mise en arrière-plan, et lors d'un achat — mais un attribut posé juste avant l'achat peut ne pas être remonté à temps. Mitigations, cumulatives : appel explicite à `syncAttributesAndOfferingsIfNeeded()` **attendu** avant de déclencher l'achat ; chemin de rattrapage client (étape 4) indépendant du webhook ; état `PENDING_ATTRIBUTION` explicite plutôt qu'une attribution devinée ; métrique sur le taux d'attribution nominale, avec alerte si elle descend sous 95 %. **Incertitude assumée : nous ne connaissons pas ce taux réel avant de l'avoir mesuré en sandbox puis en production.** C'est le principal point à instrumenter dès le premier achat.

**Risque n°2 — l'attribution dépend en partie du client.**
Le chemin de rattrapage passe par un appel client, donc par un acteur non fiable. Ce n'est pas un risque financier : le paiement est prouvé par le webhook RevenueCat, le client ne peut pas fabriquer un droit. Le pire abus possible est qu'un utilisateur rattache **son propre abonnement payé** à une chaîne différente de celle qu'il avait choisie — ce qui déplace du revenu d'un streamer vers un autre. Mitigation : l'API vérifie que l'`intentId` présenté appartient à l'utilisateur authentifié et correspond à une intent ouverte ; il ne peut donc rattacher qu'à la chaîne qu'il a lui-même désignée avant l'achat.

**Risque n°3 — intent expirée à l'arrivée de l'achat (Ask to Buy, paiement différé).**
Mitigation : ne pas supprimer les intents expirées ; les conserver 90 jours en statut `EXPIRED` et permettre la résolution d'un achat tardif contre une intent expirée **si et seulement si** l'UUID correspond exactement. Le TTL de 15 minutes gouverne l'UX, pas la résolution.

**Risque n°4 — webhook perdu : achat débité sans entitlement créé.**
Mitigation : job de réconciliation périodique confrontant les intents `PENDING` anciennes aux transactions connues côté fournisseur, plus un endpoint client de re-synchronisation. Un utilisateur qui a payé et n'a pas son droit doit pouvoir se débloquer sans support.

**Risque n°5 — divergence d'invariant sur les cadeaux.**
La prolongation de `expiresAt` par un cadeau alors qu'un abonnement payant est actif peut produire un double comptage côté revenu streamer. Mitigation : la prolongation modifie l'entitlement, mais les **événements de revenu restent distincts et non fusionnés** (cf. ledger, ADR 0015).

## Notes d'implémentation

- Bounded context : `monetization`. `PurchaseIntent` est un agrégat propre au contexte, pas une entité exposée.
- Le port sollicité est `PurchaseVerificationPort` (cf. ADR 0014) ; l'intent est créée par un use case `CreatePurchaseIntent` du layer application.
- Le domaine ne connaît ni RevenueCat, ni Apple, ni Stripe : il connaît `source: EntitlementSource`.
- Schéma Zod strict sur le payload webhook en frontière : un payload non conforme est rejeté et archivé, jamais interprété partiellement.
- `expiresAt` en UTC, stocké en `timestamptz`. Toute comparaison de droit se fait côté serveur, jamais avec une horloge client.
- Index PostgreSQL : unique partiel sur `(userId, channelId) WHERE status IN ('ACTIVE','GRACE')`, et index sur `(channelId, status)` pour les vérifications du chat.
- Les tests suivent le TDD strict : le cœur du domaine (invariants d'unicité, prolongation par cadeau, transitions de statut) se teste sans aucune infrastructure.
- `original_transaction_id` est la clé de corrélation durable de l'abonnement. Il est persisté sur l'entitlement dès sa création et sert à rattacher tous les événements ultérieurs. L'attribut d'intent ne sert qu'une fois.
- **L'invariant « une seule intent ouverte par utilisateur » est une contrainte d'unicité en base**, pas une vérification applicative : index unique partiel sur `(userId) WHERE status = 'OPEN'`. Une règle métier qui repose sur un `SELECT` puis un `INSERT` n'est pas une règle.
- Le premier test à écrire est celui du **chemin dégradé** : webhook sans `subscriber_attributes` → entitlement en `PENDING_ATTRIBUTION` → appel d'attachement → entitlement attribué. C'est le chemin qui casse en production, donc celui qui mérite d'être écrit en premier.
- Conserver les payloads de webhook bruts, archivés, indéfiniment : ce sont les seules pièces justificatives en cas de litige sur un abonnement.
- L'App User ID RevenueCat doit être un **UUID v4** : le SDK le pose alors comme `appAccountToken` côté Apple, ce qui donne gratuitement une corrélation utilisateur (pas chaîne) exploitable en réconciliation.

## Liens

- ADR 0014 — RevenueCat comme adapter, backend comme source de vérité des droits
- ADR 0015 — Séparation abonnements / consommables et ledger de monnaie virtuelle
- ADR 0016 — Répartition des responsabilités PostHog / RevenueCat
- ADR 0003 — Découpage en bounded contexts (le contexte `monetization`, non créé en tranche 1)
- ADR 0006 — Autorisation scopée par chaîne (l'entitlement est lu par le moteur de politiques ; `subscriber` n'est pas un rôle)
- ADR 0009 — Contrat API (validation Zod des webhooks entrants, après vérification de signature)
- ADR 0017 — Modèle de reversement aux streamers
