# 0016 — Répartition des responsabilités PostHog / RevenueCat sur les flags et l'expérimentation

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Le projet utilise **PostHog** pour l'analytics, les feature flags et l'expérimentation, et **RevenueCat** pour les achats iOS (ADR 0014). Or RevenueCat propose lui aussi un système d'expérimentation — *RevenueCat Experiments* — couplé à ses *Paywalls*.

Laisser les deux actifs garantit une collision :

- **Deux systèmes d'assignation.** RevenueCat assigne une variante sur son propre `appUserID`, PostHog sur son `distinct_id`. Rien ne garantit qu'un même utilisateur tombe dans la variante correspondante des deux côtés. Un utilisateur peut voir le paywall B de RevenueCat tout en étant compté variante A par PostHog.
- **Deux définitions de la conversion.** RevenueCat mesure une conversion en achat vérifié ; PostHog mesure ce qu'on lui a instrumenté (vue du paywall, tap sur le bouton, achat confirmé). Les dénominateurs diffèrent.
- **Des résultats contradictoires impossibles à arbitrer.** Deux dashboards annoncent des gagnants différents, sans moyen de savoir lequel a raison — parce qu'ils ne mesurent pas la même population sur la même métrique.

Cette ambiguïté ne se règle pas par une réconciliation a posteriori : elle se règle en supprimant le second système d'assignation.

## Facteurs de décision

- **Une seule source d'assignation**, sous peine de résultats non arbitrables.
- **Un seul funnel analysable de bout en bout** : découverte → vue du paywall → achat → rétention.
- **Cohérence serveur/client** : le flag évalué côté serveur et le paywall rendu côté client doivent concorder.
- **Conserver ce que RevenueCat fait mieux** : modifier un paywall sans passer par une release App Store est une valeur réelle, surtout en solo où chaque release coûte une revue Apple.
- **Attribution du revenu à la variante** : une expérimentation de paywall sans revenu attribué ne conclut rien.

## Options envisagées

### Option A — RevenueCat Experiments comme système d'expérimentation

- **Avantages** : intégration native avec les Paywalls, aucun câblage à écrire.
- **Inconvénients** : limité au périmètre paywall/achat, ne peut pas expérimenter sur le reste du produit (onboarding, découverte, chat), et ne s'évalue pas côté serveur. Imposerait un second système pour tout le reste — donc exactement le problème à éviter.

### Option B — Les deux, chacun sur son périmètre

- **Avantages** : aucun.
- **Inconvénients** : la frontière « son périmètre » est illusoire — le paywall est l'aboutissement d'un funnel qui commence ailleurs. Deux assignations, deux vérités. Écartée.

### Option C — PostHog seule source d'assignation, RevenueCat au rendu et à la facturation

- **Avantages** : une assignation, un funnel complet, expérimentation possible sur tout le produit, cohérence serveur/client atteignable.
- **Inconvénients** : le câblage variante → paywall est à écrire ; il faut renoncer explicitement à RevenueCat Experiments et le documenter comme interdit.

## Décision

**Option C.**

> **PostHog est la source de vérité des feature flags et de l'assignation des variantes.** RevenueCat sert au **rendu** du paywall (Paywalls en configuration distante) et à la **facturation** des abonnements (ADR 0013).
>
> **Règle stricte : il est interdit de lancer une expérimentation RevenueCat en parallèle.** Aucune exception, y compris « juste pour tester ».

RevenueCat Paywalls reste utilisé, et c'est délibéré : modifier la présentation d'un paywall sans release App Store est la vraie valeur du produit. Ce qu'on lui retire, c'est **la décision de qui voit quoi**.

### Flux d'assignation de bout en bout

```
1. Ouverture de l'app
   Client → API : GET /v1/mobile/bootstrap            (défini par l'ADR 0009)

2. Évaluation côté serveur
   API → PostHog (SDK serveur) : évalue les flags pour userId
   → bootstrap renvoie { flags: { paywall_variant: "B", ... } }
   L'ID d'assignation PostHog est l'ID utilisateur stable du backend,
   le même que l'appUserID RevenueCat (ADR 0014).

3. Rendu
   Le client demande à RevenueCat l'offering correspondant à la variante
   reçue dans bootstrap — il ne demande PAS à RevenueCat quelle variante afficher.

4. Corrélation revenu
   La variante est enregistrée sur la PurchaseIntent côté serveur (ADR 0013),
   à sa création — donc avant l'achat, par construction. C'est l'attribution
   qui fait foi. Elle voyage en outre dans le même attribut d'abonné que
   l'intentId, par le mécanisme déjà mis en place par l'ADR 0013.

5. Analyse
   Les événements de revenu sont émis par le backend depuis le handler de
   webhook RevenueCat (ADR 0012, capture serveur), avec la variante lue sur
   l'intent. Le funnel complet — vue, tap, achat, renouvellement, churn —
   s'analyse dans PostHog seul.
```

### Cohérence serveur / client

C'est le point qui casse en silence si on ne le traite pas.

- **Le flag est évalué côté serveur, une fois, et transporté dans `bootstrap`.** Le client ne réévalue jamais un flag d'expérimentation localement : une réévaluation locale peut produire une variante différente de celle qui a été comptée côté serveur.
- La variante reçue est **figée pour la durée de la session** et ne change pas suite à un rafraîchissement du SDK PostHog client.
- Le SDK PostHog client reste installé pour l'envoi d'événements et l'identification, **pas pour décider d'une variante d'expérimentation**.
- Si `bootstrap` échoue ou ne renvoie pas de variante, le client affiche le **paywall par défaut** et n'émet **aucun événement d'exposition**. Un utilisateur non assigné ne doit pas polluer l'expérimentation.
- La variante est incluse dans les propriétés des événements d'exposition et d'achat émis côté client, pour permettre un contrôle de cohérence : tout écart entre la variante annoncée par le serveur et celle portée par un événement doit être détectable.

### Attribution du revenu à la variante

- **La variante est enregistrée sur la `PurchaseIntent` (ADR 0013)**, à sa création, donc nécessairement avant l'achat. C'est l'attribution qui **fait foi** : elle est serveur, ne dépend d'aucun SDK, et survit à la perte de n'importe quel événement analytics.
- Elle est **en outre** placée dans l'attribut d'abonné RevenueCat, aux côtés de l'`intentId` — même appel, même synchronisation explicite, aucun mécanisme supplémentaire (ADR 0013). Cela donne un confort de lecture dans les tableaux de bord RevenueCat.
- **En cas de divergence entre les deux, l'intent gagne**, sans discussion. L'attribut d'abonné est documenté comme « parfois » présent dans les webhooks ; il ne peut donc jamais servir d'autorité.
- Les renouvellements héritent de la variante de l'achat initial : c'est ce qui permet de mesurer la valeur à long terme d'une variante, pas seulement sa conversion immédiate.

### Périmètre des flags

- Les flags de **release** (activation de fonctionnalité, kill switch) et les flags d'**expérimentation** vivent tous deux dans PostHog, mais sont nommés distinctement (`release_*` / `exp_*`) et n'ont pas le même cycle de vie : un flag de release est supprimé après stabilisation, un flag d'expérimentation est clos avec son analyse.
- Les flags touchant à la monétisation ne modifient **jamais** un droit : ils modifient une présentation. Les droits relèvent exclusivement de l'ADR 0014.

## Conséquences

### Positives

- Une seule assignation, donc des résultats d'expérimentation arbitrables.
- Un funnel complet analysable dans un seul outil, du premier écran au renouvellement.
- La capacité à modifier un paywall sans release App Store est conservée.
- L'expérimentation ne se limite pas au paywall : elle couvre tout le produit avec le même mécanisme.
- L'attribution du revenu repose sur une donnée serveur, indépendante de la fiabilité des SDK clients.

### Négatives

- Câblage à écrire et à maintenir entre la variante PostHog et l'offering RevenueCat ; un nom d'offering renommé côté RevenueCat casse silencieusement le mapping.
- Une fonctionnalité payée chez RevenueCat (Experiments) est délibérément inutilisée.
- Dépendance de `bootstrap` sur la disponibilité de PostHog côté serveur, dans un chemin de démarrage d'app.

### Risques et mitigations

- **Mapping variante → offering désynchronisé.** Mitigation : mapping déclaré en un point unique côté serveur, et test de contrat vérifiant que chaque variante active correspond à un offering existant ; à défaut, fallback sur le paywall par défaut plutôt qu'un paywall vide (cf. ADR 0014 : un paywall vide est 100 % de perte).
- **PostHog indisponible au `bootstrap`.** Mitigation : timeout court, valeurs par défaut des flags servies depuis un cache serveur, et aucune exposition comptée. La monétisation doit fonctionner sans expérimentation.
- **Quelqu'un — moi — active RevenueCat Experiments « juste pour voir ».** C'est le risque le plus probable de cet ADR, parce que la fonctionnalité est à un clic dans le dashboard. Mitigation : la règle est écrite ici, et un contrôle est à ajouter à la checklist de revue avant toute campagne de paywall.
- **Restitution des `subscriberAttributes` dans les webhooks : « parfois », selon la documentation RevenueCat.** Ce risque est désormais partagé avec l'ADR 0013, qui en fait son risque n°1 puisque l'attribution de chaîne repose sur le même canal. Ici, la conséquence est bien moindre : l'attribution de variante faisant foi est celle de l'intent, donc une restitution défaillante dégrade le confort de lecture, pas l'analyse.
- **Contamination d'échantillon** si un utilisateur change d'ID (connexion, transfert, ADR 0014). Mitigation : l'assignation repose sur l'ID utilisateur stable du backend, et tout changement d'identité est journalisé pour exclusion éventuelle de l'analyse.

## Notes d'implémentation

- L'évaluation des flags côté serveur vit dans la couche BFF qui sert `bootstrap` (ADR 0009, garde-fou n°5) ; `monetization` consomme une variante déjà résolue et ne parle jamais à PostHog.
- Nommage : `exp_paywall_variant`, valeurs explicites (`control`, `variant_b`), jamais de booléen pour une expérimentation à plus de deux bras.
- `ph_paywall_variant` posé via les attributs RevenueCat avant l'appel d'achat, et inclus dans le corps de `POST /v1/subscriptions/intents`.
- Intégration native RevenueCat → PostHog activée pour les événements de revenu ; aucune réémission manuelle en double, sous peine de doubler les conversions.
- Toute expérimentation est close explicitement : flag supprimé, variante gagnante figée en dur, ADR mis à jour si la décision est structurante.

## Liens

- ADR 0009 — Contrat API (définit `/v1/mobile/bootstrap`)
- ADR 0012 — Stratégie analytics (flags évalués côté serveur, taxonomie d'événements)
- ADR 0013 — Modèle d'entitlement multi-tenant
- ADR 0014 — RevenueCat comme adapter, backend source de vérité
- ADR 0015 — Séparation abonnements / consommables et ledger
