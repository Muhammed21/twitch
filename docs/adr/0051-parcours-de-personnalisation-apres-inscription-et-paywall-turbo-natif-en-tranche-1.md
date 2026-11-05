# 0051 — Un parcours de personnalisation suit l'inscription et se termine sur un paywall Turbo natif, Turbo est un droit global tenu par le serveur, et le tout se mesure dans PostHog dès la tranche 1

- Statut : Proposé
- Date : 2026-11-05
- Décideurs : Muhammed Cavus
- Amende : ADR 0003 (périmètre de la tranche 1 : parcours, et `monetization` réduit à Turbo), ADR 0013 (entitlement de portée plateforme), ADR 0016 (rendu du paywall, et attribution de la variante pour Turbo), ADR 0021 (cartographie : Turbo, badge Turbo, couleur de pseudo, préférences de visionnage)

## Contexte et problématique

Un compte qui vient d'être créé arrive sur « You're all set » (`AllSetScreen`, ADR 0040), puis directement sur l'accueil. Rien ne lui demande ce qu'il aime regarder : la page des catégories suivies reste vide, l'apparence et le chat gardent leurs réglages par défaut, et aucune mesure ne dit où les nouveaux comptes décrochent.

Le décideur ajoute à la tranche 1 trois choses qui n'y étaient pas :

- un **parcours de personnalisation** de onze pages, montré une seule fois, après l'inscription ;
- l'**analytics PostHog sur iOS**, qui trace tout ce parcours ;
- un **paywall Turbo facultatif** en dernière page. Turbo est un abonnement **global à l'app**, porté par un entitlement RevenueCat global.

En tranche 1, Turbo donne deux avantages, tous deux visibles des autres : un **badge Turbo** à côté du pseudo dans tous les chats, et une **couleur de pseudo au choix** dans le chat. Le chat doit donc savoir qui est abonné : l'entitlement est connu du serveur, par le webhook RevenueCat, puis propagé au chat.

Chacune heurte un ADR accepté :

- **ADR 0003** borne la tranche 1 à « un streamer lance un live, un viewer le regarde et chatte », et `monetization` y est à « Non : aucun code ».
- **ADR 0013** déclare l'entitlement « scopé, jamais global » : un droit porte toujours une chaîne.
- **ADR 0021** place l'abonnement, l'entitlement et les badges en T3, et ne connaît ni Turbo, ni la couleur de pseudo, ni les préférences de visionnage (centres d'intérêt, filtres de contenu, langue des lives). Sa règle §10 exige un ADR pour toute entité absente de la cartographie.
- **ADR 0016** confie le **rendu** du paywall à RevenueCat Paywalls. Le décideur veut un rendu natif SwiftUI, fidèle à la référence (ADR 0036). L'ADR 0016 attribue aussi la variante sur la `PurchaseIntent` du serveur (ADR 0013), qui sert à porter une chaîne : Turbo n'en a pas.
- **ADR 0012** décrit la taxonomie, `Core/Analytics`, l'identification et le filtre PII, mais rien n'est encore construit côté iOS. Le plan des ADR range l'analytics en tranche 2 (`plans/README.md`).

Ce qui existe déjà et sert le parcours :

- `GET /v1/mobile/bootstrap` évalue les flags PostHog côté serveur et les rend au client (ADR 0009, 0012 §6, 0016) ;
- `GET /v1/categories` liste les catégories de Browse avec leurs tags (ADR 0047, 0050), et `PUT /v1/me/followed-categories/{slug}` suit une catégorie (ADR 0049) ;
- aucune route ne liste les tags existants, aucune ne lit ni n'écrit une préférence de visionnage ; les chaînes n'ont ni langue ni label de classification de contenu ;
- le chat tient déjà une copie locale de chaque auteur, alimentée par les events d'`identity` (`identity.account.registered`, et `identity.avatar.changed` en cours), lus sur un stream Redis par contexte (ADR 0034) ;
- l'ADR 0014 décrit déjà le webhook RevenueCat : authentification, idempotence, traitement asynchrone, désordre, transfert.

Problématique : comment faire entrer en tranche 1 un parcours de personnalisation après l'inscription, mesuré dans PostHog et conclu par un paywall Turbo natif dont les avantages sont tenus par le serveur, sans contredire en silence le périmètre (0003, 0021), le modèle d'entitlement (0013), la règle des droits (0014) et la répartition PostHog / RevenueCat (0016) ?

## Facteurs de décision

- **Déclencheur strict** : le parcours suit l'inscription et elle seule ; une reconnexion n'y passe jamais.
- **Fidélité à la référence** (ADR 0036) : les pages reprennent les captures `parametres/`, `onboarding/` et `abonnement/`, y compris le paywall Turbo.
- **Un seul système d'assignation** (ADR 0016) : la variante vient de `bootstrap`, jamais d'une évaluation locale ni de RevenueCat.
- **Le client ne décide d'aucun droit** (ADR 0014) : `customerInfo` ne sert qu'à l'affichage ; le badge et la couleur qu'un autre viewer voit sont décidés par le serveur.
- **Aucun appel réseau par message dans le chat** (ADR 0014) : le chat lit les droits dans sa vue locale.
- **`identity` répond à « qui es-tu », jamais à « qu'as-tu le droit de faire »** (ADR 0003).
- **Taxonomie typée, sans PII, sans écran** (ADR 0012).
- **Accessibilité** : Réduire les animations, mode silencieux et réglages haptiques du système sont respectés sans exception.
- **Contrainte d'intégration** : l'app ne lie que les produits `DesignSystem`, `Networking`, `Onboarding` et `Auth` du package local, et le projet Xcode ne se modifie pas dans une PR d'agent.
- **Réversibilité** : ce qui n'a pas encore de consommateur serveur ne crée pas d'entité serveur (ADR 0003, « pas de contexte vide »).
- **Reproductibilité des sons** : générés par un script, sans fichier tiers ni question de licence.

## Options envisagées

### Sur l'entrée du parcours et de Turbo dans la tranche 1

#### Option A — Garder le périmètre de 0003 et 0021, reporter le parcours et Turbo

- **Avantages** : aucun amendement ; la tranche 1 reste centrée sur le live et le chat.
- **Inconvénients** : le décideur veut mesurer l'activation des nouveaux comptes et la conversion vers Turbo dès la tranche 1.
- **Écartée** par le décideur.

#### Option B — Parcours et Turbo en tranche 1, côté client seulement

- **Avantages** : aucun module `monetization`, aucun webhook à exploiter.
- **Inconvénients** : le badge et la couleur sont vus par les autres viewers ; décidés par le client, ils seraient falsifiables (ADR 0014, règle 1). Sans avantage tenu, Turbo ne vend rien.
- **Écartée.**

#### Option B' — Parcours et Turbo en tranche 1, `monetization` réduit à l'entitlement Turbo

- **Avantages** : le badge et la couleur reposent sur un droit serveur ; le webhook suit le contrat déjà écrit par l'ADR 0014 ; le chat reçoit le droit par event, comme les sanctions.
- **Inconvénients** : un contexte, un schéma, un pipeline de webhooks et une réconciliation entrent en tranche 1 ; le webhook exige une URL joignable par RevenueCat.
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

### Sur le propriétaire de la couleur de pseudo

#### Option H — `identity` garde la couleur choisie, le chat ne l'applique qu'à un abonné Turbo

- **Avantages** : la couleur est un attribut d'affichage de la personne, comme l'avatar, et voyage par le même chemin d'events ; `identity` ne lit aucun droit ; le chat vérifie Turbo dans sa vue locale, comme il le fait pour les emotes d'abonné (ADR 0021 §6).
- **Inconvénients** : un compte sans Turbo peut enregistrer une couleur qui ne s'affiche pas.
- **Retenue.**

#### Option I — `identity` refuse la couleur à un compte sans Turbo

- **Avantages** : aucune couleur enregistrée sans droit.
- **Inconvénients** : `identity` devrait projeter les entitlements et répondre à « qu'as-tu le droit de faire » (ADR 0003).
- **Écartée.**

## Décision

**Options B' et D.** Pour les préférences, **option E**, sauf le suivi des catégories qui reste sur le serveur. Pour la couleur de pseudo, **option H**.

### 1. Le parcours suit l'inscription, une seule fois

- Il s'ouvre juste après `AllSetScreen`, quand `SessionStore` vient de terminer une inscription (`isGreetingNewAccount`). Une connexion à un compte existant arrive sur l'accueil sans passer par le parcours.
- Onze pages, dans cet ordre : intro, catégories à suivre, centres d'intérêt par tags, préférences de contenu, langue des lives, apparence, lecture auto des vidéos, notifications, chat (taille du texte, horodatage), récap animé, paywall Turbo.
- Chaque page de choix se passe. Le parcours se termine une fois ; l'appareil retient qu'il a été terminé pour ce compte, et ne le rejoue pas à la relance.
- La page notifications montre l'écran de la référence puis l'alerte système. La tranche 1 ne demande que l'autorisation : l'enregistrement APNs et le jeton vont avec le contexte `notification` (T2, ADR 0003).

### 2. Turbo est un droit global, tenu par `monetization` (amende les ADR 0003 et 0013)

- Turbo est un abonnement **global à l'app**, distinct de l'abonnement de chaîne de l'ADR 0013. RevenueCat porte un entitlement global `turbo` ; l'`appUserID` est l'ID utilisateur stable du backend, posé par `logIn` dès la session ouverte, retiré par `logOut` à la déconnexion (ADR 0014).
- Le contexte `monetization` est créé en tranche 1, avec un seul use-case : tenir l'entitlement Turbo. La structure est celle de l'ADR 0014 (domaine, ports, `RevenueCatWebhookAdapter` en infrastructure) ; ni intent, ni bits, ni reversement.
- **L'entitlement gagne une portée** : `CHANNEL` (ADR 0013, inchangé) ou `PLATFORM`. Turbo est un entitlement `PLATFORM`, sans `channelId` ni tier. Un seul entitlement `PLATFORM` actif (`ACTIVE` ou `GRACE`) par utilisateur, garanti par un index unique partiel.
- **Webhook** : `POST /v1/webhooks/revenuecat`, au contrat de l'ADR 0014 : en-tête `Authorization` comparé en temps constant, validation Zod stricte, idempotence par `processed_webhook_events (provider, event_id)`, événement brut persisté puis traité hors de la requête, désordre résolu par l'horodatage du fournisseur, événement inconnu persisté, alerté et ignoré.
- Turbo n'a pas de `PurchaseIntent` : aucune chaîne à attribuer. L'acheteur est l'`app_user_id` du webhook.
- Événements traités : ceux de la table de l'ADR 0014, `TRANSFER` compris (révocation sur l'ancien compte, recréation sur le nouveau).
- `monetization` publie `monetization.entitlement.granted` et `monetization.entitlement.revoked` par son outbox, sur le stream `events.monetization` (ADR 0034). Le payload porte `userId`, `scope`, `expiresAt` ; une prolongation republie `granted` avec la nouvelle échéance.
- `GET /v1/mobile/bootstrap` rend les entitlements actifs de l'utilisateur (ADR 0014). Après un achat, l'app demande une resynchronisation (`POST /v1/me/entitlements/sync`), qui relit l'état de l'abonné chez RevenueCat et applique le même use-case que le webhook : le badge n'attend pas le webhook.
- `customerInfo` sert à l'affichage seulement : ne plus proposer le paywall à un abonné, montrer l'état « abonné » en attendant le serveur.

### 3. Badge Turbo et couleur de pseudo dans le chat (amende l'ADR 0021)

- **Badge.** Le chat dérive le badge Turbo de sa vue locale des entitlements `PLATFORM`, alimentée par `events.monetization`. Il n'est jamais stocké comme donnée de référence (ADR 0021, badges). Il s'affiche à côté du pseudo dans tous les salons.
- **Couleur.** `identity` garde la couleur choisie (`chatColor`, `#RRGGBB` ou absente), modifiée par `PUT /v1/me/chat-color`, et publie `identity.chat_color.changed`. Le chat en tient une copie dans sa vue des auteurs.
- Le chat n'applique la couleur que si l'auteur a un entitlement Turbo actif dans sa vue locale, échéance comparée à l'horloge du serveur. Sinon, la couleur par défaut du chat.
- L'auteur d'un message diffusé gagne `badges` (liste, enum ouvert, ADR 0024) et `color` facultative. Aucun appel réseau par message (ADR 0014).
- L'app ne propose le choix de la couleur qu'à un abonné Turbo.

### 4. Où vivent les préférences

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

### 5. Paywall natif, RevenueCat aux offres et à l'achat (amende l'ADR 0016)

- Le paywall est une vue SwiftUI qui reprend `abonnement/turbo--defaut` et `turbo--avantages-deplies`, valeurs par les tokens (ADR 0019).
- RevenueCat fournit l'offre, le prix localisé, la période, l'achat et la restauration. L'app n'écrit aucun prix en dur.
- Le paywall natif rend lui-même : le prix et la période issus de l'offre, le renouvellement automatique, les liens vers les conditions et la politique de confidentialité, le bouton de restauration et la fermeture.
- **Ce qui ne change pas dans l'ADR 0016** : PostHog reste la seule source d'assignation ; la variante vient de `bootstrap`, évaluée une fois côté serveur et figée pour la session ; RevenueCat Experiments reste interdit ; sans variante, le client affiche l'offre par défaut et n'émet aucun événement d'exposition.
- La correspondance variante → offering reste en un point unique côté serveur : le module `mobile` (BFF) la résout et `bootstrap` rend l'identifiant d'offering à côté de la variante.
- **Attribution de la variante pour Turbo.** Turbo n'a pas de `PurchaseIntent`, donc l'attribution passe par l'attribut d'abonné `ph_paywall_variant`, posé avant l'achat (ADR 0016, Notes), et par l'intégration native RevenueCat → PostHog. Elle ne fait pas foi au sens de l'ADR 0016.

### 6. Animations, sons et vibrations

- Chaque page s'anime au niveau de `Welcome.swift` : entrées décalées, ressorts, transitions entre pages, récap animé.
- **Réduire les animations** activé : les déplacements, ressorts et effets de parallaxe deviennent un fondu court ; le récap s'affiche dans son état final.
- Les retours sont des **rôles** du design system, pas des appels épars : un rôle associe un retour haptique et, s'il y en a un, un son. Sélection → son `tap` ; validation → `validation` ; succès → `success` ; changement de page → `transition` ; erreur → vibration seule.
- **Vibrations** : `sensoryFeedback` de SwiftUI, qui suit le réglage haptique du système.
- **Sons** : courts, joués sur une session audio `.ambient`. Cette catégorie se tait quand le commutateur est sur silencieux, et se mélange à la musique en cours au lieu de la couper.
- **Les quatre sons sont générés par un script** de synthèse courte (formes d'onde, enveloppes et fréquences en constantes, aucun aléa), versionné dans le dépôt. Les fichiers produits sont commités dans les ressources de `DesignSystem` et vérifiés par la tâche `generate` (ADR 0018) : un fichier qui diverge de son générateur fait échouer la CI.
- Un son absent ne bloque rien : le rôle joue alors sa vibration seule.

### 7. Événements du funnel

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
- Le revenu ne part jamais du client (ADR 0012 §3). Il arrive par l'intégration native RevenueCat → PostHog, serveur à serveur, sans réémission par notre webhook (ADR 0016, Notes).
- Suivre une catégorie est un fait métier, donc capturé côté serveur (ADR 0012 §3) avec l'`AnalyticsPort` de l'API. Jusque-là, le parcours en porte le compte dans `selection_count`.
- `identify()` à la transition vers « connecté », une fois ; `reset()` à la déconnexion (ADR 0012 §2). Les deux vivent dans `Core/Analytics`.
- Le flag `exp_paywall_variant` (valeurs `control`, `variant_b`…) vient de `bootstrap`.

## Conséquences

### Positives

- Un nouveau compte suit des catégories et règle l'app dès sa première minute, et le funnel d'activation est mesuré du premier écran au paywall.
- Turbo vend en tranche 1 des avantages réels, que le client ne peut pas falsifier : le badge et la couleur viennent du serveur.
- Le webhook, l'idempotence et le traitement du cycle de vie écrits pour Turbo serviront tels quels à l'abonnement de chaîne en T3.
- Le paywall est fidèle à la référence et partage les tokens, les animations et les retours du parcours.
- L'assignation des variantes reste unique (ADR 0016) : l'expérimentation de paywall démarre sur la même mécanique que le reste du produit.
- Les sons sont reproductibles et sans licence à suivre.
- Aucune entité serveur sans lecteur : les préférences d'appareil se défont en une PR.

### Négatives

- La tranche 1 grossit de près de trente PR, sans rapport avec son objectif de live et de chat.
- Un contexte de plus en tranche 1 (`monetization`), avec son schéma, son outbox, son webhook et sa réconciliation à exploiter.
- L'entitlement de l'ADR 0013 n'est plus « jamais global » : deux portées à distinguer dans chaque requête de droit.
- Changer la présentation du paywall demande une release App Store : la valeur que l'ADR 0016 gardait chez RevenueCat Paywalls est perdue.
- Les éléments obligatoires d'un écran d'abonnement (prix, période, renouvellement, conditions, restauration) sont à notre charge.
- L'attribution du revenu à la variante ne fait pas foi : elle dépend de l'attribut d'abonné et de l'intégration RevenueCat → PostHog.
- Les événements de revenu de l'intégration native RevenueCat portent les noms du fournisseur, hors de notre taxonomie.
- Un compte sans Turbo peut garder une couleur enregistrée qui ne s'affiche pas.
- Les préférences de l'appareil se perdent à la réinstallation et ne suivent pas le compte sur un autre appareil.
- Trois pages (centres d'intérêt, préférences de contenu, langue) enregistrent des choix que rien n'applique en tranche 1 : les chaînes n'ont ni langue ni label de contenu, et la recommandation est T3.
- Sans reverse proxy (ADR 0012 §4, qui attend l'hébergement, ADR 0028), le SDK envoie directement à l'hôte PostHog.
- Deux SDK tiers entrent dans l'app, non annotés pour Swift 6 strict.

### Risques et mitigations

- **Webhook injoignable.** RevenueCat appelle une URL publique, et l'hébergement n'est pas choisi (ADR 0028). Mitigation : un tunnel vers l'API locale en développement ; la resynchronisation après achat accorde le droit sans webhook ; le premier déploiement joignable ouvre l'ADR d'hébergement.
- **Webhook perdu ou file en panne : achat payé sans badge.** Mitigation : resynchronisation à la demande de l'app, et réconciliation (ADR 0014).
- **Vue des droits du chat périmée** après une révocation. Mitigation : invalidation par `monetization.entitlement.revoked`, et échéance comparée à l'horloge à chaque message.
- **Couleur illisible** sur le fond du chat, en thème clair ou sombre. Mitigation : à décider avec le décideur (palette fermée, ou ajustement de contraste à l'affichage comme « Readable Colors » de `chat/parametres-chat--defaut`).
- **Écart à la référence.** Le sélecteur de couleur et le glyphe du badge Turbo n'ont pas de capture dans `docs/reference-ui/`. Mitigation : leur rendu se décide avec le décideur avant les PR iOS concernées.
- **Une inscription qui retombe sur un compte existant.** `isGreetingNewAccount` vient de l'intention « S'inscrire », pas d'un fait serveur. Mitigation : tester ce cas, et brancher le déclencheur sur un signal serveur de création de compte s'il dévie.
- **Fuite de PII dans les propriétés de personne.** Mitigation : valeurs fermées seulement, filtre de sortie de `Core/Analytics` et test sur les schémas Zod (ADR 0012 §1).
- **Exposition comptée sans variante.** Mitigation : `paywall:viewed` n'est émis que si `bootstrap` a rendu une variante, avec un test dédié (ADR 0016).
- **Offering renommé chez RevenueCat.** Mitigation : correspondance en un point côté serveur, repli sur l'offering courant, jamais de paywall vide (ADR 0016).
- **Sons gênants.** Mitigation : catégorie `.ambient`, sons courts, aucun son sans geste de l'utilisateur.
- **SDK tiers et Swift 6.** Mitigation : enveloppes `actor` ou `@MainActor` dans `Core/*`, `@preconcurrency import` localisé (ADR 0010).

## Notes d'implémentation

- Ordre : PostHog d'abord (taxonomie, `Core/Analytics`, identification, flag), puis le parcours, puis les sons et vibrations, puis Turbo : `monetization` et son webhook, la couleur dans `identity`, le chat, RevenueCat et le paywall. Découpage : [`plans/onboarding-paywall.md`](../../plans/onboarding-paywall.md).
- `monetization` reçoit son schéma, son rôle et son client Prisma (ADR 0008, 0025), et son outbox relayée sur `events.monetization` (ADR 0034). Le chat ajoute ce stream à ceux qu'il lit.
- Nouveaux targets du package : `Analytics` (`Core/Analytics`), `Preferences` (`Core/Preferences`), `Purchases` (`Core/Purchases`), `Paywall` (`Features/Paywall`). Ils entrent dans l'app par la liste de targets du produit `Onboarding`, sans toucher au projet Xcode.
- Le parcours vit dans `Features/Onboarding` ; le paywall dans `Features/Paywall`. Aucune des deux n'importe l'autre (ADR 0010, règle 4) : la racine de l'app les enchaîne.
- Dépendances SPM : `posthog-ios` et `purchases-ios-spm`, en version exacte, dans `apps/ios/Packages/Package.swift` et `Package.resolved`.
- Clés : la clé de projet PostHog, son hôte et la clé SDK publique RevenueCat se lisent dans `apps/ios/Info.plist`. Clé absente : adapter sans effet, l'app démarre.

## Liens

- ADR 0003 — Bounded contexts (périmètre de la tranche 1, amendé)
- ADR 0010 — Modularisation iOS (`Core/Analytics`, règle 4, SDK tiers en Swift 6)
- ADR 0012 — Analytics (taxonomie, identification, PII, capture serveur du revenu)
- ADR 0013 — Entitlement scopé par chaîne (portée plateforme ajoutée pour Turbo)
- ADR 0014 — Backend source de vérité des droits (webhook, `appUserID`, droits du chat en mémoire)
- ADR 0024 — Conventions de contrat (enum ouvert des badges)
- ADR 0025 — Un client Prisma par contexte (schéma `monetization`)
- ADR 0034 — Un stream Redis par contexte (`events.monetization`)
- ADR 0016 — PostHog / RevenueCat (rendu du paywall amendé, assignation conservée)
- ADR 0019 — Design tokens (valeurs du parcours et du paywall)
- ADR 0021 — Cartographie (Turbo, badge Turbo, couleur de pseudo et préférences de visionnage ajoutés)
- ADR 0028 — Hébergement reporté (URL publique du webhook)
- ADR 0036 — Valeurs visuelles de la référence (pages du parcours, paywall)
- ADR 0040 — Illustration de « You're All Set! » (écran qui précède le parcours)
- ADR 0049 — Suivi d'une catégorie (page 2 du parcours)
- ADR 0050 — Tags d'une catégorie (page 3 du parcours)
