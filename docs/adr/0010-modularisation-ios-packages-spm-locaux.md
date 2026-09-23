# 0010 — Modularisation iOS en packages SPM locaux

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'app iOS couvre des surfaces hétérogènes : accueil et découverte, page de chaîne, player live, chat temps réel, profil, authentification, monétisation. Le réflexe par défaut d'Xcode est un target unique dans lequel tout finit par dépendre de tout.

Deux problèmes concrets, tous deux aggravés par le travail en solo :

1. **Le temps de boucle.** Dans un target monolithique, toute modification recompile l'ensemble et les previews SwiftUI deviennent lentes puis inutilisables. Or c'est précisément le feedback rapide qui rend le TDD viable sur iOS. Une preview qui met 40 s à rafraîchir, on arrête de l'utiliser, et on perd l'outil principal de développement UI.
2. **Les frontières.** En solo, il n'y a pas de reviewer pour refuser un import. Sans contrainte mécanique, l'écran de chat importera le player, l'accueil importera le profil, et en six mois le graphe de dépendances sera un plat de spaghettis. La seule discipline qui tienne dans la durée est celle que le compilateur applique.

Contraintes : développeur solo, TDD strict, programmation fonctionnelle et immutabilité, architecture hexagonale déjà retenue côté API et à refléter côté client.

## Facteurs de décision

- Temps de build incrémental et previews Xcode réellement utilisables.
- Frontières architecturales vérifiées par le compilateur, pas par la volonté.
- Testabilité par module, sans lancer l'app complète.
- Symétrie conceptuelle avec l'hexagonal côté API (domaine isolé, adapters en périphérie).
- Coût de cérémonie acceptable pour une seule personne.
- Anticipation de la concurrence stricte Swift 6.

## Options envisagées

**Option A — Target unique, organisation par dossiers.**
Zéro cérémonie, démarrage immédiat. Mais aucune frontière réelle (un dossier n'empêche aucun import), recompilation globale, previews qui se dégradent avec la taille du projet, tests impossibles à isoler. Le coût est différé et croissant : c'est la pire option sur un projet destiné à durer. Écartée.

**Option B — Frameworks dynamiques / targets Xcode multiples.**
Frontières réelles. Mais configuration dans le `.pbxproj` (illisible, conflictuel), impact sur le temps de lancement de l'app (chargement dynamique), et outillage moins bon que SPM pour les dépendances internes. Écartée.

**Option C — Micro-packages (un package par feature ET par service).**
Isolation maximale. Mais explosion du nombre de manifestes, résolution de graphe plus lente, et cérémonie insoutenable en solo. Écartée par excès.

**Option D (retenue) — Packages SPM locaux, un package multi-targets, découpage en trois couches.**

## Décision

Un package SPM local (`Packages/`) contenant plusieurs targets, référencé par un target applicatif mince. Le `Package.swift` unique est le point où le graphe de dépendances est **lisible d'un coup d'œil et vérifié par le compilateur**.

```
App/                  # target Xcode mince : @main, composition root, injection
Packages/
  Features/           Home, Channel, Chat, Player, Profile, Auth
  Core/               Networking, DesignSystem, Persistence, Analytics, Navigation
  Domain/             modèles + protocoles de repositories
```

`App` ne contient que le point d'entrée, la composition root (construction des implémentations concrètes et injection dans l'environnement), et le routage racine. Aucune vue métier.

### Règles de dépendance

Non négociables, encodées dans `Package.swift` :

1. **`Domain` ne dépend de rien.** Ni de `Core`, ni de SwiftUI, ni d'un client réseau. Il contient les modèles métier (`Stream`, `Channel`, `ChatMessage`, value objects) et les **protocoles** de repositories (`ChannelRepository`, `StreamRepository`). C'est le centre de l'hexagone côté client : pur, synchrone ou asynchrone mais sans I/O, testable sans rien démarrer.
2. **`Core/*` dépend de `Domain`, jamais d'une `Feature`.** `Core/Networking` implémente les protocoles de `Domain` via le client généré (ADR 0009) : c'est l'adapter sortant. `Core/Persistence` fait de même pour le cache.
3. **`Features/*` dépendent de `Domain` et de `Core`.** Elles consomment les protocoles de `Domain`, jamais les types de transport.
4. **Une `Feature` ne dépend JAMAIS d'une autre `Feature`.** Règle centrale. `Chat` ne connaît pas `Player`, `Home` ne connaît pas `Channel`. Toute violation est une erreur de link.
5. **`Core/*` ne dépendent pas entre eux**, à une exception nommée : `DesignSystem` est une feuille dont tout le monde peut dépendre, et qui ne dépend de rien.

Ce qu'il faut voir : la règle 4 est celle qui apporte la valeur. Les trois autres sont du bon sens ; celle-là est la contrainte qui empêche l'app de redevenir un monolithe.

### Navigation inter-features sans couplage

Conséquence directe de la règle 4 : `Home` doit pouvoir envoyer l'utilisateur sur une chaîne sans connaître `Channel`.

Un module partagé `Core/Navigation` (feuille, dépend de `Domain` uniquement) déclare l'ensemble fermé des destinations :

```swift
public enum Route: Hashable, Sendable {
  case channel(ChannelID)
  case profile(UserID)
  case category(CategoryID)
  case subscription(ChannelID)
}

@Observable public final class Router {
  public private(set) var path: [Route] = []
  public func push(_ route: Route) { path.append(route) }
}
```

Les features **émettent** des `Route`. Seul `App` sait les **résoudre** en vues concrètes, dans un unique `navigationDestination(for: Route.self)` de la composition root. Le couplage remonte donc dans le seul module qui a le droit de tout connaître.

Bénéfice secondaire non trivial : les deep links, les notifications push et le routage interne parlent tous le même langage `Route`. Un lien `twitch://channel/xyz` se décode en `Route`, point.

### Previews et tests par module

- Chaque `Feature` déclare un target `…Fixtures` (ou expose ses fakes derrière un flag de compilation) fournissant des implémentations en mémoire des protocoles `Domain`. Les previews et les tests consomment ces fakes ; **aucune preview ne touche le réseau.**
- Une preview de `Chat` ne compile que `Chat`, `Core/DesignSystem`, `Domain` et ses fixtures. C'est ce qui rend la boucle rapide, et c'est le bénéfice qui justifie l'ADR.
- Tests : `DomainTests` (logique métier pure, aucun I/O, majorité de la suite), `FeatureTests` par feature (comportement de présentation contre fakes), `CoreTests` (mapping, cache, décodage contre fixtures JSON réelles issues d'`openapi.json`).
- Les tests de chaque module s'exécutent sans lancer l'app ni le simulateur complet, ce qui rend le cycle RED-GREEN supportable.

### Swift 6 en concurrence stricte, dès maintenant

Décision ferme : **`swiftLanguageMode(.v6)` et concurrence stricte activés sur tous les targets dès le premier commit.**

Justification : migrer une base existante vers la concurrence stricte est un chantier douloureux et transverse, parce que les annotations manquantes remontent en cascade à travers tout le graphe. Le coût initial est réel mais linéaire ; le coût différé est explosif. Sur un projet qui contient un player `AVPlayer` (callbacks hors main actor), un WebSocket et un cache disque, ce sont exactement les zones où les data races arrivent et où le compilateur doit aider.

Conséquences directes :
- `async/await` partout ; pas de completion handlers dans les API publiques des modules.
- `actor` pour le cache (`Core/Persistence`) et la couche réseau (`Core/Networking`) : l'isolation est structurelle, pas conventionnelle.
- Types `Domain` `Sendable` — trivialement satisfait par l'immutabilité et les `struct` déjà retenues.
- `@MainActor` sur les types de présentation observables, jamais sur le domaine.
- Aucun `@unchecked Sendable` sans commentaire justifiant l'invariant manuel (typiquement, les wrappers autour d'API Apple non encore annotées).

## Conséquences

### Positives

- Builds incrémentaux et previews qui restent utilisables à mesure que l'app grossit — le prérequis du TDD sur iOS.
- Les frontières sont vérifiées par le compilateur : « `Chat` ne doit pas connaître `Player` » devient une erreur de link, pas une convention.
- Le domaine est isolé, testable sans UI ni réseau, symétrique de l'hexagonal serveur.
- Les tests par module tournent vite et ciblé.
- Navigation découplée, deep links et push unifiés par `Route`.
- Le graphe de dépendances est lisible dans un seul fichier `Package.swift`.
- La concurrence stricte est un acquis au lieu d'une dette.

### Négatives

- Cérémonie à chaque nouveau module : target, dépendances, `public` explicite sur ce qu'on expose.
- **Le contrôle d'accès devient un travail réel.** En monolithe tout est `internal` et accessible ; ici, oublier un `public` casse le build, et en mettre partout annule le bénéfice d'encapsulation. Il faut arbitrer.
- Ressources et assets par package : `Bundle.module`, catalogues d'assets dupliqués ou centralisés dans `DesignSystem`, localisation par package. Piège concret : un asset référencé par nom depuis le mauvais bundle ne casse pas à la compilation, il rend une image vide au runtime.
- Les previews d'un module cassent si ses fixtures ne sont pas maintenues — un coût de maintenance supplémentaire.
- Refactoring inter-modules plus coûteux (déplacer un type change sa visibilité et ses imports).
- Swift 6 strict ralentit l'écriture de code au départ, surtout autour d'`AVPlayer` et des API Apple encore mal annotées.

### Risques et mitigations

- **Sur-découpage.** Six features et quatre modules Core, c'est déjà beaucoup pour une personne. Mitigation : ne créer un module que lorsqu'il a un consommateur réel et distinct ; ne pas anticiper. Fusionner reste plus facile que découper trop tard, mais pas gratuit.
- **`Domain` devient un fourre-tout.** C'est le module que tout le monde importe, donc l'aimant à utilitaires. Mitigation : `Domain` contient des modèles et des protocoles, rien d'autre. Un helper de formatage va dans `DesignSystem`, un helper de date dans un module utilitaire dédié, jamais dans `Domain`.
- **Incertitude réelle : `Core/Navigation` peut devenir un point de couplage central.** L'enum `Route` grossit avec chaque écran, et tout le monde en dépend. Si `Route` commence à porter des payloads riches plutôt que des identifiants, le découplage est perdu. Mitigation : `Route` ne transporte que des identifiants ; la feature destinataire charge ses données elle-même. À revoir si l'enum dépasse une quinzaine de cas.
- **Temps de résolution SPM et instabilité d'Xcode sur les packages locaux.** Réel et documenté (index qui se perd, previews qui échouent sans message utile). Mitigation : packages locaux par chemin relatif (jamais par URL), dépendances externes minimales, et acceptation qu'un `rm -rf DerivedData` fasse partie du quotidien.
- **Swift 6 et les dépendances tierces non annotées** (SDK analytics, RevenueCat, provider vidéo). Mitigation : les isoler derrière des wrappers `actor` ou `@MainActor` dans `Core/*`, avec `@preconcurrency import` localisé et commenté — jamais propagé aux features.
- **Le bénéfice sur le temps de build n'est pas garanti.** Le découpage aide surtout si le graphe reste peu profond et si les types publics sont stables ; un `Domain` qui change tout le temps invalide tout l'aval. Mitigation : mesurer avec les timings de build Xcode avant de conclure que la modularisation « marche ».

## Notes d'implémentation

- Un seul `Package.swift` multi-targets plutôt qu'un package par module : le graphe est visible en un fichier et la résolution reste rapide.
- Ordre de création : `Domain` → `Core/DesignSystem` → `Core/Networking` → une première feature verticale complète (`Channel`), avant d'ouvrir les autres.
- Le code Swift généré depuis `openapi.json` (ADR 0009) vit exclusivement dans `Core/Networking` ; il n'est jamais exposé publiquement — `Core/Networking` expose des types `Domain`.
- `Core/Analytics` expose un protocole défini dans `Domain` ; le SDK PostHog est une implémentation confinée à ce module (ADR 0012).
- `DesignSystem` porte tokens, typographie, composants et previews, et ne dépend de rien d'autre que SwiftUI.
- Une règle de CI (script de lint sur `Package.swift` + grep des `import`) vérifie l'absence d'import feature→feature, en complément de l'erreur de link.

## Liens

- ADR 0009 — Contrat API : Zod source de vérité, client Swift généré (consommé par `Core/Networking`)
- ADR 0011 — Architecture de présentation iOS : MV avec `@Observable` (ce que contiennent les `Features/*`)
- ADR 0012 — Stratégie analytics et taxonomie d'événements (implémentation de `Core/Analytics`)
