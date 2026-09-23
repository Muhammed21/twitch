# 0017 — Modèle de reversement aux streamers : split sur le net encaissé

- Statut : Proposé — principes arrêtés et implémentables ; ouverture du canal web conditionnée au cadre fiscal (voir « Questions à trancher avec un conseil fiscal »)
- Date : 2026-09-23
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0015 établit que les abonnements de chaîne et les bits transitent par des canaux d'encaissement différents selon la plateforme, chacun prélevant sa propre commission. Il en tire une conséquence qu'aucun ADR ne traite encore : **la part reversée au streamer doit être calculée sur ce que la plateforme encaisse réellement, et non sur ce que le viewer paie.**

La formulation naturelle — « le streamer touche 50 % » — est ambiguë, et l'ambiguïté coûte de l'argent. Sur iOS, Apple prélève sa commission avant que le moindre euro n'atteigne la plateforme. Promettre 50 % du montant affiché revient à promettre une part d'une somme jamais encaissée.

Chiffrage pour un abonnement à 4,99 € TTC (TVA 20 %, part streamer 50 %) :

| Canal | Encaissé par la plateforme | Split sur le **brut payé** | Split sur le **net encaissé** |
|---|---|---|---|
| iOS, commission Apple 30 % | 2,91 € | streamer 2,50 € → **plateforme 0,41 €** | streamer 1,46 € → plateforme 1,46 € |
| iOS, Small Business Program 15 % | 3,54 € | streamer 2,50 € → plateforme 1,04 € | streamer 1,77 € → plateforme 1,77 € |
| Web, Stripe ≈ 1,5 % + 0,25 € | 3,85 € | streamer 2,50 € → plateforme 1,35 € | streamer 1,93 € → plateforme 1,92 € |

La colonne « split sur le brut » sur la première ligne est le cœur du problème : **0,41 € pour couvrir l'ingest, le transcodage, la bande passante CDN et l'infrastructure** d'un abonné qui regarde potentiellement des dizaines d'heures par mois (ADR 0001). Selon la consommation réelle, cette ligne est au mieux à l'équilibre, au pire structurellement déficitaire — et elle se dégrade à mesure que le produit réussit, ce qui en fait le pire type de défaut économique.

Un second problème suit : une fois un reversement effectué, il est irréversible en pratique. Un remboursement Apple survenant après le virement laisse un solde négatif chez un streamer qui a déjà dépensé l'argent.

## Facteurs de décision

- Ne jamais reverser une part d'une somme non encaissée.
- Réversibilité limitée des virements : la fenêtre de remboursement doit être absorbée **avant** le paiement, pas rattrapée après.
- Charge de conformité (KYC, fiscalité, déclarations) compatible avec un développeur solo.
- Auditabilité : un streamer doit pouvoir reconstituer son gain à l'euro près, ligne par ligne.
- Idempotence stricte : un double virement n'est pas récupérable par un correctif technique.
- Cohérence avec le ledger append-only de l'ADR 0015.

## Options envisagées

**Option A — Split sur le montant affiché (brut payé par le viewer).** Simple à comprendre et à communiquer, aligné sur l'intuition du streamer. Mais il transfère intégralement le risque de commission à la plateforme, et ce risque varie selon un canal que la plateforme ne choisit pas — c'est le viewer qui décide d'acheter sur iOS ou sur le web. Écarté : une marge qui dépend d'un choix que l'on ne contrôle pas n'est pas un modèle économique.

**Option B — Split sur le net encaissé, taux unique.** La plateforme reverse un pourcentage de ce qu'elle a réellement reçu, après commission du canal d'encaissement. Le streamer touche mécaniquement moins sur un achat iOS que sur un achat web, pour le même prix affiché. Le risque de commission est partagé au prorata. Inconvénient réel : c'est plus difficile à expliquer, et un streamer peut recevoir deux montants différents pour deux abonnements au même prix.

**Option C — Split sur le net, avec lissage par la plateforme.** Un taux effectif unique affiché au streamer, la plateforme absorbant l'écart entre canaux. Confortable pour le streamer, mais cela revient à l'option A dès que la part iOS du chiffre d'affaires devient majoritaire — ce qui est le scénario probable pour une application mobile native. Écarté.

**Option D — Prix différenciés par canal.** Afficher un prix plus élevé sur iOS pour absorber la commission. Techniquement possible mais commercialement hostile, et la comparaison est immédiate pour l'utilisateur. Écarté.

## Décision

On retient **l'option B**.

### 1. Formule de reversement

```
part_streamer = (montant_brut − taxes − commission_du_canal) × taux_contractuel
```

Les trois déductions sont **constatées, jamais estimées** : elles proviennent du rapport de règlement du canal d'encaissement (rapport financier Apple, `balance_transaction` Stripe), pas d'un pourcentage supposé. Une commission estimée finit toujours par diverger du réel, et la divergence se découvre au moment de la réconciliation, c'est-à-dire trop tard.

Conséquence assumée : **le gain n'est connu qu'au règlement du canal**, pas à l'achat. L'interface streamer affiche donc deux montants distincts — *estimé* (immédiat, marqué comme tel) et *acquis* (après règlement). Ne présenter qu'un seul chiffre serait un mensonge dans un sens ou dans l'autre.

### 2. Taux contractuel versionné

Le taux est porté par un contrat daté, pas par une constante :

- Défaut : 50 %. Négociable à la hausse pour les partenaires.
- Toute modification crée une **nouvelle version** du contrat avec date d'effet ; les gains déjà constatés conservent le taux en vigueur au moment de leur constatation.
- Le taux applicable est résolu à la constatation du gain, jamais au paiement.

Sans ce versionnement, une renégociation recalculerait rétroactivement des mois de gains déjà affichés au streamer.

### 3. Stripe Connect Express

**Express**, pas Custom ni Standard :

- **Standard** rendrait le streamer marchand de son propre compte, ce qui ne correspond pas au modèle (la plateforme encaisse, puis reverse).
- **Custom** impose de porter soi-même l'onboarding, la collecte KYC, la gestion des pièces justificatives et les obligations de conformité associées — inenvisageable en solo.
- **Express** délègue à Stripe l'onboarding, la vérification d'identité, la collecte des informations fiscales et le tableau de bord des paiements, tout en gardant la plateforme comme encaisseur.

Un streamer sans compte Connect vérifié **accumule des gains mais ne reçoit aucun virement**. Le reversement est bloqué, pas perdu.

### 4. Ledger de gains et cycle de paiement

Les gains étendent le ledger append-only de l'ADR 0015 : chaque gain constaté est une écriture immuable référençant sa transaction d'origine, son canal, le montant encaissé, le taux appliqué et la version du contrat. Aucun `UPDATE` sur un solde.

Cycle retenu :

- **Période de rétention de 45 jours** entre la constatation du gain et son éligibilité au virement. C'est le mécanisme principal de protection contre les remboursements : la quasi-totalité des remboursements Apple et des contestations de paiement survient dans cette fenêtre.
- **Virement mensuel**, le même jour ouvré pour tous.
- **Seuil minimum de 50 €**. En dessous, le solde est reporté — les frais fixes de virement rendent les petits montants absurdes.
- Un virement est un **lot** d'écritures de ledger, jamais un montant recalculé. Le lot est figé avant l'appel à Stripe.

### 5. Idempotence des virements

Chaque lot porte une clé d'idempotence stable, dérivée de `(streamerId, période)` et **persistée avant l'appel à Stripe**, pas générée à la volée. L'ordre est imposé : écriture de l'intention de virement en base → appel Stripe avec la clé → enregistrement du résultat. Un crash entre les deux premières étapes ne paie rien ; un crash entre les deux dernières est rattrapé par la reprise, qui retrouve la même clé et n'émet pas de second virement.

C'est le point du système où une erreur n'a pas de correctif technique : l'argent est parti.

### 6. Remboursement postérieur au virement

Cohérent avec la politique de l'ADR 0015 : **la plateforme absorbe**, sans reprise sur les gains futurs du streamer.

Ce n'est pas de la générosité, c'est un arbitrage : reprendre sur les gains futurs suppose un solde négatif visible côté streamer, une communication à gérer et un cas limite pour le streamer qui ne gagne plus rien. Le coût de ces mécanismes dépasse le montant en jeu au volume visé. La période de rétention de 45 jours est le vrai instrument de maîtrise du risque ; ce choix devra être réexaminé si le montant absorbé devient significatif.

### 7. Devises

Les gains sont constatés et accumulés en **euros**, devise de référence de la plateforme. La conversion utilise le taux effectivement appliqué dans le rapport de règlement du canal, jamais un taux de marché récupéré ailleurs. Stripe Connect gère la conversion vers la devise du compte du streamer au moment du virement ; l'écart de change est visible sur la ligne de virement, pas dissimulé dans le calcul du gain.

### 8. Réconciliation à trois voies

Mensuellement, et de manière automatisée : **rapport de règlement du canal** ↔ **événements RevenueCat / Stripe** ↔ **ledger interne**. Tout écart supérieur à un centime est remonté et bloque la campagne de virement tant qu'il n'est pas expliqué.

Sans cette réconciliation, une divergence silencieuse s'accumule jusqu'au jour où elle est découverte par un streamer contestant ses revenus — c'est-à-dire dans les pires conditions possibles.

## Conséquences

### Positives

- La marge de la plateforme ne dépend plus du canal d'achat choisi par le viewer.
- Le calcul repose sur des montants constatés : il est reproductible et opposable.
- La rétention de 45 jours élimine la quasi-totalité des reprises après virement.
- Stripe Connect Express retire la charge KYC et une partie de la charge fiscale, décisive en solo.
- Le ledger rend chaque euro traçable jusqu'à sa transaction d'origine.

### Négatives

- **Le streamer touche moins sur iOS que sur le web pour le même prix affiché.** C'est structurel, visible, et cela demandera une page d'explication honnête plutôt qu'une tentative de le masquer.
- Le gain n'est pas connu immédiatement : deux montants à afficher, donc davantage d'interface et un concept de plus à expliquer.
- 45 jours de rétention plus un cycle mensuel signifient jusqu'à 75 jours entre l'abonnement et le virement. C'est long pour un petit streamer.
- La réconciliation à trois voies est un travail récurrent qui n'existerait pas avec un modèle plus naïf.

### Risques et mitigations

- **Risque : statut de redevable de la TVA selon le canal.** Pour les achats intégrés, Apple agit comme vendeur et gère la TVA. Pour les encaissements web via Stripe, **la plateforme est vendeur** et porte ses propres obligations déclaratives, y compris le guichet unique européen. Ce n'est pas un détail d'implémentation : cela change qui déclare quoi. **Cette question doit être tranchée avec un conseil fiscal avant tout encaissement web réel**, et elle conditionne le passage de cet ADR au statut `Accepté`.
- **Risque : obligations déclaratives sur les revenus reversés.** Reverser des revenus à des tiers entraîne des obligations de déclaration variables selon la juridiction du streamer. Stripe Connect en couvre une partie, pas nécessairement la totalité. À cadrer avec le même conseil.
- **Risque : rapports de règlement plus tardifs que prévu.** Si le rapport financier d'un canal arrive après la date de virement, des gains constatés glissent d'un cycle. Mitigation : le cycle de virement se déclenche sur la **disponibilité des rapports**, jamais sur une date calendaire fixe.
- **Risque : incitation à contourner l'application iOS.** Le modèle rend l'achat web nettement plus intéressant pour le streamer, qui aura une raison directe d'y pousser son audience. Les règles encadrant les liens d'achat externes ont évolué (États-Unis 2025, DMA en Europe), sont juridictionnelles et continuent de bouger : **à vérifier dans les App Store Review Guidelines en vigueur au moment de l'implémentation**, sans se fier à une connaissance antérieure. Une communication imprudente sur ce point peut coûter la présence sur l'App Store.
- **Risque : ce modèle n'a jamais été confronté à un vrai streamer.** Les taux, seuils et délais retenus sont des hypothèses raisonnables, pas des valeurs validées. Ils doivent rester des paramètres de configuration, pas des constantes dans le code.

## Questions à trancher avec un conseil fiscal

Ce qui bloque le passage en `Accepté` n'est pas technique et ne se résout pas en lisant de la documentation : cela dépend de la forme juridique, du pays d'établissement et du pays de résidence de chaque streamer. La liste ci-dessous est le brief, formulé pour qu'une seule séance suffise. **Aucune des réponses n'est supposée ici.**

**A. Redevable de la TVA selon le canal**

1. Pour les achats intégrés iOS, Apple intervient comme intermédiaire et gère la TVA à destination. Quelles obligations déclaratives cela laisse-t-il à notre charge, le cas échéant ?
2. Pour les encaissements web via Stripe, Stripe n'est **pas** vendeur : la plateforme l'est. Cela déclenche-t-il une obligation de TVA dans le pays de chaque acheteur, et le guichet unique (OSS) est-il la bonne modalité ?
3. Existe-t-il un seuil en dessous duquel ces obligations ne s'appliquent pas, et à partir de quel chiffre d'affaires bascule-t-on ?
4. Faut-il, en pratique, retarder l'ouverture du canal web tant que ce cadre n'est pas en place ?

**B. Nature de la relation avec le streamer**

5. Le reversement est-il un achat de prestation au streamer, un partage de recettes, ou autre chose ? La réponse détermine qui facture qui, et si nous devons émettre un auto-facturation.
6. Un streamer particulier non immatriculé peut-il être rémunéré, et à partir de quel montant doit-il se déclarer ?
7. Quelle documentation devons-nous collecter et conserver — et Stripe Connect Express en couvre-t-il la totalité ou seulement une partie ?

**C. Obligations déclaratives de plateforme**

8. Sommes-nous un opérateur de plateforme au sens des obligations européennes de déclaration des revenus des vendeurs (type DAC7) ? L'activité de création de contenu entre-t-elle dans le périmètre visé ?
9. Si oui, quelles informations devons-nous collecter dès l'inscription du streamer — car les collecter rétroactivement est bien plus coûteux que de les demander à l'onboarding.
10. Stripe Connect produit-il les déclarations attendues, ou seulement les données sous-jacentes ?

**D. Conséquence sur le calendrier**

11. Laquelle de ces obligations doit être satisfaite **avant le premier euro encaissé**, et laquelle peut l'être avant le premier euro **reversé** ? L'écart entre les deux est d'au moins 45 jours (période de rétention), et c'est la marge dont nous disposons.

Ce que la réponse change dans le code : essentiellement la collecte d'informations à l'onboarding streamer (question 9) et le moment d'ouverture du canal web (question 4). Le reste de cet ADR — formule de calcul sur le net, ledger, idempotence, rétention — ne dépend d'aucune de ces réponses et peut être construit dès maintenant.

## Notes d'implémentation

- Hors tranche verticale 1. Aucune ligne de code de reversement avant que le spike de l'ADR 0013 ne soit joué et que la question fiscale ne soit tranchée.
- Le contexte `monetization` porte les ports `PayoutPort` et `SettlementReportPort` (ADR 0014). Stripe Connect est un adapter, comme RevenueCat.
- Les montants sont manipulés en **entiers, en plus petite unité monétaire**, jamais en flottants. Un type `Money` du domaine porte montant et devise ensemble ; une devise implicite est un incident qui attend son heure.
- Les arrondis sont documentés et testés explicitement : arrondi à l'unité monétaire la plus petite, au détriment de la plateforme et non du streamer, avec la valeur résiduelle inscrite au ledger. Un test dédié couvre la somme d'un millier de micro-transactions pour vérifier l'absence de dérive.
- Le simulateur de reversement (entrée : un panier de transactions, sortie : le détail du calcul) est écrit **avant** l'intégration Stripe. Il est testable sans réseau et sert de référence à la réconciliation.
- Tests des cas limites obligatoires : remboursement avant virement, remboursement après virement, changement de taux en cours de période, streamer sans compte Connect vérifié, virement en échec puis rejoué.
