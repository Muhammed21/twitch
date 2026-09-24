# 0015 — Séparation abonnements / consommables et ledger de monnaie virtuelle

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le produit a deux mécaniques de monétisation de nature différente :

- **Les abonnements de chaîne** : récurrents, avec une date d'expiration, un renouvellement, une annulation, une période de grâce (ADR 0013 et 0014).
- **Les bits et dons** : ponctuels. Techniquement, une **monnaie virtuelle** achetée par packs, stockée sous forme de solde, puis dépensée par tranches dans le chat d'une chaîne.

RevenueCat est un outil d'abonnement. Il gère certes les non-subscriptions, mais c'est son point faible : il ne tient **pas de solde**, ne connaît **pas la dépense**, et n'offre **aucune réconciliation** entre ce qui a été acheté et ce qui a été consommé. Or c'est exactement ce que demande une monnaie virtuelle : achat, solde, dépense, remboursement, audit.

Confier les bits à RevenueCat reviendrait à le forcer sur un terrain pour lequel il n'est pas conçu, et à perdre l'auditabilité de la monnaie — précisément la partie où une erreur coûte de l'argent réel à un streamer.

## Facteurs de décision

- **Auditabilité** : chaque bit doit avoir une origine et une destination reconstituables.
- **Résistance au remboursement Apple** : un achat de pack peut être remboursé après dépense des bits.
- **Idempotence des dépenses** : un double-tap sur « envoyer 100 bits » ne doit débiter qu'une fois.
- **Cohérence transactionnelle** entre le débit et le message de chat associé.
- **Réalisme pour un développeur solo** : pas de comptabilité en partie double généralisée, mais un modèle correct sur le périmètre monnaie.

## Options envisagées

### Option A — Tout par RevenueCat, y compris les bits

- **Avantages** : une seule intégration d'achat, un seul webhook.
- **Inconvénients** : aucun solde, aucune dépense, aucune réconciliation. Il faudrait de toute façon écrire le ledger à côté — donc la « simplification » est illusoire. Écartée.

### Option B — Solde stocké en colonne `balance` mise à jour

- **Avantages** : trivial à implémenter et à lire.
- **Inconvénients** : un `UPDATE balance` détruit l'information. Impossible de répondre à « d'où vient ce solde », impossible de reconstruire après un bug, impossible d'appliquer proprement un remboursement rétroactif. Écartée.

### Option C — Séparation explicite par nature, avec ledger append-only pour les bits

- **Avantages** : chaque mécanique utilise l'outil adapté ; la monnaie est auditable et reconstructible ; le remboursement s'exprime comme une écriture, pas comme une correction manuelle.
- **Inconvénients** : deux chemins d'achat iOS à maintenir, lecture du solde par agrégation à optimiser.

## Décision

**Option C.** RevenueCat est réservé aux **abonnements**. Les bits suivent leur propre chemin, avec un **ledger append-only** comme source de vérité.

### Répartition des responsabilités

| | Inbound iOS | Inbound web | Source de vérité |
|---|---|---|---|
| **Abonnement de chaîne** | RevenueCat / IAP | Stripe | **l'API** (table d'entitlements, ADR 0014) |
| **Bits (packs)** | IAP vérifié via App Store Server API | Stripe | **l'API** (ledger) |
| **Payout streamer** | — | — | **Stripe Connect** |

Les bits ne passent **pas** par RevenueCat : l'achat de pack est un consommable StoreKit vérifié en direct via l'**App Store Server API**. C'est plus de travail qu'un webhook RevenueCat, mais cela évite de dépendre d'un intermédiaire sur une fonctionnalité qu'il ne modélise pas — ni solde, ni dépense, ni réconciliation.

Les abonnements cadeaux (ADR 0013) sont des achats ponctuels : ils relèvent techniquement de ce chemin consommable, pas du chemin abonnement.

### Ledger append-only

**Règle absolue : jamais d'`UPDATE balance`.** Le solde n'est pas une donnée, c'est une **projection**.

```
BitsLedgerEntry                 -- append-only, aucun UPDATE, aucun DELETE
  id            UUID
  userId        UserId
  amount        Int             -- > 0 = crédit, < 0 = débit
  kind          PURCHASE | SPEND | REFUND_REVERSAL | PROMO_GRANT | ADJUSTMENT
  channelId     ChannelId | null   -- renseigné sur SPEND
  idempotencyKey String            -- unique, fourni par le client sur SPEND
  sourceRef     String | null      -- transactionId Apple, paymentIntent Stripe, chatMessageId
  createdAt     DateTime

  contrainte : UNIQUE (userId, idempotencyKey)
  contrainte : amount <> 0
```

Le solde est `SUM(amount) WHERE userId = ?`, matérialisé dans une projection de lecture rafraîchie à l'écriture. La projection peut toujours être **reconstruite intégralement** à partir du ledger — c'est le seul test qui prouve que le modèle tient.

### Idempotence des dépenses

Un double-tap sur « envoyer 100 bits », un retry réseau ou un rejeu de requête ne doivent jamais débiter deux fois.

- Le client génère une `idempotencyKey` (UUID) **au moment de la composition de l'action**, pas à l'envoi — un retry réutilise la même clé.
- L'insertion en ledger s'appuie sur la contrainte d'unicité `(userId, idempotencyKey)` : la seconde tentative viole la contrainte et retourne le **résultat de la première** avec un `200`, pas une erreur.
- Aucun `SELECT` préalable comme garde : sous concurrence, il ne garantit rien. C'est la base qui arbitre.

### Cohérence entre le débit et l'événement de chat

Un débit sans message affiché est un vol ; un message affiché sans débit est une fuite de revenu.

- Le débit en ledger et la création de l'**événement de cheer** sont écrits dans la **même transaction PostgreSQL**. Ils sont indissociables.
- La **diffusion** du message dans le chat WebSocket est en revanche postérieure au commit et faillible : le chat consomme l'événement persisté. Un échec de diffusion est une dégradation d'affichage, pas une perte d'argent — et le message est rattrapable à la reconnexion.
- L'ordre est strict : jamais de diffusion avant commit. Un cheer affiché puis annulé serait pire qu'un cheer affiché en retard.

### Remboursement Apple et solde négatif

Un `REFUND` peut arriver **après** que les bits ont été dépensés. Le ledger doit le refléter, pas le cacher.

- Un remboursement génère une écriture `REFUND_REVERSAL` d'un montant négatif égal au crédit initial. **Le solde peut devenir négatif.** C'est correct : c'est la réalité comptable.
- **Politique retenue :** le solde négatif est autorisé en base et bloque toute nouvelle dépense jusqu'à retour à zéro ou au-dessus. Aucune reprise sur les bits déjà distribués au streamer, et **aucune reprise automatique sur le payout du streamer** : le streamer n'est pas responsable de la fraude de son viewer, et un débit surprise sur un versement détruirait la confiance.
- Le coût du remboursement est donc assumé par la plateforme. Sur un projet perso c'est négligeable ; le seuil de bascule (par exemple, remboursements répétés d'un même utilisateur) déclenche une alerte et une suspension manuelle du compte, pas une règle automatique.
- L'UI indique explicitement un solde négatif et sa cause. Masquer un solde négatif produirait des tickets de support insolubles.

### Conservation et expiration des soldes

- **Les bits n'expirent pas.** Faire expirer une monnaie virtuelle achetée soulève des questions de protection du consommateur variables selon la juridiction, pour un gain nul sur un projet perso.
- Le solde est conservé tant que le compte existe. À la suppression du compte, le ledger est conservé sous forme anonymisée (agrégats, sans identifiant personnel) pour l'intégrité comptable, l'identité étant purgée.
- Le solde **n'est pas transférable** entre comptes, ni lors d'un `TRANSFER` Apple (cf. ADR 0014).
- Le ledger n'est jamais purgé. C'est le point du modèle append-only.

### Décision produit : le coût de l'IAP, écrit noir sur blanc

Les abonnements de chaîne et les bits sont du **contenu numérique consommé dans l'app**. Apple impose donc l'achat intégré, avec une commission de **30 %** (15 % dans le Small Business Program, sous conditions d'éligibilité).

Twitch verse environ **50 %** au streamer. L'arithmétique sur iOS est brutale :

```
100 € payés par le viewer
 -30 €  commission Apple
 =70 €  encaissés par la plateforme
 -50 €  part streamer (calculée sur le montant payé)
 =20 €  restant, avant coûts vidéo, infrastructure et paiement
```

Soit **80 % de la somme partie avant même de payer la vidéo**, qui est le poste de coût dominant. Ce n'est pas soutenable à l'échelle, et c'est exactement pourquoi Twitch pousse les achats vers le web. Sur un projet perso, ce n'est **pas bloquant** — le volume est nul et la valeur d'apprentissage prime — mais cela doit être écrit plutôt que découvert. Deux conséquences directes :

1. Le split streamer devra à terme être calculé sur le **montant net encaissé**, pas sur le montant payé, sous peine de marge négative.
2. Le chemin d'achat web (Stripe) n'est pas un confort : c'est la condition de viabilité économique, et l'architecture multi-adapter de l'ADR 0014 existe pour cela.

**Sur les liens d'achat externes :** les règles App Store encadrant les liens vers un achat hors application et les commissions associées **ont beaucoup évolué récemment** — décision *Epic v. Apple* aux États-Unis en 2025, DMA dans l'Union européenne. L'état exact de ces règles est **juridictionnel** et mouvant. Cet ADR ne se prononce pas sur leur contenu actuel : **toute stratégie reposant sur un lien d'achat externe doit être vérifiée dans les App Store Review Guidelines en vigueur au moment de l'implémentation**, pays par pays, avant d'être codée. Concevoir le chemin web comme s'il était librement promouvable depuis l'app serait une hypothèse non vérifiée.

## Conséquences

### Positives

- La monnaie virtuelle est auditable : toute valeur de solde s'explique par une suite d'écritures datées.
- Un remboursement, une correction ou un bug se réparent par écriture compensatoire, sans jamais réécrire l'historique.
- Le double-tap et les retry sont neutralisés par une contrainte de base, pas par une heuristique.
- Chaque mécanique utilise l'outil adapté ; RevenueCat n'est pas poussé hors de son domaine de compétence.
- L'adapter App Store Server API construit ici sert également de repli à l'ADR 0013.

### Négatives

- **Deux chemins d'achat iOS à maintenir** : RevenueCat pour les abonnements (ADR 0013), App Store Server API pour les consommables. Donc deux mécanismes d'authentification de webhook, deux jeux de tests sandbox, et deux endroits où une sémantique d'événement peut être mal comprise. C'est le coût assumé de mettre chaque mécanique sur l'outil qui la modélise réellement — mais c'en est un, et il se paie à chaque évolution.
- La vérification directe des reçus Apple (chaîne de certificats, JWS, notifications V2) est du travail que RevenueCat aurait masqué.
- Le solde par agrégation impose une projection de lecture et son invalidation.
- La politique de solde négatif fait porter le coût du remboursement à la plateforme.

### Risques et mitigations

- **Divergence entre la projection de solde et le ledger.** Mitigation : job de vérification périodique recalculant le solde depuis le ledger et alertant sur tout écart ; la projection est toujours reconstructible à la demande.
- **Clé d'idempotence mal générée côté client** (régénérée à chaque tentative) → double débit. Mitigation : la clé est produite par le domaine côté client à la composition de l'action, et un test d'intégration iOS couvre explicitement le scénario retry.
- **Incertitude sur la politique de solde négatif.** Ne pas récupérer les bits déjà distribués est un choix de confiance, pas un optimum économique. Il tient parce que le volume est nul ; il devra être réexaminé si des remboursements répétés apparaissent, et cet ADR devra alors être remplacé.
- **Fraude au remboursement à grande échelle** (achat, dépense, remboursement, répétition). Mitigation : détection sur le ratio remboursements/achats par utilisateur, suspension manuelle. Pas de règle automatique : le faux positif coûte plus cher que le fraudeur.
- **Incertitude réglementaire sur les liens d'achat externes.** Non levée dans cet ADR, volontairement, et à vérifier au moment de l'implémentation dans la juridiction visée.
- **Transaction longue** si l'écriture ledger + cheer est couplée à un traitement lourd. Mitigation : la transaction ne contient que les deux insertions ; tout le reste (notification, diffusion, analytics) est postérieur au commit.

## Notes d'implémentation

- Contexte `monetization`. Le ledger est un agrégat du domaine ; `chat` ne l'écrit jamais directement, il consomme l'événement de cheer.
- Montants en entiers, jamais en flottants. Les bits sont une unité entière ; les montants monétaires sont stockés en plus petite unité avec leur devise.
- Index : `(userId, createdAt)` pour l'historique, unique sur `(userId, idempotencyKey)`, `(channelId, createdAt)` pour les revenus de chaîne.
- Les tables du ledger sont protégées en écriture : aucune migration ni script ne doit émettre d'`UPDATE` ou de `DELETE` dessus. À vérifier en revue de migration.
- Tests TDD prioritaires : reconstruction du solde depuis le ledger, idempotence sous concurrence, solde négatif après remboursement post-dépense, atomicité débit/cheer.
- Payouts via `StripeConnectPayoutAdapter` (port `PayoutPort`, ADR 0014), calculés sur agrégation du ledger et des événements de revenu d'abonnement, jamais sur les soldes courants.

## Liens

- ADR 0013 — Modèle d'entitlement multi-tenant
- ADR 0014 — Le backend comme source de vérité des droits, le fournisseur comme simple adapter
- ADR 0016 — Répartition PostHog / RevenueCat
