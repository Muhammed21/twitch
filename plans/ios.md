# Plan — app iOS (`ios/`)

Décisions de référence : [ADR 0010](../docs/adr/0010-modularisation-ios-packages-spm-locaux.md) (packages SPM locaux, Swift 6 strict), [ADR 0011](../docs/adr/0011-architecture-presentation-ios-mv-observable.md) (MV avec `@Observable`), [ADR 0019](../docs/adr/0019-package-design-tokens.md) (design tokens), [ADR 0023](../docs/adr/0023-client-ios-socketio-minimal-et-refus-http-au-handshake.md) (client de chat minimal), [ADR 0024](../docs/adr/0024-conventions-de-contrat-pour-la-compatibilite.md) (décodage tolérant), [ADR 0005](../docs/adr/0005-strategie-tokens-et-sessions.md) et [0026](../docs/adr/0026-better-auth-oauth-provider-et-revocation-sur-reutilisation.md) (OAuth PKCE, Keychain), [ADR 0018](../docs/adr/0018-qualite-de-code-et-discipline-de-depot.md) (§4, volet Swift), [ADR 0030](../docs/adr/0030-pas-de-client-web-app-ios-seul-client.md) (seul client, Maestro).

Chaque PR suit le TDD (RED, GREEN, REFACTOR) avec Swift Testing, reste sous le plafond de revue et liste ses tests à écrire en premier. Le test de mutation n'a pas d'outil retenu côté Swift : la revue vérifie à la place qu'un test échouerait si la logique changeait (REVIEW.md).

## Architecture

```
ios/
├── App/                       # target Xcode mince : @main, racine de composition, routage racine
└── Packages/Package.swift     # un seul package, plusieurs targets ; le graphe se lit dans ce fichier
    ├── Domain/                # modèles immuables et Sendable, value objects, protocoles de repositories
    ├── Core/
    │   ├── DesignSystem/      # seul importateur de DesignTokens (ADR 0019, règle 5 bis)
    │   ├── Networking/        # client généré depuis openapi.json, mappers vers Domain, session et refresh
    │   ├── ChatTransport/     # client socket.io minimal sur URLSessionWebSocketTask (ADR 0023)
    │   └── Navigation/        # enum Route fermé, Router (ADR 0010)
    └── Features/              # Auth, Home, Channel, Player, Chat, Profile ; aucune feature n'importe une autre
```

- Règles de dépendance de l'ADR 0010, garanties par `Package.swift` (erreur de link), doublées d'un script de lint des `import` pour un message clair (ADR 0018, §4).
- `Core/Persistence` et `Core/Analytics` ne sont créés qu'avec leur premier consommateur (ADR 0010, risque « sur-découpage »).
- Objets d'état scopés par capacité, injectés par `@Environment` depuis la racine de composition (ADR 0011) : `SessionStore`, `PlayerController`, `ChatSession`, `LiveStatusChannel`, `ChannelStore`. Pas de ViewModel par écran.
- Types générés confinés à `Core/Networking`, jamais exposés : il expose des types de `Domain` (ADR 0010, règle 2 ; ADR 0024).

## Point de départ et dépendances

| Il faut d'abord                             | Plan                                     |
| ------------------------------------------- | ---------------------------------------- |
| `openapi.json` généré et versionné          | [API](api.md), PR 3                      |
| Connexion OAuth PKCE et `GET /v1/me`        | [API](api.md), PR 5 à 7                  |
| `GET /v1/lives`, URL de lecture             | [API](api.md), PR 10 et 11               |
| Lecture HLS servie par le service vidéo     | [Service vidéo](service-video.md), PR 10 |
| Serveur de chat avec handshake et diffusion | [Chat](chat.md), PR 3 et 4               |

Les PR 1 et 2 ne dépendent de rien : elles démarrent tout de suite. Les features se construisent d'abord contre les fakes de leurs targets `…Fixtures` (ADR 0010), puis se branchent sur les vrais services.

## Jalons

| Jalon | Après la PR | Démonstration                                                                                    |
| ----- | ----------- | ------------------------------------------------------------------------------------------------ |
| I1    | 4           | Connexion PKCE depuis le simulateur, token dans le Keychain, `GET /v1/me` affiché                |
| I2    | 6           | La liste des lives s'affiche, et un live OBS se lit dans `AVPlayer`                              |
| I3    | 9           | La page de chaîne : player, compteur de viewers et chat en direct. Démonstration de la tranche 1 |

## Les PR de la tranche 1

### PR 1 — Projet, package et outillage

Projet Xcode mince dans `ios/App`, `Packages/Package.swift` avec `swiftLanguageMode(.v6)` sur tous les targets, `Domain` et `Core/DesignSystem` (dépendance `../packages/design-tokens/platforms/swift`). SwiftFormat en pre-commit sur `*.swift` (lint-staged), SwiftLint en CI avec les règles de formatage désactivées, script de lint des `import` (feature → feature, `DesignTokens` hors de `DesignSystem`). Workflow iOS en `workflow_dispatch` seulement, activé selon les déclencheurs de l'ADR 0018 (§4). Scope de commit `ios` déjà présent.
_Tests d'abord_ : le script de lint refuse une fixture où une feature importe une autre feature, et une fixture qui importe `DesignTokens` hors de `DesignSystem` ; un composant de `DesignSystem` lit ses couleurs depuis les tokens dans les deux thèmes.

### PR 2 — `Domain` de la tranche 1

Modèles et value objects : `ChannelID`, `ChannelSlug`, `Channel`, `LiveChannel`, `StreamSession`, `ChatMessage`, `ViewerCount`. Tout enum issu du serveur a un cas `.unknown(String)` (ADR 0009, garde-fou n°4). Protocoles : `ChannelRepository`, `LiveDirectory`, `ChatConnection`, `AccessTokenProvider`.
_Tests d'abord_ : slug invalide refusé à la construction ; une valeur d'enum inconnue devient `.unknown` sans erreur ; types `Sendable` (vérifié par le compilateur).

### PR 3 — `Core/Networking` : client généré et mappers

`swift-openapi-generator` en build plugin sur une copie d'`openapi.json`, synchronisée par `pnpm generate` et vérifiée par le gate des artefacts générés (ADR 0018). Configuration : transcodeur ISO 8601 tolérant, `Uuid` mappé sur `Foundation.UUID` (ADR 0024, §6). Mappers des types générés vers `Domain`, y compris la variante de repli des unions et les enums ouverts. Erreurs RFC 9457 traduites en erreurs de `Domain`. En-tête `X-Client-Version` sur chaque requête.
_Tests d'abord_ : décodage de fixtures JSON réelles produites par le serveur ; champ ajouté, valeur d'enum ajoutée et variante d'union ajoutée décodés sans échec (le test de compatibilité ascendante de l'ADR 0024, §8) ; date avec et sans millisecondes ; échec si le log du générateur contient `is not supported` ou `skipping`.

### PR 4 — Connexion et session (jalon I1)

Feature `Auth` et `SessionStore` : OAuth 2.1 PKCE S256 par `ASWebAuthenticationSession`, paramètre `resource` toujours envoyé (sinon le token est opaque, ADR 0026). Tokens dans le Keychain avec `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`, jamais dans `UserDefaults`. **Refresh sérialisé par un acteur unique** : plusieurs `401` simultanés attendent un seul rafraîchissement (ADR 0005). `invalid_grant` → retour à l'écran de connexion. Déconnexion : révocation côté serveur, Keychain vidé.
_Tests d'abord_ : dix requêtes qui reçoivent `401` en même temps déclenchent un seul refresh ; attribut Keychain vérifié ; `invalid_grant` → état déconnecté ; la requête d'autorisation porte `code_challenge_method=S256` et `resource`.

### PR 5 — Navigation, racine de composition et accueil

`Core/Navigation` (`Route` ne transporte que des identifiants), racine de composition dans `App` qui injecte tous les objets d'état, `navigationDestination(for: Route.self)` unique. Appel de `GET /v1/mobile/bootstrap` au lancement : version minimale supportée → écran « mettez à jour » ; flags avec leurs valeurs par défaut sûres, l'app démarre même si l'appel échoue (ADR 0009, 0012). Feature `Home` : liste des lives paginée par curseur, miniature par défaut.
_Tests d'abord_ : version minimale supérieure à celle de l'app → écran de mise à jour ; bootstrap en échec → démarrage avec les défauts ; page suivante chargée par curseur sans doublon ; un deep link `twitch://channel/<slug>` se décode en `Route`.

### PR 6 — Player (jalon I2)

`PlayerController`, `@MainActor @Observable` : `AVPlayer` sur l'URL HLS, états (chargement, lecture, bufferisation, erreur, fin), callbacks KVO ramenés sur le main actor, `@preconcurrency import` localisé et commenté (ADR 0011). `PlayerSurface` (`UIViewRepresentable` autour d'`AVPlayerLayer`). Injecté au-dessus de l'écran de chaîne, pour survivre à sa disparition.
_Tests d'abord_ : transitions d'état contre un faux lecteur ; erreur de lecture → état erreur avec possibilité de réessayer ; fin du live → état terminé.
_Vérification au jalon_ : OBS → `apps/video` → simulateur, latence notée dans la PR.

### PR 7 — `Core/ChatTransport`

Client minimal de l'ADR 0023 : un `actor` possède la `URLSessionWebSocketTask` ; parseur pur `String → ServerFrame` (Engine.IO v4 : `0`, `2`, `3` ; socket.io v5 : `40`, `41`, `42`, `43`) ; chien de garde de ping sur `pingInterval + pingTimeout` lus dans le paquet d'ouverture ; acks avec délai d'expiration, tous échoués à la fermeture ; statut du handshake lu dans `task.response` → `unauthorized`, `forbidden` ou `unavailable`.
_Tests d'abord_ : chaque type de trame et chaque trame malformée ; chien de garde qui ferme une connexion muette ; ack expiré ; acks en attente échoués à la fermeture. Test d'intégration contre le vrai serveur de chat épinglé : nominal, `401`, `403`, trame trop grosse, ack, révocation (ADR 0023).

### PR 8 — `ChatSession` et feature `Chat`

`ChatSession` applique la table de reconnexion de l'ADR 0023 (§3) : `401` → refresh puis reconnexion, `403` ou `stop` → arrêt définitif, erreur réseau → backoff exponentiel avec gigue. Coalescence des messages par lots d'environ 100 ms, fenêtre bornée à quelques centaines de messages (ADR 0011). `ChatList` (`LazyVStack` ancrée en bas) et `ChatComposer`, avec le motif de refus renvoyé par l'ack.
_Tests d'abord_ : chaque ligne de la table de reconnexion contre un faux transport ; 50 messages en 100 ms → une seule publication ; fenêtre qui évince les plus anciens ; message refusé `rate_limited` affiché à l'auteur.

### PR 9 — Page de chaîne et canal 2 (jalon I3)

`LiveStatusChannel` : consommateur SSE du statut du live et du compteur de viewers, avec sa propre reconnexion, indépendante du chat (ADR 0004, §2 ; ADR 0011). Feature `Channel` : `ChannelHeader`, `PlayerSurface`, `ChatList`, `ChatComposer`, chacune ne lisant que l'objet d'état qui la concerne.
_Tests d'abord_ : coupure du chat → le compteur continue ; coupure du SSE → le chat continue ; fin du live reçue par SSE → le player passe à l'état terminé.
_Vérification au jalon_ : un burst de chat n'invalide pas `ChannelHeader`, mesuré avec Instruments (ADR 0011, risque principal).

### PR 10 — Ma chaîne et modération minimale

Dans `Profile` : clé de stream affichée à la demande et copiable, jamais journalisée ; titre de la chaîne modifiable ; réglages OBS recommandés (ADR 0031). Dans `Chat`, pour le propriétaire : mettre un viewer en timeout depuis un message (API, PR 13).
_Tests d'abord_ : la clé n'apparaît dans aucun log ; un viewer qui n'est pas propriétaire ne voit pas l'action de timeout ; timeout réussi → confirmation, refus → message d'erreur.

### PR 11 — Maestro et CI iOS

Flows Maestro (CLI gratuite, simulateur) des parcours critiques : connexion, ouvrir un live, envoyer un message, mettre en timeout. Les éléments touchés portent un `.accessibilityIdentifier`, et les flows attendent un élément plutôt qu'un délai (ADR 0030, §4). Le workflow iOS passe de `workflow_dispatch` à un déclenchement sur les diffs de `ios/`, tests `Domain` et `Core` d'abord (ADR 0018, §4). Le job Maestro reste non bloquant jusqu'à dix exécutions vertes d'affilée.
_Tests d'abord_ : chaque flow échoue quand l'identifiant qu'il attend disparaît (vérifié une fois à la main, consigné dans la PR).

**Test manuel avant la fin de la tranche 1** (ADR 0023, point ouvert) : sur iPhone réel, passage en arrière-plan, bascule Wi-Fi / 4G, mode basse consommation, retour au premier plan après 10 minutes. Maestro ne pilote pas d'appareil physique.

## Après la tranche 1

| Sujet                                                                               | Horizon            |
| ----------------------------------------------------------------------------------- | ------------------ |
| Follow, page « Suivis », cloche par chaîne (ADR 0020)                               | T2                 |
| Notifications APNs (ADR 0004, canal 3)                                              | T2                 |
| `Core/Persistence` : cache des chaînes suivies et du profil (ADR 0011)              | T2                 |
| `Core/Analytics` et taxonomie générée (ADR 0012)                                    | T2                 |
| Passkeys par la page de connexion, certificate pinning, App Attest (ADR 0011, 0026) | Avec l'hébergement |
| Picture-in-Picture et audio en arrière-plan (ADR 0011)                              | T2                 |
| Abonnements et bits par RevenueCat (ADR 0013 à 0016)                                | T3                 |
| TestFlight                                                                          | Avec l'hébergement |

## Risques suivis pendant l'exécution

- **LL-HLS refusé par `AVPlayer` en local** : vérifié au jalon I2, avec le repli HLS standard du [plan vidéo](service-video.md).
- **Swift 6 strict et API Apple mal annotées** (`AVFoundation`) : encapsulation dans `PlayerController`, `@preconcurrency import` localisé, aucun type non `Sendable` vers les features.
- **Coût de la CI macOS** : tests `Domain` et `Core` seulement au départ, déclenchement limité aux diffs de `ios/` (ADR 0018).
- **Profil de développement qui expire avant une démonstration** : réinstaller l'app la veille.
