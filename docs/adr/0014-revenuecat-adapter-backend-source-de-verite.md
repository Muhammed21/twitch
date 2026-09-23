# 0014 — Le backend comme source de vérité des droits, le fournisseur comme simple adapter

- Statut : Accepté
- Date : 2026-09-22 (amendé le 2026-09-23 à la suite du verdict de spike de l'ADR 0013)

> **Amendement du 2026-09-23.** Cet ADR a été rédigé en supposant que RevenueCat serait le chemin d'achat iOS. Le spike de l'ADR 0013 a montré que RevenueCat ne peut pas porter un `appAccountToken` par achat, ce qui le disqualifie pour les abonnements scopés par chaîne. **Les achats iOS passent désormais par StoreKit 2 en direct, validés par les App Store Server Notifications V2.** Les deux règles non négociables ci-dessous — et c'est tout l'intérêt de cet ADR — sont strictement inchangées : elles ne parlaient jamais de RevenueCat, mais de qui décide d'un droit. Seul le nom de l'adapter change.
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0013 définit un entitlement scopé par chaîne. Reste à trancher **qui décide** qu'un droit est actif au moment où une restriction s'applique : chat sub-only, emotes d'abonné, VOD réservées, badge de chaîne.

La voie de moindre effort consiste à laisser le client iOS lire `customerInfo` et à faire confiance à sa réponse. Elle est inacceptable :

- un appareil jailbreaké ou un proxy StoreKit falsifie la réponse locale ;
- un cache RevenueCat périmé en mode hors ligne accorde un droit expiré, ou refuse un droit payé ;
- `customerInfo` est **global par utilisateur** : il ne sait de toute façon pas exprimer « abonné à la chaîne 123 » ;
- surtout, le **chat est un process WebSocket séparé** : il ne peut pas interroger RevenueCat à chaque message entrant. Sur un canal actif, cela signifierait des milliers d'appels réseau vers un tiers par seconde, avec sa latence et sa disponibilité dans le chemin critique du chat.

Par ailleurs, les achats web via Stripe arriveront plus tard. Si les règles d'accès sont écrites contre le modèle RevenueCat, elles devront être réécrites — ou pire, dupliquées.

## Facteurs de décision

- **Non-contournabilité** : un droit doit être invérifiable côté client.
- **Latence du chat** : la vérification d'un droit doit être locale à l'API, en mémoire ou en base, jamais sur un appel tiers.
- **Multi-fournisseur** : iOS (IAP) aujourd'hui, web (Stripe) demain, sans réécriture des règles d'accès.
- **Fiabilité du webhook** : RevenueCat rejoue les événements ; l'ordre d'arrivée n'est pas garanti.
- **Coût solo** : garder ce que RevenueCat fait bien (cycle de vie des abonnements, paywalls, sandbox) sans lui céder le modèle.

## Options envisagées

### Option A — Le client fait foi (`customerInfo` comme autorité)

- **Avantages** : quasi aucun travail backend, disponible immédiatement.
- **Inconvénients** : contournable trivialement, incapable d'exprimer un droit scopé par chaîne, inutilisable par le chat, et non partageable avec un futur achat web. Écartée sans réserve.

### Option B — L'API interroge RevenueCat à la demande

- **Avantages** : pas de table d'entitlements à maintenir, pas de webhook.
- **Inconvénients** : latence tierce dans le chemin critique du chat, quotas d'API, indisponibilité RevenueCat = monétisation cassée, et toujours pas de scope par chaîne. Écartée.

### Option C — RevenueCat comme adapter, backend source de vérité

Le backend tient sa propre table d'entitlements, alimentée par des webhooks. RevenueCat devient un fournisseur d'événements parmi d'autres.

- **Avantages** : vérification locale et rapide, non contournable, multi-fournisseur, testable sans réseau.
- **Inconvénients** : il faut écrire et exploiter un pipeline de webhooks idempotent, et gérer explicitement tout le cycle de vie des abonnements.

## Décision

**Option C.** Deux règles non négociables :

> **1. Le client ne décide d'aucun droit.** `customerInfo` sert exclusivement à l'affichage optimiste de l'UI : masquer un paywall, afficher un badge tout de suite après l'achat. Aucune restriction réelle ne repose dessus.
>
> **2. Toute restriction est vérifiée par l'API contre sa propre table d'entitlements.** Chat sub-only, emotes d'abonné, VOD réservées, badge : tout passe par `monetization`.

En pratique, le client peut afficher un badge d'abonné que le serveur refuserait — c'est un défaut cosmétique assumé et corrigé au prochain `bootstrap`. Il ne peut jamais envoyer un message dans un chat sub-only sans droit réel.

### Structure du contexte `monetization`

```
domain/
  Entitlement              invariants de droit (cf. ADR 0013)
  SubscriptionTier
  ChannelSubscription
application/
  ports/
    PurchaseVerificationPort   entrée : un achat vérifié → un entitlement
    PayoutPort                 sortie : versement au streamer
  usecases/
    CreatePurchaseIntent, GrantEntitlement, RevokeEntitlement,
    CheckChannelEntitlement
infrastructure/
  AppStoreServerAdapter          (iOS — ASSN V2 + App Store Server API)
  StripeSubscriptionAdapter      (web, plus tard)
  StripeConnectPayoutAdapter
  PrismaEntitlementRepository
```

Le fournisseur est un **adapter**, pas le modèle. Cette structure vient d'être validée par les faits : le verdict du spike de l'ADR 0013 a imposé de remplacer `RevenueCatWebhookAdapter` par `AppStoreServerAdapter`, et **aucune règle d'accès, aucun use-case et aucun invariant de domaine n'a bougé**. C'était l'hypothèse de conception ; elle a tenu à la première épreuve réelle. C'est aussi ce qui permettra d'ajouter les achats web plus tard au même coût.

RevenueCat n'est pas éliminé du projet pour autant : il conserve le rendu des paywalls en configuration distante (ADR 0016). Il n'est simplement plus sur le chemin de la vérité des droits.

### Contrat du webhook

- **Authentification** : les App Store Server Notifications V2 sont des **JWS signés par Apple**. La vérification porte sur la signature et sur la chaîne de certificats jusqu'à la racine Apple — pas sur un secret partagé. Un en-tête partagé aurait été plus simple ; ce ne sont pas les règles d'Apple. Toute notification dont la chaîne ne valide pas est rejetée, archivée brute, et alertée.
- **Idempotence obligatoire** : Apple rejoue jusqu'à obtention d'un `200`. Chaque notification est enregistrée dans une table `processed_webhook_events` clé sur le `notificationUUID`, avec insertion contrainte par unicité. Un doublon retourne `200` sans effet de bord. Ce n'est pas une optimisation : sans cela, un rejeu d'achat initial peut créer un second entitlement ou re-créditer un cadeau.
- **Traitement asynchrone** : l'endpoint vérifie la signature, persiste la notification brute, publie sur une file, répond `200` en quelques millisecondes. Aucune logique métier en synchrone. Un timeout déclenche un rejeu, donc une charge en cascade exactement au pire moment.
- **Validation Zod stricte** en frontière. Un payload non conforme est archivé et alerté, jamais interprété partiellement.
- **Désordre assumé** : les événements peuvent arriver dans le désordre. Toute application d'événement compare l'horodatage fournisseur à celui du dernier événement appliqué pour cet abonnement et ignore un événement antérieur.

### Événements traités explicitement

Traiter uniquement `INITIAL_PURCHASE` est le défaut classique : tout marche en démo, puis les droits dérivent en silence.

Les noms ci-dessous sont ceux du **modèle de domaine**, pas ceux d'un fournisseur. La colonne Apple donne la correspondance avec les `notificationType` / `subtype` des ASSN V2 ; une correspondance Stripe s'ajoutera à l'identique pour le web, sans toucher au traitement.

| Événement de domaine | Apple (ASSN V2) | Traitement |
|---|---|---|
| `INITIAL_PURCHASE` | `SUBSCRIBED` / `INITIAL_BUY` | Résolution de l'intent (ADR 0013) → création de l'entitlement scopé. |
| `RENEWAL` | `DID_RENEW` | Prolongation de `expiresAt`. Ne recrée jamais l'entitlement. Événement de revenu émis pour le payout. |
| `CANCELLATION` | `DID_CHANGE_RENEWAL_STATUS` / `AUTO_RENEW_DISABLED` | **≠ fin d'accès.** Marque l'auto-renouvellement comme désactivé. `status` reste `ACTIVE`, l'accès court jusqu'à `expiresAt`. Déclenche éventuellement une relance produit, jamais une révocation. |
| `EXPIRATION` | `EXPIRED` | `status → EXPIRED`. Fin effective de l'accès. |
| `BILLING_ISSUE` | `DID_FAIL_TO_RENEW` / `GRACE_PERIOD` | `status → GRACE`. **L'accès est maintenu** pendant la période de grâce, et une bannière non bloquante est affichée dans l'app. Couper l'accès ici transformerait un incident de carte bancaire en churn. |
| `PRODUCT_CHANGE` | `DID_CHANGE_RENEWAL_PREF` | Changement de tier sur l'entitlement **existant** (invariant d'unicité de l'ADR 0013). Upgrade immédiat, downgrade appliqué à la date de renouvellement telle que communiquée par le fournisseur. |
| `TRANSFER` | aucun équivalent direct — détecté par corrélation | Voir ci-dessous. |
| `REFUND` | `REFUND` | Révocation de l'entitlement (`status → REVOKED`) et contre-écriture côté revenu streamer (cf. ADR 0015). |
| `SUBSCRIPTION_PAUSED` | `DID_CHANGE_RENEWAL_STATUS` / pause | `status → EXPIRED` à la date de pause effective, ré-activation sur l'événement de reprise. |

### Politique de transfert (`TRANSFER`)

Un `TRANSFER` survient quand un utilisateur restaure ses achats sur un autre compte applicatif : l'achat Apple, attaché à l'Apple ID, migre d'un `appUserID` à un autre. Non géré, il produit exactement deux bugs symétriques : on offre des abonnements à un compte qui n'a rien payé, ou on révoque à tort le compte légitime.

**Politique retenue : transfert suivant l'achat, avec révocation de l'origine.**

- Les entitlements de `source = APPLE_IAP` liés à la transaction transférée sont **révoqués sur l'ancien `appUserID` et recréés à l'identique sur le nouveau** — même `channelId`, même tier, même `expiresAt`.
- Les entitlements de source `GIFT`, `PRIME`, `PROMO` et `MANUAL` **ne bougent pas** : ils appartiennent au compte applicatif, pas à l'Apple ID.
- Si le nouveau compte détient déjà un entitlement actif sur la même chaîne, la date d'expiration la plus lointaine l'emporte et l'événement est journalisé pour revue.
- Le solde de bits (ADR 0015) **n'est jamais transféré** : c'est une monnaie du compte applicatif, et un transfert de solde ouvrirait un vecteur d'abus trivial.
- Chaque transfert est journalisé avec les deux `appUserID` et reste consultable. Sur un projet solo, la traçabilité vaut mieux qu'une résolution automatique élaborée.

### Détails iOS

- **`appUserID` = l'ID utilisateur stable du backend**, jamais l'ID anonyme par défaut de RevenueCat. Le `login()` RevenueCat est appelé dès que l'identité est connue. Laisser l'ID anonyme rend tout webhook non corrélable à un utilisateur.
- **`logOut()` à la déconnexion**, sans exception. Omis, deux comptes sur le même appareil fusionnent en un seul acheteur et héritent mutuellement de leurs droits.
- **Le paywall doit rester utilisable en réseau dégradé.** Cache local des offerings, timeout court sur le chargement distant, et **fallback en dur** dans le binaire si rien n'est disponible. Un paywall vide, c'est 100 % de perte sur l'intention d'achat la plus qualifiée du parcours — c'est le pire échec possible de cette fonctionnalité.
- **`StoreKit Configuration File`** pour les tests locaux et les parcours d'erreur (échec de paiement, annulation utilisateur, Ask to Buy) ; **sandbox Apple** pour les parcours de renouvellement, d'expiration et de période de grâce, qui ne se simulent pas localement de façon crédible.
- L'app ne persiste aucun droit dérivé de `customerInfo` au-delà de la session d'affichage.

### Lecture des droits côté API

- `GET /v1/mobile/bootstrap` renvoie la liste des entitlements actifs de l'utilisateur (endpoint défini par l'ADR 0009) : c'est la réconciliation d'ouverture d'app.
- Le **chat WebSocket** charge les droits pertinents à la connexion au canal et les tient en cache mémoire avec invalidation par événement de domaine (`EntitlementGranted`, `EntitlementRevoked`). Aucun appel réseau par message.
- Les vérifications hors chat (VOD, emotes) passent par `CheckChannelEntitlement`, requête indexée locale.

## Conséquences

### Positives

- La monétisation n'est plus contournable par le client, quel que soit l'état de l'appareil.
- Le chat vérifie un droit en mémoire : aucune latence tierce dans le chemin critique.
- L'ajout de Stripe pour le web est un nouvel adapter, sans toucher au domaine ni aux règles d'accès.
- Le domaine est testable sans réseau ni SDK : les invariants d'entitlement se testent en TDD pur.
- Le cycle de vie complet des abonnements est documenté et traité, y compris les cas qui mordent tard (`TRANSFER`, `BILLING_ISSUE`).

### Négatives

- Pipeline de webhooks à écrire, exploiter et surveiller : file, idempotence, rejeux, alerting. C'est du travail réel pour un développeur solo.
- Décalage possible entre l'UI optimiste et le droit serveur pendant quelques secondes après un achat.
- Il faut maintenir la traduction de chaque événement fournisseur, et suivre leur évolution.

### Risques et mitigations

- **Webhook non reçu ou file en panne** → achat payé sans droit accordé. Mitigation : job de réconciliation périodique contre l'état fournisseur, endpoint client de re-synchronisation, alerte sur toute intent `PENDING` de plus de 30 minutes.
- **Incertitude sur la sémantique exacte des notifications Apple.** Les couples `notificationType` / `subtype` sont nombreux et certaines sémantiques restent ambiguës à la seule lecture de la documentation — notamment les périodes de grâce, les changements de statut de renouvellement et la détection d'un transfert entre comptes applicatifs, pour laquelle Apple n'a pas d'événement dédié. Mitigation : la table de correspondance ci-dessus doit être **vérifiée en sandbox avant mise en production** ; toute notification dont le couple n'est pas explicitement traité est persistée, alertée et **ignorée plutôt que devinée**. Cette vérification est d'autant plus nécessaire que RevenueCat absorbait auparavant ces subtilités pour nous.
- **Politique de transfert contestable.** Révoquer côté origine est le choix sûr, mais il peut frustrer un utilisateur légitime qui a simplement changé de compte. Assumé sur un projet perso ; la journalisation permet un rattrapage manuel.
- **Cache de droits du chat périmé** sur un entitlement révoqué en cours de session. Mitigation : invalidation par événement de domaine et TTL plafond sur l'entrée de cache.
- **Oubli du `logOut()`** lors de l'ajout d'un nouveau chemin de déconnexion. Mitigation : la déconnexion passe par un point unique du code d'identité, et un test d'intégration iOS le couvre.

## Notes d'implémentation

- L'endpoint webhook vit dans `infrastructure/` du contexte `monetization` et ne contient aucune règle métier.
- Table `processed_webhook_events (provider, event_id, received_at, payload)` avec unicité sur `(provider, event_id)` — l'idempotence repose sur une contrainte de base, pas sur un `SELECT` préalable.
- Les événements d'entitlement sont publiés comme événements de domaine et consommés par `chat`, `channel` et `notification` : aucun de ces contextes ne lit la table d'entitlements directement.
- Toute vérification de droit utilise l'horloge serveur.
- Tests : le domaine en TDD strict sans infrastructure ; l'adapter webhook testé contre des payloads réels capturés en sandbox, versionnés comme fixtures.

## Liens

- ADR 0009 — Contrat API (définit `/v1/mobile/bootstrap`)
- ADR 0012 — Stratégie analytics (revenus capturés côté serveur depuis les webhooks)
- ADR 0013 — Modèle d'entitlement multi-tenant
- ADR 0015 — Séparation abonnements / consommables et ledger
- ADR 0016 — Répartition PostHog / RevenueCat
