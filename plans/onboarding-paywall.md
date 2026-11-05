# Plan — parcours de personnalisation, PostHog iOS et paywall Turbo

Décision de référence : [ADR 0051](../docs/adr/0051-parcours-de-personnalisation-apres-inscription-et-paywall-turbo-natif-en-tranche-1.md). S'y ajoutent l'[ADR 0012](../docs/adr/0012-strategie-analytics-taxonomie-evenements-posthog.md) (taxonomie, identification, PII), l'[ADR 0016](../docs/adr/0016-repartition-posthog-revenuecat-flags-experimentation.md) (assignation par `bootstrap`), l'[ADR 0014](../docs/adr/0014-revenuecat-adapter-backend-source-de-verite.md) (`appUserID`, `customerInfo` pour l'affichage), l'[ADR 0010](../docs/adr/0010-modularisation-ios-packages-spm-locaux.md) (règles de dépendance) et l'[ADR 0036](../docs/adr/0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) (fidélité à la référence).

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

| Besoin du parcours                  | Route                                      | État                                                              |
| ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Lister les catégories à suivre      | `GET /v1/categories` (Browse, avec `tags`) | Existe (ADR 0047, 0050)                                           |
| Suivre une catégorie                | `PUT /v1/me/followed-categories/{slug}`    | Existe (ADR 0049)                                                 |
| Lister les tags (centres d'intérêt) | —                                          | **À créer** : PR 4                                                |
| Lire ou écrire une préférence       | —                                          | Sans objet : les préférences restent sur l'appareil (ADR 0051 §3) |
| Variante de paywall                 | `GET /v1/mobile/bootstrap`, `flags`        | Existe ; `exp_paywall_variant` et l'offering s'ajoutent en PR 3   |

## Ordre et dépendances

```
PostHog          1 ──▶ 2 ──▶ 3a
                 └──────────▶ 3b
Parcours         4 (API, indépendante)
                 2 ──▶ 5 ──▶ 6 ──▶ 7 (après 4) ──▶ 8 ──▶ 9 ──▶ 10 ──▶ 11
Sons, vibrations 11 ──▶ 12
RevenueCat       3a ──▶ 13 ──▶ 14 ──▶ 15 (après 3b, 12)
```

PR 1 et PR 4 démarrent sans attendre.

## PostHog

### PR 1 — Taxonomie analytics en Zod et enum Swift généré

`packages/contracts/src/analytics` : les événements de l'ADR 0051 §6, avec la convention et la politique PII en tête du fichier (ADR 0012). Générateur TypeScript qui écrit l'enum Swift et ses payloads dans `apps/ios/Packages/Domain/Sources/Generated/AnalyticsEvent.swift`, branché sur la tâche `generate` (ADR 0018) pour que la CI refuse un généré périmé.
_Tests d'abord_ : un schéma qui porte une clé interdite (`email`, `phone`, `name`, `address`, `ip`, `token`, `password`) fait échouer le test ; un nom hors du format `objet:action_au_passé` est refusé ; le générateur produit un cas Swift par événement avec ses propriétés typées, et la même entrée donne la même sortie.
_Dépend de_ : rien.

### PR 2 — `Core/Analytics` et le SDK PostHog

Dépendance `posthog-ios`. Protocole `Analytics` dans `Domain` (capture d'un `AnalyticsEvent`, propriétés de personne fermées). Adapter `actor` dans `Core/Analytics` : filtre de sortie des clés interdites, super propriétés (version d'app, version d'OS, modèle, locale). Clé et hôte lus dans `apps/ios/Info.plist` (`PostHogProjectKey`, `PostHogHost`) ; clé vide, adapter sans effet. Fake d'analytics pour les tests des features. Target ajouté au produit `Onboarding`.
_Tests d'abord_ : un événement capturé arrive au client SDK fake avec son nom et ses propriétés ; une propriété interdite est retirée avant l'envoi ; sans clé, rien n'est envoyé et rien ne plante ; les super propriétés accompagnent chaque événement.
_Dépend de_ : PR 1.

### PR 3a — Identification et réinitialisation

`identify()` à la transition de `SessionStore` vers « connecté », une seule fois par transition ; `reset()` à la déconnexion. Branché dans la racine de composition, jamais dans une vue (ADR 0012 §2).
_Tests d'abord_ : une connexion appelle `identify` une fois avec l'ID backend ; une relance déjà connectée ne le rappelle pas ; une déconnexion appelle `reset` ; une révocation de session aussi.
_Dépend de_ : PR 2.

### PR 3b — Flag `exp_paywall_variant` dans `bootstrap`

Contrat `MobileBootstrap.flags` : `exp_paywall_variant` optionnel, et `paywall_offering` résolu par le module `mobile` depuis une table variante → offering en un point unique (ADR 0016). `FeatureFlags` de `Domain` et `LaunchStore` le transportent ; défaut sûr : aucune variante.
_Tests d'abord_ (API) : une variante connue rend son offering ; une variante inconnue ou PostHog injoignable ne rend ni variante ni offering ; la table ne référence que des variantes déclarées. (iOS) : sans le champ, `FeatureFlags` n'a pas de variante ; la variante reçue ne change pas pendant la session.
_Dépend de_ : PR 1 pour la convention de nommage ; indépendante de PR 2.

## Parcours de personnalisation

### PR 4 — API : `GET /v1/tags`

Lecture dans `discovery` : les tags distincts des catégories actives de `DiscoveryCategoryView`, avec le nombre de catégories qui les portent, triés par ce nombre puis par libellé. Schéma de réponse dans `packages/contracts`, `openapi.json` régénéré.
_Tests d'abord_ : deux catégories qui partagent un tag le rendent une fois avec le compte 2 ; une catégorie retirée ne compte plus ; aucune catégorie taguée rend une liste vide ; l'ordre suit le compte puis le libellé ; la casse d'affichage est conservée (ADR 0050).
_Dépend de_ : rien.

### PR 5 — Préférences de l'appareil

Protocole `Preferences` dans `Domain` (apparence, lecture auto, taille du texte du chat, horodatage, langue des lives, filtres de contenu, centres d'intérêt, parcours terminé par compte). Implémentation sur `UserDefaults` dans `Core/Preferences`. Chaque changement émet `preference:changed` et met à jour la propriété de personne correspondante.
_Tests d'abord_ : une valeur écrite se relit après recréation du store ; une valeur absente rend le défaut de la référence ; un changement émet un seul `preference:changed` avec `source` ; une valeur identique n'émet rien ; « parcours terminé » est propre à un ID de compte.
_Dépend de_ : PR 2.

### PR 6 — Squelette du parcours et déclencheur

`RootScreen` gagne l'étape du parcours entre `allSet` et `signedIn`, seulement après une inscription. Machine d'états du parcours dans `Features/Onboarding` : suivant, passer, retour, progression, fin. Événements `onboarding:started`, `step_completed`, `step_skipped`, `completed`. Pages 1 (intro) et 10 (récap) en version statique.
_Tests d'abord_ : une inscription mène au parcours après « You're all set » ; une connexion à un compte existant n'y passe pas ; un parcours terminé ne se rejoue pas à la relance ; passer une page émet `step_skipped` et avance ; `duration_ms` mesure le temps sur la page avec une horloge injectée.
_Dépend de_ : PR 5.

### PR 7 — Pages 2 et 3 : catégories et centres d'intérêt

Page 2 d'après `parametres/recommandations-categories--defaut` : catégories de `GET /v1/categories`, suivi par `PUT /v1/me/followed-categories/{slug}`. Page 3 : tags de `GET /v1/tags`, choix enregistrés dans `Preferences`. Adapters dans `Core/Networking`, états chargement, vide et erreur.
_Tests d'abord_ : choisir une catégorie appelle la route de suivi avec son slug ; un échec garde la page et permet de réessayer ; `selection_count` compte les catégories suivies ; les tags choisis sont enregistrés ; une liste de tags vide laisse passer la page.
_Dépend de_ : PR 4, PR 6.

### PR 8 — Pages 4 et 5 : préférences de contenu et langue des lives

Page 4 d'après `parametres/preferences-contenu--defaut`, `--defile` et `--filtres-actives`. Page 5 : langue des lives.
_Tests d'abord_ : chaque interrupteur écrit son filtre ; l'état par défaut reprend la référence (« Blur Sexual Themes » activé) ; la langue choisie est enregistrée et recopiée en propriété de personne.
_Dépend de_ : PR 6.

### PR 9 — Pages 6, 7 et 9 : apparence, lecture auto, chat, et leur application

Pages d'après `parametres/apparence--*` et `parametres/lecture-auto-videos--defaut`, et la page chat. Application dans l'app : `preferredColorScheme` à la racine, taille du texte et horodatage dans `Chat`, lecture automatique là où l'app lance une vidéo sans geste.
_Tests d'abord_ : « Système » ne force aucun thème, « Sombre » et « Clair » le forcent ; la taille choisie change le rôle de texte du chat ; l'horodatage s'affiche seulement s'il est activé ; lecture auto désactivée, aucune lecture ne démarre sans geste.
_Dépend de_ : PR 6.

### PR 10 — Page 8 : notifications

Page d'après `onboarding/permission-notifications--defaut`, puis l'alerte système par `UNUserNotificationCenter` derrière un protocole. Aucun enregistrement APNs (ADR 0051 §1).
_Tests d'abord_ : accepter émet `notification_permission:answered` avec `is_granted: true`, refuser avec `false` ; une autorisation déjà décidée ne relance pas l'alerte et passe la page.
_Dépend de_ : PR 6.

### PR 11 — Animations et récap animé

Entrées, transitions et récap au niveau de `Welcome.swift`, durées et courbes en constantes testées. Avec Réduire les animations : fondu court, récap dans son état final.
_Tests d'abord_ : Réduire les animations remplace chaque transition par le fondu ; le récap liste les choix faits ; les durées valent les constantes.
_Dépend de_ : PR 7 à 10.

## Sons et vibrations

### PR 12 — Rôles de retour dans `DesignSystem`

Rôles `FeedbackRole` (sélection, validation, succès, erreur) : chacun associe un `SensoryFeedback` et un son optionnel. Lecteur de sons sur une session audio `.ambient`, fichiers dans les ressources de `DesignSystem`. Branché sur toutes les pages du parcours.
_Tests d'abord_ : chaque rôle rend le retour haptique attendu ; la session audio est en `.ambient` avec mélange ; un son absent joue la vibration seule sans erreur ; aucun son ne part sans geste de l'utilisateur.
_Dépend de_ : PR 11, et les fichiers sonores (actions de l'utilisateur).

## RevenueCat et paywall

### PR 13 — `Core/Purchases` et le SDK RevenueCat

Dépendance `purchases-ios-spm`. Protocole `Purchases` dans `Domain` : offering par identifiant, offering courant, achat d'un package, restauration, état de l'entitlement `turbo`, attribut d'abonné. Configuration avec la clé lue dans `Info.plist` (`RevenueCatAPIKey`) ; `logIn` avec l'ID backend à la connexion, `logOut` à la déconnexion (ADR 0014). Fake pour les tests.
_Tests d'abord_ : la connexion appelle `logIn` avec l'ID backend, jamais l'ID anonyme ; la déconnexion appelle `logOut` ; un offering absent se replie sur l'offering courant ; sans clé, le service répond « indisponible » sans planter.
_Dépend de_ : PR 3a.

### PR 14 — `Features/Paywall` natif

Vue d'après `abonnement/turbo--defaut` et `turbo--avantages-deplies` : prix et période de l'offre, renouvellement, conditions et confidentialité, restaurer, fermer. États chargement, erreur, achat en cours, achat réussi. Événements `paywall:viewed`, `paywall:dismissed`, `purchase:*`.
_Tests d'abord_ : le prix affiché vient de l'offre, jamais d'une constante ; `paywall:viewed` n'est émis qu'avec une variante ; une annulation StoreKit émet `purchase:cancelled` et garde le paywall ; un échec émet `purchase:failed` avec `error_code` ; une restauration émet `purchase:restored` ; un abonné voit l'état « abonné ».
_Dépend de_ : PR 13. Bloquée par le point ouvert « avantages de Turbo en T1 ».

### PR 15 — Page 11 : le paywall au bout du parcours

La racine enchaîne le récap et le paywall, sauf si `turbo` est actif. Variante et offering lus dans `bootstrap` ; `ph_paywall_variant` posé en attribut d'abonné avant l'achat (ADR 0016). Fichier StoreKit de test dans `apps/ios/App/` ; scénario Maestro inscription → parcours → paywall fermé.
_Tests d'abord_ : un abonné passe directement à l'accueil ; sans variante, l'offering courant s'affiche et aucune exposition n'est émise ; l'attribut est posé avant l'appel d'achat ; fermer le paywall termine le parcours.
_Dépend de_ : PR 3b, PR 12, PR 14.

## Actions de l'utilisateur

1. **PostHog** : créer ou choisir le projet, fournir la clé de projet et l'hôte (région US ou EU), et dire s'ils se commitent dans `apps/ios/Info.plist` (la clé de projet est publique) ou s'ils passent par une configuration de build, qui demande de toucher au projet Xcode. Créer le flag `exp_paywall_variant` et ses variantes.
2. **RevenueCat** : créer le projet et l'app iOS, fournir la clé SDK publique iOS, créer l'entitlement `turbo` et l'offering par défaut, un offering par variante, et activer l'intégration RevenueCat → PostHog.
3. **App Store Connect** : créer le groupe d'abonnement et le produit Turbo mensuel, le relier à l'entitlement `turbo` dans RevenueCat, et partager la clé In-App Purchase avec RevenueCat.
4. **StoreKit de test** : attacher le fichier `.storekit` de la PR 15 au scheme `App` (Edit Scheme → Run → Options → StoreKit Configuration). Le scheme vit dans le projet Xcode.
5. **Avantages de Turbo en T1** : les fixer avant la PR 14 (ADR 0051, Risques).
6. **Fichiers sonores** : fournir ou valider des sons courts, libres de droits, avant la PR 12.
7. Accepter l'ADR 0051.
