# 0051 — Un parcours de personnalisation suit l'inscription, se termine sur un paywall Turbo natif, et se mesure dans PostHog dès la tranche 1

- Statut : Proposé
- Date : 2026-11-05
- Décideurs : Muhammed Cavus
- Amende : ADR 0003 (périmètre de la tranche 1), ADR 0021 (cartographie : Turbo et préférences de visionnage), ADR 0016 (rendu du paywall, et attribution de la variante pour Turbo tant que `monetization` n'existe pas)

## Contexte et problématique

Un compte qui vient d'être créé arrive sur « You're all set » (`AllSetScreen`, ADR 0040), puis directement sur l'accueil. Rien ne lui demande ce qu'il aime regarder : la page des catégories suivies reste vide, l'apparence et le chat gardent leurs réglages par défaut, et aucune mesure ne dit où les nouveaux comptes décrochent.

Le décideur ajoute à la tranche 1 trois choses qui n'y étaient pas :

- un **parcours de personnalisation** de onze pages, montré une seule fois, après l'inscription ;
- l'**analytics PostHog sur iOS**, qui trace tout ce parcours ;
- un **paywall Turbo facultatif** en dernière page. Turbo est un abonnement **global à l'app**, porté par un entitlement RevenueCat global.

Chacune heurte un ADR accepté :

- **ADR 0003** borne la tranche 1 à « un streamer lance un live, un viewer le regarde et chatte », et `monetization` y est à « Non : aucun code ».
- **ADR 0021** place l'abonnement et l'entitlement en T3, et ne connaît ni Turbo ni les préférences de visionnage (centres d'intérêt, filtres de contenu, langue des lives). Sa règle §10 exige un ADR pour toute entité absente de la cartographie.
- **ADR 0016** confie le **rendu** du paywall à RevenueCat Paywalls. Le décideur veut un rendu natif SwiftUI, fidèle à la référence (ADR 0036). L'ADR 0016 attribue aussi la variante sur la `PurchaseIntent` du serveur (ADR 0013), qui n'existe pas tant que `monetization` n'a pas de code.
- **ADR 0012** décrit la taxonomie, `Core/Analytics`, l'identification et le filtre PII, mais rien n'est encore construit côté iOS. Le plan des ADR range l'analytics en tranche 2 (`plans/README.md`).

Ce qui existe déjà et sert le parcours :

- `GET /v1/mobile/bootstrap` évalue les flags PostHog côté serveur et les rend au client (ADR 0009, 0012 §6, 0016) ;
- `GET /v1/categories` liste les catégories de Browse avec leurs tags (ADR 0047, 0050), et `PUT /v1/me/followed-categories/{slug}` suit une catégorie (ADR 0049) ;
- aucune route ne liste les tags existants, aucune ne lit ni n'écrit une préférence de visionnage ; les chaînes n'ont ni langue ni label de classification de contenu.

Problématique : comment faire entrer en tranche 1 un parcours de personnalisation après l'inscription, mesuré dans PostHog et conclu par un paywall Turbo natif, sans contredire en silence le périmètre (0003, 0021), la règle des droits (0014) et la répartition PostHog / RevenueCat (0016) ?

## Facteurs de décision

- **Déclencheur strict** : le parcours suit l'inscription et elle seule ; une reconnexion n'y passe jamais.
- **Fidélité à la référence** (ADR 0036) : les pages reprennent les captures `parametres/`, `onboarding/` et `abonnement/`, y compris le paywall Turbo.
- **Un seul système d'assignation** (ADR 0016) : la variante vient de `bootstrap`, jamais d'une évaluation locale ni de RevenueCat.
- **Le client ne décide d'aucun droit** (ADR 0014) : `customerInfo` ne sert qu'à l'affichage.
- **Taxonomie typée, sans PII, sans écran** (ADR 0012).
- **Accessibilité** : Réduire les animations, mode silencieux et réglages haptiques du système sont respectés sans exception.
- **Contrainte d'intégration** : l'app ne lie que les produits `DesignSystem`, `Networking`, `Onboarding` et `Auth` du package local, et le projet Xcode ne se modifie pas dans une PR d'agent.
- **Réversibilité** : ce qui n'a pas encore de consommateur serveur ne crée pas d'entité serveur (ADR 0003, « pas de contexte vide »).

## Options envisagées

### Sur l'entrée du parcours et de Turbo dans la tranche 1

#### Option A — Garder le périmètre de 0003 et 0021, reporter le parcours et Turbo

- **Avantages** : aucun amendement ; la tranche 1 reste centrée sur le live et le chat.
- **Inconvénients** : le décideur veut mesurer l'activation des nouveaux comptes et la conversion vers Turbo dès la tranche 1.
- **Écartée** par le décideur.

#### Option B — Parcours et Turbo en tranche 1, côté client, sans module `monetization` dans l'API

- **Avantages** : le parcours, l'analytics et l'achat se livrent sans ouvrir le contexte `monetization` ni son pipeline de webhooks ; les règles de 0014 restent vraies, puisque Turbo n'ouvre aucun droit vérifié par l'API en T1.
- **Inconvénients** : l'attribution du revenu à la variante n'a pas d'autorité serveur avant `monetization` ; Turbo ne débloque rien de vérifiable côté serveur en T1.
- **Retenue.**

### Sur le rendu du paywall

#### Option C — RevenueCat Paywalls, comme le prévoit l'ADR 0016

- **Avantages** : modifiable sans release App Store ; mentions légales, prix et restauration rendus par le fournisseur.
- **Inconvénients** : rendu générique, loin de `abonnement/turbo--defaut` et `turbo--avantages-deplies` ; les valeurs visuelles ne passent pas par les tokens (ADR 0019).
- **Écartée** par le décideur.

#### Option D — Rendu natif SwiftUI, RevenueCat garde offres, prix et achat

- **Avantages** : fidélité à la référence, tokens et rôles du design system, animations et retours haptiques cohérents avec le parcours.
- **Inconvénients** : chaque changement de présentation demande une release ; les éléments obligatoires d'un écran d'abonnement sont à notre charge.
- **Retenue.**

### Sur l'emplacement des préférences de visionnage

#### Option E — Sur l'appareil, recopiées en propriétés de personne PostHog

- **Avantages** : aucune entité serveur sans consommateur ; l'app lit ses préférences sans réseau ; les propriétés de personne segmentent le funnel.
- **Inconvénients** : perdues à la réinstallation et absentes d'un second appareil ; une future lecture serveur demandera une reprise depuis l'appareil.
- **Retenue** pour les préférences que seul l'appareil lit.

#### Option F — Sur le serveur, dans une nouvelle entité

- **Avantages** : survivent à l'appareil ; prêtes pour la recommandation.
- **Inconvénients** : crée une entité, une migration et des routes que rien ne lit en T1 (la recommandation est T3, ADR 0021), et un propriétaire à choisir sans use-case.
- **Écartée** en tranche 1 : aucun lecteur serveur. Elle revient avec le premier.

#### Option G — Dans PostHog seulement, comme propriétés de personne

- **Avantages** : rien à stocker de notre côté.
- **Inconvénients** : PostHog répond à « que font les utilisateurs », il n'est la source d'aucune donnée produit (ADR 0012 §5) ; l'app ne relit pas ses propres réglages depuis l'analytics.
- **Écartée.**

Le suivi des catégories, lui, est déjà tranché : il vit dans `channel` (ADR 0049).

## Décision

**Options B et D.** Pour les préférences, **option E**, sauf le suivi des catégories qui reste sur le serveur.

### 1. Le parcours suit l'inscription, une seule fois

- Il s'ouvre juste après `AllSetScreen`, quand `SessionStore` vient de terminer une inscription (`isGreetingNewAccount`). Une connexion à un compte existant arrive sur l'accueil sans passer par le parcours.
- Onze pages, dans cet ordre : intro, catégories à suivre, centres d'intérêt par tags, préférences de contenu, langue des lives, apparence, lecture auto des vidéos, notifications, chat (taille du texte, horodatage), récap animé, paywall Turbo.
- Chaque page de choix se passe. Le parcours se termine une fois ; l'appareil retient qu'il a été terminé pour ce compte, et ne le rejoue pas à la relance.
- La page notifications montre l'écran de la référence puis l'alerte système. La tranche 1 ne demande que l'autorisation : l'enregistrement APNs et le jeton vont avec le contexte `notification` (T2, ADR 0003).

### 2. Turbo entre en tranche 1, côté client

- Turbo est un abonnement **global à l'app**, distinct de l'abonnement de chaîne de l'ADR 0013. RevenueCat porte un entitlement global `turbo` ; l'`appUserID` est l'ID utilisateur stable du backend, posé par `logIn` dès la session ouverte, retiré par `logOut` à la déconnexion (ADR 0014).
- `customerInfo` sert à l'affichage seulement : ne plus proposer le paywall à un abonné, afficher l'état « abonné ». **Aucun droit vérifié par l'API ne dépend de Turbo en tranche 1.** Le premier avantage de Turbo qu'un serveur doit faire respecter attend le module `monetization` et ses webhooks (ADR 0014, règle 2).
- L'API n'a toujours pas de module `monetization` en tranche 1 (ADR 0003).
- Les avantages que Turbo vend en tranche 1 sont fixés par le décideur avant la PR du paywall (voir Points ouverts du README).

### 3. Où vivent les préférences

| Préférence                         | Emplacement en T1                            | Lecteur en T1                     |
| ---------------------------------- | -------------------------------------------- | --------------------------------- |
| Catégories suivies                 | Serveur, `channel` (ADR 0049)                | `discovery`, en-tête de catégorie |
| Centres d'intérêt (tags)           | Appareil, recopiés en propriété de personne  | Aucun écran ; analyse             |
| Préférences de contenu             | Appareil, recopiées en propriété de personne | Aucun écran ; analyse             |
| Langue des lives                   | Appareil, recopiée en propriété de personne  | Aucun écran ; analyse             |
| Apparence (système, sombre, clair) | Appareil                                     | Racine de l'app                   |
| Lecture auto des vidéos            | Appareil                                     | Lecture automatique de l'app      |
| Chat : taille du texte, horodatage | Appareil                                     | `Chat`                            |

- Les préférences de l'appareil passent par un protocole de `Domain`, implémenté sur `UserDefaults` ; aucune feature ne lit `UserDefaults` directement.
- Les propriétés de personne PostHog sont une **copie pour l'analyse**, jamais relue par l'app ni par l'API. Elles ne portent que des valeurs fermées (identifiants de tag, codes de langue, booléens) : aucun texte saisi.
- Le premier ADR qui fait lire une de ces préférences par le serveur (recommandation, filtrage des lives) lui donne un propriétaire serveur et reprend la valeur de l'appareil à la connexion suivante.

### 4. Paywall natif, RevenueCat aux offres et à l'achat (amende l'ADR 0016)

- Le paywall est une vue SwiftUI qui reprend `abonnement/turbo--defaut` et `turbo--avantages-deplies`, valeurs par les tokens (ADR 0019).
- RevenueCat fournit l'offre, le prix localisé, la période, l'achat et la restauration. L'app n'écrit aucun prix en dur.
- Le paywall natif rend lui-même : le prix et la période issus de l'offre, le renouvellement automatique, les liens vers les conditions et la politique de confidentialité, le bouton de restauration et la fermeture.
- **Ce qui ne change pas dans l'ADR 0016** : PostHog reste la seule source d'assignation ; la variante vient de `bootstrap`, évaluée une fois côté serveur et figée pour la session ; RevenueCat Experiments reste interdit ; sans variante, le client affiche l'offre par défaut et n'émet aucun événement d'exposition.
- La correspondance variante → offering reste en un point unique côté serveur : le module `mobile` (BFF) la résout et `bootstrap` rend l'identifiant d'offering à côté de la variante.
- **Attribution de la variante pour Turbo en tranche 1.** Sans `PurchaseIntent` serveur, l'attribution passe par l'attribut d'abonné `ph_paywall_variant`, posé avant l'achat (ADR 0016, Notes), et par l'intégration native RevenueCat → PostHog. Elle ne fait pas foi au sens de l'ADR 0016 : la `PurchaseIntent` redevient l'autorité dès que `monetization` existe.

### 5. Animations, sons et vibrations

- Chaque page s'anime au niveau de `Welcome.swift` : entrées décalées, ressorts, transitions entre pages, récap animé.
- **Réduire les animations** activé : les déplacements, ressorts et effets de parallaxe deviennent un fondu court ; le récap s'affiche dans son état final.
- Les retours sont des **rôles** du design system (sélection, validation, succès, erreur), pas des appels épars : un rôle associe un retour haptique et, s'il y en a un, un son.
- **Vibrations** : `sensoryFeedback` de SwiftUI, qui suit le réglage haptique du système.
- **Sons** : courts, joués sur une session audio `.ambient`. Cette catégorie se tait quand le commutateur est sur silencieux, et se mélange à la musique en cours au lieu de la couper.
- Les fichiers sonores vivent dans les ressources de `DesignSystem`. Un son absent ne bloque rien : le rôle joue alors sa vibration seule.

### 6. Événements du funnel

Convention de l'ADR 0012 : `objet:action_au_passé`, propriétés en `snake_case`, aucune PII, aucun écran. Source : client, sauf mention.

| Événement                          | Propriétés                                                 | Quand                                                  |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| `onboarding:started`               | `step_count`                                               | Première page affichée                                 |
| `onboarding:step_completed`        | `step`, `step_index`, `duration_ms`, `selection_count`     | Page validée                                           |
| `onboarding:step_skipped`          | `step`, `step_index`                                       | Page passée                                            |
| `onboarding:completed`             | `duration_ms`, `skipped_step_count`                        | Récap atteint                                          |
| `preference:changed`               | `preference`, `value`, `source` (`onboarding`, `settings`) | Un réglage d'appareil change                           |
| `notification_permission:answered` | `is_granted`                                               | Réponse à l'alerte système                             |
| `paywall:viewed`                   | `variant`, `offering_id`, `placement` (`onboarding`)       | Exposition à l'offre, seulement si une variante existe |
| `paywall:dismissed`                | `variant`, `placement`                                     | Fermeture sans achat                                   |
| `purchase:started`                 | `product_id`, `variant`                                    | Tap sur l'achat                                        |
| `purchase:cancelled`               | `product_id`, `variant`                                    | Annulation dans la feuille StoreKit                    |
| `purchase:failed`                  | `product_id`, `variant`, `error_code`                      | Échec de l'achat                                       |
| `purchase:restored`                | `has_active_entitlement`                                   | Fin d'une restauration                                 |

- `step` est un enum fermé : `intro`, `categories`, `interests`, `content_preferences`, `live_language`, `appearance`, `video_autoplay`, `notifications`, `chat`, `summary`. `preference` aussi : `appearance`, `video_autoplay`, `chat_text_size`, `chat_timestamps`, `live_language`, `content_filters`, `interests`.
- Le revenu ne part jamais du client (ADR 0012 §3). En tranche 1, il arrive par l'intégration native RevenueCat → PostHog, serveur à serveur.
- Suivre une catégorie est un fait métier, donc capturé côté serveur (ADR 0012 §3) avec l'`AnalyticsPort` de l'API. Jusque-là, le parcours en porte le compte dans `selection_count`.
- `identify()` à la transition vers « connecté », une fois ; `reset()` à la déconnexion (ADR 0012 §2). Les deux vivent dans `Core/Analytics`.
- Le flag `exp_paywall_variant` (valeurs `control`, `variant_b`…) vient de `bootstrap`.

## Conséquences

### Positives

- Un nouveau compte suit des catégories et règle l'app dès sa première minute, et le funnel d'activation est mesuré du premier écran au paywall.
- Turbo se vend dès la tranche 1 sans ouvrir `monetization` : aucun pipeline de webhooks à exploiter avant d'en avoir besoin.
- Le paywall est fidèle à la référence et partage les tokens, les animations et les retours du parcours.
- L'assignation des variantes reste unique (ADR 0016) : l'expérimentation de paywall démarre sur la même mécanique que le reste du produit.
- Aucune entité serveur sans lecteur : les préférences d'appareil se défont en une PR.

### Négatives

- La tranche 1 grossit d'une quinzaine de PR, sans rapport avec son objectif de live et de chat.
- Changer la présentation du paywall demande une release App Store : la valeur que l'ADR 0016 gardait chez RevenueCat Paywalls est perdue.
- Les éléments obligatoires d'un écran d'abonnement (prix, période, renouvellement, conditions, restauration) sont à notre charge.
- L'attribution du revenu à la variante ne fait pas foi en tranche 1 : elle dépend de l'attribut d'abonné et de l'intégration RevenueCat → PostHog.
- Les événements de revenu de l'intégration native RevenueCat portent les noms du fournisseur, hors de notre taxonomie.
- Les préférences de l'appareil se perdent à la réinstallation et ne suivent pas le compte sur un autre appareil.
- Trois pages (centres d'intérêt, préférences de contenu, langue) enregistrent des choix que rien n'applique en tranche 1 : les chaînes n'ont ni langue ni label de contenu, et la recommandation est T3.
- Sans reverse proxy (ADR 0012 §4, qui attend l'hébergement, ADR 0028), le SDK envoie directement à l'hôte PostHog.
- Deux SDK tiers entrent dans l'app, non annotés pour Swift 6 strict.

### Risques et mitigations

- **Turbo ne débloque rien en tranche 1.** Les avantages de la référence (sans publicité, stockage des VOD, emotes, couleurs, badge) sont hors scope, « plus tard » ou T3 (ADR 0021). Un abonnement sans contrepartie est refusé à la revue App Store et trompe l'acheteur. Mitigation : le décideur fixe les avantages livrés en T1 avant la PR du paywall ; d'ici là, l'achat ne se fait qu'en sandbox StoreKit.
- **Une inscription qui retombe sur un compte existant.** `isGreetingNewAccount` vient de l'intention « S'inscrire », pas d'un fait serveur. Mitigation : tester ce cas, et brancher le déclencheur sur un signal serveur de création de compte s'il dévie.
- **Fuite de PII dans les propriétés de personne.** Mitigation : valeurs fermées seulement, filtre de sortie de `Core/Analytics` et test sur les schémas Zod (ADR 0012 §1).
- **Exposition comptée sans variante.** Mitigation : `paywall:viewed` n'est émis que si `bootstrap` a rendu une variante, avec un test dédié (ADR 0016).
- **Offering renommé chez RevenueCat.** Mitigation : correspondance en un point côté serveur, repli sur l'offering courant, jamais de paywall vide (ADR 0016).
- **Sons gênants.** Mitigation : catégorie `.ambient`, sons courts, aucun son sans geste de l'utilisateur.
- **SDK tiers et Swift 6.** Mitigation : enveloppes `actor` ou `@MainActor` dans `Core/*`, `@preconcurrency import` localisé (ADR 0010).

## Notes d'implémentation

- Ordre : PostHog d'abord (taxonomie, `Core/Analytics`, identification, flag), puis le parcours, puis les sons et vibrations, puis RevenueCat et le paywall. Découpage : [`plans/onboarding-paywall.md`](../../plans/onboarding-paywall.md).
- Nouveaux targets du package : `Analytics` (`Core/Analytics`), `Preferences` (`Core/Preferences`), `Purchases` (`Core/Purchases`), `Paywall` (`Features/Paywall`). Ils entrent dans l'app par la liste de targets du produit `Onboarding`, sans toucher au projet Xcode.
- Le parcours vit dans `Features/Onboarding` ; le paywall dans `Features/Paywall`. Aucune des deux n'importe l'autre (ADR 0010, règle 4) : la racine de l'app les enchaîne.
- Dépendances SPM : `posthog-ios` et `purchases-ios-spm`, en version exacte, dans `apps/ios/Packages/Package.swift` et `Package.resolved`.
- Clés : la clé de projet PostHog, son hôte et la clé SDK publique RevenueCat se lisent dans `apps/ios/Info.plist`. Clé absente : adapter sans effet, l'app démarre.

## Liens

- ADR 0003 — Bounded contexts (périmètre de la tranche 1, amendé)
- ADR 0010 — Modularisation iOS (`Core/Analytics`, règle 4, SDK tiers en Swift 6)
- ADR 0012 — Analytics (taxonomie, identification, PII, capture serveur du revenu)
- ADR 0013 — Abonnement de chaîne (distinct de Turbo)
- ADR 0014 — Backend source de vérité des droits (`appUserID`, `customerInfo` pour l'affichage)
- ADR 0016 — PostHog / RevenueCat (rendu du paywall amendé, assignation conservée)
- ADR 0019 — Design tokens (valeurs du parcours et du paywall)
- ADR 0021 — Cartographie (Turbo et préférences de visionnage ajoutés)
- ADR 0036 — Valeurs visuelles de la référence (pages du parcours, paywall)
- ADR 0040 — Illustration de « You're All Set! » (écran qui précède le parcours)
- ADR 0049 — Suivi d'une catégorie (page 2 du parcours)
- ADR 0050 — Tags d'une catégorie (page 3 du parcours)
