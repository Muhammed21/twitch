# Plan — parcours de personnalisation, PostHog iOS et Turbo

Décision de référence : [ADR 0051](../docs/adr/0051-parcours-de-personnalisation-apres-inscription-et-paywall-turbo-natif-en-tranche-1.md). S'y ajoutent l'[ADR 0012](../docs/adr/0012-strategie-analytics-taxonomie-evenements-posthog.md) (taxonomie, identification, PII), l'[ADR 0013](../docs/adr/0013-entitlement-multi-tenant-abonnement-scope-par-chaine.md) (entitlement), l'[ADR 0014](../docs/adr/0014-revenuecat-adapter-backend-source-de-verite.md) (webhook, `appUserID`, droits du chat), l'[ADR 0016](../docs/adr/0016-repartition-posthog-revenuecat-flags-experimentation.md) (assignation par `bootstrap`), l'[ADR 0010](../docs/adr/0010-modularisation-ios-packages-spm-locaux.md) (règles de dépendance), l'[ADR 0025](../docs/adr/0025-un-client-prisma-par-contexte.md) et l'[ADR 0034](../docs/adr/0034-un-stream-redis-par-contexte-pour-les-events-de-l-outbox.md) (schéma, outbox et stream par contexte), et l'[ADR 0036](../docs/adr/0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) (fidélité à la référence).

Chaque PR suit le TDD (RED, GREEN, REFACTOR), reste sous 1 200 lignes de diff et liste ses tests à écrire en premier. Côté TypeScript, Stryker tourne sur le diff ; côté Swift, la revue vérifie qu'un test échouerait si la logique changeait.

## Contraintes d'intégration

- L'app ne lie que les produits `DesignSystem`, `Networking`, `Onboarding` et `Auth` de `apps/ios/Packages/Package.swift`. Les nouveaux targets entrent par la liste de targets du produit `Onboarding` : aucune PR ne touche `apps/ios/App.xcodeproj`.
- Le dossier `apps/ios/App/` est synchronisé par Xcode : un fichier ajouté dedans compile sans toucher au projet.
- Dépendances SPM (`posthog-ios`, `purchases-ios-spm`) en version exacte dans `Package.swift`, et `Package.resolved` commité dans la même PR.
- Les SDK tiers restent confinés à leur target `Core/*`, derrière un protocole de `Domain`, avec `@preconcurrency import` localisé (ADR 0010).

| Nouveau target | Chemin             | Dépend de                | Entre par le produit |
| -------------- | ------------------ | ------------------------ | -------------------- |
| `Analytics`    | `Core/Analytics`   | `Domain`, `PostHog`      | `Onboarding`         |
| `Preferences`  | `Core/Preferences` | `Domain`                 | `Onboarding`         |
| `Purchases`    | `Core/Purchases`   | `Domain`, `RevenueCat`   | `Onboarding`         |
| `Paywall`      | `Features/Paywall` | `Domain`, `DesignSystem` | `Onboarding`         |

Le target `Onboarding` existant gagne la dépendance `Domain`. Le parcours et le paywall ne s'importent pas (ADR 0010, règle 4) : `apps/ios/App/` les enchaîne.

## API existante

| Besoin                              | Route                                      | État                                                              |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Lister les catégories à suivre      | `GET /v1/categories` (Browse, avec `tags`) | Existe (ADR 0047, 0050)                                           |
| Suivre une catégorie                | `PUT /v1/me/followed-categories/{slug}`    | Existe (ADR 0049)                                                 |
| Lister les tags (centres d'intérêt) | —                                          | **À créer** : PR 5                                                |
| Lire ou écrire une préférence       | —                                          | Sans objet : les préférences restent sur l'appareil (ADR 0051 §4) |
| Variante de paywall                 | `GET /v1/mobile/bootstrap`, `flags`        | Existe ; `exp_paywall_variant` et l'offering s'ajoutent en PR 4   |
| Webhook RevenueCat                  | —                                          | **À créer** : PR 17 et 18                                         |
| Entitlements actifs                 | `GET /v1/mobile/bootstrap`                 | **À ajouter** : PR 19                                             |
| Resynchronisation après achat       | —                                          | **À créer** : PR 20                                               |
| Couleur de pseudo                   | —                                          | **À créer** : PR 21                                               |

## Ordre et dépendances

```
PostHog           1 ──▶ 2 ──▶ 3
                  └──────────▶ 4
Parcours          5 (API, indépendante)
                  2 ──▶ 6 ──▶ 7 ──▶ 8 (après 5) ──▶ 9 ──▶ 10 ──▶ 11 ──▶ 12
Sons, vibrations  13 (indépendante) ──▶ 14 (après 12)
Turbo, serveur    15 ──▶ 16 ──▶ 17 ──▶ 18 ──▶ 19 ──▶ 20
                  21 (identity, indépendante)
Turbo, chat       18 + 21 ──▶ 22 ──▶ 23
Turbo, iOS        3 ──▶ 24 ──▶ 25 ──▶ 26 (après 4, 14, 19, 20)
                  23 ──▶ 27 ──▶ 28 (après 19, 21)
```

PR 1, 5, 13, 15 et 21 démarrent sans attendre. Les PR serveur de Turbo avancent en parallèle du parcours ; l'ordre de livraison côté app reste PostHog, parcours, sons et vibrations, puis Turbo.

## PostHog

### PR 1 — Taxonomie analytics en Zod et enum Swift généré

`packages/contracts/src/analytics` : les événements de l'ADR 0051 §7, avec la convention et la politique PII en tête du fichier (ADR 0012). Générateur TypeScript qui écrit l'enum Swift et ses payloads dans `apps/ios/Packages/Domain/Sources/Generated/AnalyticsEvent.swift`, branché sur la tâche `generate` (ADR 0018) pour que la CI refuse un généré périmé.
_Tests d'abord_ : un schéma qui porte une clé interdite (`email`, `phone`, `name`, `address`, `ip`, `token`, `password`) fait échouer le test ; un nom hors du format `objet:action_au_passé` est refusé ; le générateur produit un cas Swift par événement avec ses propriétés typées, et la même entrée donne la même sortie.
_Dépend de_ : rien.

### PR 2 — `Core/Analytics` et le SDK PostHog

Dépendance `posthog-ios`. Protocole `Analytics` dans `Domain` (capture d'un `AnalyticsEvent`, propriétés de personne fermées). Adapter `actor` dans `Core/Analytics` : filtre de sortie des clés interdites, super propriétés (version d'app, version d'OS, modèle, locale). Clé et hôte lus dans `apps/ios/Info.plist` (`PostHogProjectKey`, `PostHogHost`) ; clé vide, adapter sans effet. Fake d'analytics pour les tests des features. Target ajouté au produit `Onboarding`.
_Tests d'abord_ : un événement capturé arrive au client SDK fake avec son nom et ses propriétés ; une propriété interdite est retirée avant l'envoi ; sans clé, rien n'est envoyé et rien ne plante ; les super propriétés accompagnent chaque événement.
_Dépend de_ : PR 1.

### PR 3 — Identification et réinitialisation

`identify()` à la transition de `SessionStore` vers « connecté », une seule fois par transition ; `reset()` à la déconnexion. Branché dans la racine de composition, jamais dans une vue (ADR 0012 §2).
_Tests d'abord_ : une connexion appelle `identify` une fois avec l'ID backend ; une relance déjà connectée ne le rappelle pas ; une déconnexion appelle `reset` ; une révocation de session aussi.
_Dépend de_ : PR 2.

### PR 4 — Flag `exp_paywall_variant` dans `bootstrap`

Contrat `MobileBootstrap.flags` : `exp_paywall_variant` optionnel, et `paywall_offering` résolu par le module `mobile` depuis une table variante → offering en un point unique (ADR 0016). `FeatureFlags` de `Domain` et `LaunchStore` le transportent ; défaut sûr : aucune variante.
_Tests d'abord_ (API) : une variante connue rend son offering ; une variante inconnue ou PostHog injoignable ne rend ni variante ni offering ; la table ne référence que des variantes déclarées. (iOS) : sans le champ, `FeatureFlags` n'a pas de variante ; la variante reçue ne change pas pendant la session.
_Dépend de_ : PR 1 pour la convention de nommage.

## Parcours de personnalisation

### PR 5 — API : `GET /v1/tags`

Lecture dans `discovery` : les tags distincts des catégories actives de `DiscoveryCategoryView`, avec le nombre de catégories qui les portent, triés par ce nombre puis par libellé. Schéma de réponse dans `packages/contracts`, `openapi.json` régénéré.
_Tests d'abord_ : deux catégories qui partagent un tag le rendent une fois avec le compte 2 ; une catégorie retirée ne compte plus ; aucune catégorie taguée rend une liste vide ; l'ordre suit le compte puis le libellé ; la casse d'affichage est conservée (ADR 0050).
_Dépend de_ : rien.

### PR 6 — Préférences de l'appareil

Protocole `Preferences` dans `Domain` (apparence, lecture auto, taille du texte du chat, horodatage, langue des lives, filtres de contenu, centres d'intérêt, parcours terminé par compte). Implémentation sur `UserDefaults` dans `Core/Preferences`. Chaque changement émet `preference:changed` et met à jour la propriété de personne correspondante.
_Tests d'abord_ : une valeur écrite se relit après recréation du store ; une valeur absente rend le défaut de la référence ; un changement émet un seul `preference:changed` avec `source` ; une valeur identique n'émet rien ; « parcours terminé » est propre à un ID de compte.
_Dépend de_ : PR 2.

### PR 7 — Squelette du parcours et déclencheur

`RootScreen` gagne l'étape du parcours entre `allSet` et `signedIn`, seulement après une inscription. Machine d'états du parcours dans `Features/Onboarding` : suivant, passer, retour, progression, fin. Événements `onboarding:started`, `step_completed`, `step_skipped`, `completed`. Pages 1 (intro) et 10 (récap) en version statique.
_Tests d'abord_ : une inscription mène au parcours après « You're all set » ; une connexion à un compte existant n'y passe pas ; un parcours terminé ne se rejoue pas à la relance ; passer une page émet `step_skipped` et avance ; `duration_ms` mesure le temps sur la page avec une horloge injectée.
_Dépend de_ : PR 6.

### PR 8 — Pages 2 et 3 : catégories et centres d'intérêt

Page 2 d'après `parametres/recommandations-categories--defaut` : catégories de `GET /v1/categories`, suivi par `PUT /v1/me/followed-categories/{slug}`. Page 3 : tags de `GET /v1/tags`, choix enregistrés dans `Preferences`. Adapters dans `Core/Networking`, états chargement, vide et erreur.
_Tests d'abord_ : choisir une catégorie appelle la route de suivi avec son slug ; un échec garde la page et permet de réessayer ; `selection_count` compte les catégories suivies ; les tags choisis sont enregistrés ; une liste de tags vide laisse passer la page.
_Dépend de_ : PR 5, PR 7.

### PR 9 — Pages 4 et 5 : préférences de contenu et langue des lives

Page 4 d'après `parametres/preferences-contenu--defaut`, `--defile` et `--filtres-actives`. Page 5 : langue des lives.
_Tests d'abord_ : chaque interrupteur écrit son filtre ; l'état par défaut reprend la référence (« Blur Sexual Themes » activé) ; la langue choisie est enregistrée et recopiée en propriété de personne.
_Dépend de_ : PR 7.

### PR 10 — Pages 6, 7 et 9 : apparence, lecture auto, chat, et leur application

Pages d'après `parametres/apparence--*` et `parametres/lecture-auto-videos--defaut`, et la page chat. Application dans l'app : `preferredColorScheme` à la racine, taille du texte et horodatage dans `Chat`, lecture automatique là où l'app lance une vidéo sans geste.
_Tests d'abord_ : « Système » ne force aucun thème, « Sombre » et « Clair » le forcent ; la taille choisie change le rôle de texte du chat ; l'horodatage s'affiche seulement s'il est activé ; lecture auto désactivée, aucune lecture ne démarre sans geste.
_Dépend de_ : PR 7.

### PR 11 — Page 8 : notifications

Page d'après `onboarding/permission-notifications--defaut`, puis l'alerte système par `UNUserNotificationCenter` derrière un protocole. Aucun enregistrement APNs (ADR 0051 §1).
_Tests d'abord_ : accepter émet `notification_permission:answered` avec `is_granted: true`, refuser avec `false` ; une autorisation déjà décidée ne relance pas l'alerte et passe la page.
_Dépend de_ : PR 7.

### PR 12 — Animations et récap animé

Entrées, transitions et récap au niveau de `Welcome.swift`, durées et courbes en constantes testées. Avec Réduire les animations : fondu court, récap dans son état final.
_Tests d'abord_ : Réduire les animations remplace chaque transition par le fondu ; le récap liste les choix faits ; les durées valent les constantes.
_Dépend de_ : PR 8 à 11.

## Sons et vibrations

### PR 13 — Générateur de sons

Script TypeScript de synthèse courte qui écrit `tap`, `validation`, `success` et `transition` en `.caf` (ou `.wav` PCM) dans `apps/ios/Packages/Core/DesignSystem/Sources/Sounds/`. Formes d'onde, enveloppes, fréquences et durées en constantes, aucun aléa. Branché sur la tâche `generate` : la CI refuse un fichier qui diverge de son générateur.
_Tests d'abord_ : deux exécutions produisent des octets identiques ; chaque son dure moins que sa durée plafond ; l'en-tête du fichier annonce la fréquence d'échantillonnage et le nombre de canaux attendus ; aucun échantillon ne dépasse la pleine échelle.
_Dépend de_ : rien.

### PR 14 — Rôles de retour dans `DesignSystem`

Rôles `FeedbackRole` : sélection (`tap`), validation (`validation`), succès (`success`), changement de page (`transition`), erreur (vibration seule). Chacun associe un `SensoryFeedback` et son son. Lecteur sur une session audio `.ambient`. Branché sur toutes les pages du parcours.
_Tests d'abord_ : chaque rôle rend le retour haptique et le son attendus ; la session audio est en `.ambient` avec mélange ; un son absent joue la vibration seule sans erreur ; aucun son ne part sans geste de l'utilisateur.
_Dépend de_ : PR 12, PR 13.

## Turbo, côté serveur

### PR 15 — Schéma `monetization`

`packages/db` : schéma `monetization`, son rôle et son client Prisma (ADR 0008, 0025). Tables `Entitlement` (portée `CHANNEL` ou `PLATFORM`, `channelId` et tier facultatifs, statut, échéance, source, référence fournisseur, horodatage du dernier événement appliqué), `ProcessedWebhookEvent` (unicité `(provider, event_id)`), `MonetizationOutbox`. Index unique partiel : un seul entitlement `PLATFORM` actif (`ACTIVE`, `GRACE`) par utilisateur.
_Tests d'abord_ (en base) : un second entitlement `PLATFORM` actif pour le même utilisateur est refusé ; un expiré n'empêche pas un nouveau ; un même `(provider, event_id)` est refusé ; le rôle de `monetization` n'a aucun droit sur les autres schémas.
_Dépend de_ : rien.

### PR 16 — Domaine de l'entitlement Turbo

`apps/api/src/modules/monetization/domain` : accorder, prolonger, passer en grâce, expirer, révoquer, transférer ; un événement plus ancien que le dernier appliqué est ignoré (ADR 0014). Transitions écrites comme événements de domaine. Aucune infrastructure.
_Tests d'abord_ : un achat initial crée un entitlement `PLATFORM` actif ; un renouvellement prolonge sans recréer ; une annulation garde l'accès jusqu'à l'échéance ; un problème de facturation passe en `GRACE` sans couper l'accès ; une expiration et un remboursement coupent l'accès ; un transfert révoque l'origine et recrée à l'identique sur la cible ; un événement antérieur au dernier appliqué ne change rien.
_Dépend de_ : PR 15.

### PR 17 — Réception du webhook RevenueCat

`POST /v1/webhooks/revenuecat` dans l'infrastructure de `monetization` : en-tête `Authorization` comparé en temps constant, validation Zod stricte du payload, insertion dans `ProcessedWebhookEvent`, réponse `200` sans logique métier. Secret dans l'environnement (`REVENUECAT_WEBHOOK_AUTHORIZATION`), validé au démarrage.
_Tests d'abord_ : un en-tête absent ou faux rend `401` et archive le corps ; un payload hors contrat est archivé, alerté et non interprété ; un doublon rend `200` sans seconde ligne ; la réponse ne dépend d'aucun traitement métier.
_Dépend de_ : PR 15.

### PR 18 — Traitement des événements et events `monetization`

Traitement asynchrone des événements reçus : traduction RevenueCat → domaine (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `TRANSFER`, `REFUND`, `SUBSCRIPTION_PAUSED`), produit inconnu ou type non traité persisté, alerté et ignoré. Contrats `monetization.entitlement.granted` et `.revoked` v1 dans `packages/contracts` (`userId`, `scope`, `expiresAt`), écrits dans l'outbox et relayés sur `events.monetization` (ADR 0034).
_Tests d'abord_ : un achat initial Turbo écrit `granted` dans la même transaction que l'entitlement ; une expiration écrit `revoked` ; un renouvellement republie `granted` avec la nouvelle échéance ; un type inconnu n'écrit rien et lève une alerte ; un traitement rejoué n'écrit pas deux fois.
_Dépend de_ : PR 16, PR 17.

### PR 19 — Entitlements actifs dans `bootstrap`

`MobileBootstrap` gagne `entitlements` (liste, portée en enum ouvert, ADR 0024). Le module `mobile` les lit par un port de `monetization`. `Domain` iOS et `LaunchStore` les transportent.
_Tests d'abord_ (API) : un abonné Turbo actif reçoit `{ scope: "platform", expiresAt }` ; un expiré ou un anonyme reçoit une liste vide ; `monetization` indisponible rend une liste vide sans faire échouer `bootstrap`. (iOS) : une portée inconnue est ignorée sans erreur de décodage.
_Dépend de_ : PR 16.

### PR 20 — Resynchronisation après achat

`POST /v1/me/entitlements/sync` : relit l'abonné chez RevenueCat (API REST, clé secrète en environnement) et applique le même use-case que le webhook, avec la même règle d'ordre. Limité en débit par utilisateur (ADR 0042).
_Tests d'abord_ : un abonné actif chez RevenueCat devient actif chez nous et `granted` est écrit ; un état déjà appliqué n'écrit rien ; RevenueCat injoignable rend `503` sans toucher à l'entitlement ; un appel trop fréquent est refusé.
_Dépend de_ : PR 18.

### PR 21 — Couleur de pseudo dans `identity`

`chatColor` facultatif sur le compte (`#RRGGBB`), `PUT /v1/me/chat-color` (et `null` pour revenir au défaut), event `identity.chat_color.changed` v1 (`accountId`, `chatColor`) écrit dans l'outbox d'`identity`. `identity` ne vérifie pas Turbo (ADR 0051, option H).
_Tests d'abord_ : une couleur valide est enregistrée et écrit l'event dans la même transaction ; un format invalide rend `400` sans event ; `null` efface la couleur et écrit l'event ; la même couleur deux fois n'écrit qu'un event.
_Dépend de_ : rien.

## Turbo, côté chat

### PR 22 — Vue locale des abonnés Turbo et des couleurs

`apps/chat` lit `events.monetization` en plus de ses streams. Handlers : `monetization.entitlement.granted` et `.revoked` (portée `platform`) tiennent l'échéance Turbo par utilisateur ; `identity.chat_color.changed` met à jour la couleur de l'auteur. Au démarrage, la vue se remplit par le même mécanisme de lecture que les autres vues locales du chat.
_Tests d'abord_ : `granted` puis `revoked` laisse l'utilisateur sans Turbo ; un `granted` rejoué ne change rien ; une portée inconnue est ignorée ; une couleur reçue avant l'inscription de l'auteur n'est pas perdue ; un payload hors contrat est écarté et journalisé.
_Dépend de_ : PR 18, PR 21.

### PR 23 — Badge et couleur dans les messages diffusés

Contrat temps réel : l'auteur gagne `badges` (enum ouvert, ADR 0024) et `color` facultative. Le chat ajoute `turbo` et la couleur seulement si l'échéance Turbo de l'auteur est après l'horloge du serveur. Aucun appel réseau par message.
_Tests d'abord_ : un abonné actif diffuse `badges: ["turbo"]` et sa couleur ; un abonné expiré par l'horloge, sans event `revoked`, perd badge et couleur ; un non-abonné qui a enregistré une couleur la voit ignorée ; un client qui ne connaît pas `badges` décode toujours le message.
_Dépend de_ : PR 22.

## Turbo, côté iOS

### PR 24 — `Core/Purchases` et le SDK RevenueCat

Dépendance `purchases-ios-spm`. Protocole `Purchases` dans `Domain` : offering par identifiant, offering courant, achat d'un package, restauration, état de l'entitlement `turbo` pour l'affichage, attribut d'abonné. Clé lue dans `Info.plist` (`RevenueCatAPIKey`) ; `logIn` avec l'ID backend à la connexion, `logOut` à la déconnexion (ADR 0014). Fake pour les tests.
_Tests d'abord_ : la connexion appelle `logIn` avec l'ID backend, jamais l'ID anonyme ; la déconnexion appelle `logOut` ; un offering absent se replie sur l'offering courant ; sans clé, le service répond « indisponible » sans planter.
_Dépend de_ : PR 3.

### PR 25 — `Features/Paywall` natif

Vue d'après `abonnement/turbo--defaut` et `turbo--avantages-deplies`, avantages limités au badge et à la couleur de pseudo : prix et période de l'offre, renouvellement, conditions et confidentialité, restaurer, fermer. États chargement, erreur, achat en cours, achat réussi. Événements `paywall:viewed`, `paywall:dismissed`, `purchase:*`.
_Tests d'abord_ : le prix affiché vient de l'offre, jamais d'une constante ; `paywall:viewed` n'est émis qu'avec une variante ; une annulation StoreKit émet `purchase:cancelled` et garde le paywall ; un échec émet `purchase:failed` avec `error_code` ; une restauration émet `purchase:restored` ; un abonné voit l'état « abonné ».
_Dépend de_ : PR 24.

### PR 26 — Page 11 : le paywall au bout du parcours

La racine enchaîne le récap et le paywall, sauf si `bootstrap` annonce Turbo actif. Variante et offering lus dans `bootstrap` ; `ph_paywall_variant` posé en attribut d'abonné avant l'achat (ADR 0016). Après un achat réussi, appel de `POST /v1/me/entitlements/sync`. Fichier StoreKit de test dans `apps/ios/App/` ; scénario Maestro inscription → parcours → paywall fermé.
_Tests d'abord_ : un abonné passe directement à l'accueil ; sans variante, l'offering courant s'affiche et aucune exposition n'est émise ; l'attribut est posé avant l'appel d'achat ; un achat réussi déclenche la resynchronisation ; fermer le paywall termine le parcours.
_Dépend de_ : PR 4, PR 14, PR 19, PR 20, PR 25.

### PR 27 — Badge Turbo et couleur dans le chat iOS

`Chat` décode `badges` et `color` et les rend à côté du pseudo ; glyphe du badge en masque (ADR 0046), couleur ajustée selon la décision de lisibilité (point ouvert de l'ADR 0051).
_Tests d'abord_ : un auteur `turbo` affiche le badge ; un badge inconnu n'affiche rien ; sans `color`, le pseudo garde la couleur par défaut ; une couleur reçue passe par la règle de lisibilité retenue dans les deux thèmes.
_Dépend de_ : PR 23, et la décision sur le glyphe et la lisibilité.

### PR 28 — Choix de la couleur de pseudo

Accès au choix depuis les réglages du chat (`chat/parametres-chat--defaut`, ligne « Identity »), seulement pour un abonné Turbo d'après `bootstrap`. Envoi par `PUT /v1/me/chat-color`.
_Tests d'abord_ : un non-abonné ne voit pas l'entrée ; choisir une couleur appelle la route et l'affiche ; un échec garde l'ancienne couleur et l'annonce ; revenir au défaut envoie `null`.
_Dépend de_ : PR 19, PR 21, PR 27, et la décision sur le rendu du sélecteur.

## Actions de l'utilisateur

1. **PostHog** : créer ou choisir le projet, fournir la clé de projet et l'hôte (région US ou EU), et dire s'ils se commitent dans `apps/ios/Info.plist` (la clé de projet est publique) ou s'ils passent par une configuration de build, qui demande de toucher au projet Xcode. Créer le flag `exp_paywall_variant` et ses variantes.
2. **RevenueCat** : créer le projet et l'app iOS, fournir la clé SDK publique iOS, créer l'entitlement `turbo` et l'offering par défaut, un offering par variante, et activer l'intégration RevenueCat → PostHog.
3. **Webhook RevenueCat** : choisir la valeur de l'en-tête `Authorization`, la poser dans le tableau de bord RevenueCat et dans `REVENUECAT_WEBHOOK_AUTHORIZATION` de l'environnement de l'API ; déclarer l'URL du webhook (tunnel vers l'API locale tant que l'hébergement n'est pas choisi).
4. **Clé secrète RevenueCat** (API REST) pour la resynchronisation, dans l'environnement de l'API.
5. **App Store Connect** : créer le groupe d'abonnement et le produit Turbo mensuel, le relier à l'entitlement `turbo` dans RevenueCat, et partager la clé In-App Purchase avec RevenueCat.
6. **StoreKit de test** : attacher le fichier `.storekit` de la PR 26 au scheme `App` (Edit Scheme → Run → Options → StoreKit Configuration). Le scheme vit dans le projet Xcode.
7. **Rendu sans référence** : décider du sélecteur de couleur, du glyphe du badge Turbo et de la règle de lisibilité des couleurs, avant les PR 27 et 28.
8. Accepter l'ADR 0051.
