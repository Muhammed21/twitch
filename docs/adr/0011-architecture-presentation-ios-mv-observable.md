# 0011 — Architecture de présentation iOS : MV avec `@Observable`, pas MVVM

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

Il faut trancher l'architecture de présentation de l'app iOS SwiftUI. Le choix par défaut de l'industrie est MVVM : un `ViewModel` par écran, `@Observable` (ou `ObservableObject` historiquement), la vue lit le VM et lui délègue les actions.

Ce choix mérite d'être argumenté plutôt que subi, pour deux raisons propres à ce projet :

1. **La page de chaîne est un cas extrême.** Elle affiche simultanément un player live, un chat à haut débit, un compteur de viewers, des métadonnées de stream et des contrôles d'abonnement. Ces éléments changent à des fréquences séparées par trois ordres de grandeur : les métadonnées une fois par minute, le compteur toutes les cinq secondes, le chat jusqu'à cinquante fois par seconde. Une architecture qui agrège tout cela dans un même objet observable produit des invalidations massives et une UI qui rame.
2. **Le projet est solo, en TDD strict, avec un domaine déjà isolé** (ADR 0010). La justification habituelle de MVVM — « c'est testable » — doit être confrontée à ce que contient réellement un ViewModel quand la logique métier vit déjà dans les use-cases.

## Facteurs de décision

- Granularité d'invalidation sur la page de chaîne (contrainte de perf dure, pas théorique).
- Quantité de code de câblage sans valeur métier.
- Facilité de partage d'état entre écrans (session de chat qui survit à un PiP, player en arrière-plan).
- Testabilité réelle — c'est-à-dire ce que les tests attrapent, pas leur nombre.
- Alignement avec l'idiome SwiftUI et avec `@Observable`.
- Absence d'équipe : aucune valeur à une convention défensive.

## Options envisagées

**Option A — MVVM : un `@Observable ViewModel` par écran.**
Convention universelle, familière, frontière claire par écran. Mais : granularité d'observation détruite (développé ci-dessous), duplication de la surface du modèle, partage d'état entre écrans pénible, cycle de vie du VM fragile, et l'essentiel de son contenu est du câblage. Écartée.

**Option B — TCA (The Composable Architecture).**
Unidirectionnel, état explicite, excellente testabilité des réducteurs, outillage sérieux. Mais courbe d'apprentissage réelle, boilerplate important, couplage à un framework tiers pour toute la structure de l'app, et performance nécessitant un scoping attentif qui rejoint le problème de l'option A. En solo, le coût est immédiat et le bénéfice — la convention partagée, la discipline imposée — est nul faute d'équipe. Écartée.

**Option C — Logique dans les vues, `@State` local partout.**
Rapide au début. Mais aucun partage d'état, logique asynchrone dans des `.task` qui se multiplient, cycle de vie du player ingérable. Écartée.

**Option D (retenue) — MV : modèles observables scopés par capacité.**

## Décision

**Modèles `@Observable` scopés par capacité, injectés via `@Environment`, lus directement par les vues. Un objet d'état dédié uniquement là où il y a un cycle de vie ou une orchestration asynchrone à gérer. Pas de couche de mapping systématique par écran.**

L'argumentaire suit, parce que cette décision va contre la convention par défaut et doit pouvoir être défendue — ou renversée — sur des raisons explicites.

---

### 1. Clarification préalable : « MV » ne veut pas dire « logique dans la vue »

Le débat est régulièrement pollué par cette confusion. Ce n'est pas la position retenue ici.

MV signifie **View + Model**, où :
- le `Model` est un objet `@Observable`, injecté, propriétaire d'un état ;
- la **logique métier vit dans la couche domaine** — value objects, use-cases, protocoles de repositories, c'est-à-dire le module `Domain` de l'ADR 0010 ;
- la vue lit le modèle et déclenche des intentions.

Le désaccord avec MVVM porte sur **un point unique et précis** : faut-il un objet intermédiaire **par écran**, dont le rôle est de refléter le modèle et de le reformater pour la vue ? La réponse est non. Tout le reste — séparation de la logique métier, injection de dépendances, testabilité du domaine — est commun aux deux approches et n'est pas en discussion.

### 2. MVVM résout un problème que SwiftUI n'a pas

MVVM vient de WPF, puis a été porté sur UIKit. Dans ces frameworks, la vue est **un objet mutable à longue durée de vie, incapable d'observer un modèle**. Un `UIViewController` existe pendant des minutes, détient des `UILabel` qu'il faut mettre à jour à la main, et n'a aucun mécanisme natif pour réagir à un changement de modèle.

Le ViewModel existait pour trois raisons, toutes techniques :
1. exposer des propriétés observables (KVO, bindings, `@Published`) ;
2. détenir l'état de vue, que le contrôleur ne savait pas gérer proprement ;
3. formater modèle → affichage, pour éviter de le faire dans le contrôleur.

SwiftUI fournit les trois nativement : `@Observable` pour l'observation, `@State` / `@Binding` pour l'état de vue, et le corps de la vue lui-même pour le formatage.

L'argument plus fondamental, et le plus souvent manqué : **la `struct View` de SwiftUI EST déjà un view model.** C'est un type valeur, recréé à chaque changement d'état, qui ne fait que *décrire* ce qu'il faut afficher. Ce n'est pas la vue au sens UIKit — la vue réelle est l'arbre de rendu que SwiftUI construit et maintient, auquel le code n'a pas accès.

Autrement dit, un `ChannelViewModel` placé derrière une `ChannelView`, c'est **un view model derrière un view model**. La couche que MVVM ajoute pour combler un manque du framework, SwiftUI l'a déjà fournie. On la paie deux fois.

### 3. Le coût réel : MVVM détruit la granularité d'invalidation

C'est l'argument décisif, et il est mesurable plutôt que stylistique.

`@Observable` (macro Observation) fait du tracking **par propriété effectivement lue**. Une vue ne se recalcule que si une propriété qu'elle a lue dans son `body` a changé. C'est un progrès majeur sur `ObservableObject`, dont le `objectWillChange` invalidait tous les observateurs pour n'importe quel changement.

MVVM annule ce gain, parce qu'il pousse structurellement vers **un VM par écran qui agrège tout ce dont l'écran a besoin**.

Cas concret, la page de chaîne :

```swift
@Observable final class ChannelViewModel {
  var stream: Stream?              // change ~1×/minute
  var viewerCount: Int             // change ~1×/5 s
  var messages: [ChatMessage]      // change jusqu'à 50×/s
  var isFollowing: Bool            // change rarement
  var playerState: PlayerState     // change à chaque bufferisation
}
```

`ChatView` lit `vm.messages`. Le header lit `vm.stream` et `vm.viewerCount`. Les contrôles du player lisent `vm.playerState` et `vm.isFollowing`.

En pratique, dès qu'une vue parente lit plusieurs de ces propriétés — et sur cet écran, c'est le cas de la vue de composition —, **toute la sous-arborescence se réévalue au rythme du chat, soit cinquante fois par seconde**. Le header, les contrôles et les boutons d'abonnement sont recalculés en permanence alors que rien qui les concerne n'a bougé. Sur un écran qui décode déjà du HLS, c'est exactement le budget CPU qu'on ne peut pas dépenser.

En MV, le découpage ne suit pas l'écran, **il suit la fréquence de changement** :

```swift
@Observable final class ChatSession { }       // haute fréquence, isolée
@Observable final class PlayerController { }  // moyenne fréquence, isolée
@Observable final class ChannelStore { }      // basse fréquence, isolée
```

Chacun est injecté via `@Environment` et lu **uniquement par les feuilles concernées**. Un burst de messages n'invalide que la liste de chat. Le header ne sait même pas que le chat existe.

**Note honnête, et elle compte** : rien dans MVVM n'interdit ce découpage. On peut parfaitement avoir un `ChatViewModel`, un `PlayerViewModel` et un `ChannelHeaderViewModel`. Mais dès qu'on fait ça, on n'a plus « un ViewModel par vue » : on a des modèles observables scopés par domaine, injectés et partagés. C'est-à-dire exactement MV, sous un autre nom. La question n'est donc pas « MVVM ou MV » dans l'absolu, mais : est-ce que la règle par défaut est *un objet par écran* ou *un objet par capacité* ? Le premier produit le problème d'invalidation ci-dessus ; le second l'évite par construction.

### 4. L'argument de testabilité ne tient pas dans cette architecture

C'est la justification la plus fréquente de MVVM, et elle est ici sans objet.

La logique qui mérite des tests vit déjà dans `Domain` (ADR 0010) : les règles d'éligibilité à un abonnement, la validation d'un `ChannelSlug`, les invariants d'un `Stream`, les use-cases. Tout cela est testable sans UI, sans ViewModel, sans simulateur — et c'est là que se trouve le gros de la suite de tests.

Ce qui resterait dans un ViewModel, une fois la logique métier sortie, c'est du **câblage** :

```swift
func load() async {
  isLoading = true
  do { channel = try await useCase.execute(id) }
  catch { errorMessage = "Impossible de charger la chaîne" }
  isLoading = false
}
```

Tester ça, c'est vérifier qu'un `await` a assigné une variable. Le test est vrai par construction, il ne peut attraper qu'une faute de frappe, et il casse à chaque renommage. C'est du coverage, pas du filet de sécurité — et au regard du principe « tester le comportement, pas l'implémentation », c'est précisément le type de test à ne pas écrire.

Le vrai filet, ici :
- **tests de comportement sur le domaine** — nombreux, rapides, stables, sans UI ;
- **quelques tests d'interaction UI sur les parcours critiques** — lancement, lecture d'un live, envoi d'un message, souscription. Ceux-là attrapent ce que les tests de VM n'attrapent jamais : le câblage réel entre écrans, l'injection, la navigation.

Le seul reproche techniquement fondé est qu'un objet de présentation sans dépendance UI se teste plus facilement qu'une vue. Il est valide — et il est exactement la raison pour laquelle le point 6 conserve des objets d'état dédiés là où il y a de la vraie logique d'orchestration. Ces objets-là sont testables sans UI, et ils sont testés.

### 5. Coûts concrets de MVVM dans ce projet

- **Duplication de la surface du modèle.** Chaque champ de `Channel` réapparaît en propriété de VM, ou le VM expose le modèle entier et ne sert plus à rien. Ajouter un champ coûte trois modifications au lieu d'une.
- **Partage d'état entre écrans.** Le chat continue en PiP, le follow effectué sur la page de chaîne doit se refléter sur l'accueil. Avec un VM par écran, il faut soit synchroniser deux VM (bug de cohérence garanti), soit introduire un store partagé **sous** les VM — et dans ce second cas les VM ne sont plus que des passe-plats, ce qui referme le débat en faveur du store.
- **Cycle de vie fragile.** `@State private var vm = ViewModel()` est une source d'erreurs silencieuses bien connue : recréation à des moments non évidents, ou au contraire persistance inattendue, avec des requêtes relancées ou un état perdu sans message d'erreur. Le fait que la solution correcte ne soit pas évidente est le symptôme d'un objet dont SwiftUI ne veut pas.
- **Friction permanente avec l'idiome.** `@Bindable`, `@Binding` vers le VM, `.task` liées au cycle de vie de la vue : chaque feature SwiftUI demande une adaptation pour cohabiter avec un VM par écran.

### 6. Où un objet d'état dédié RESTE justifié

La position n'est pas dogmatique. Trois cas où un objet d'état dédié est la bonne réponse :

- **`PlayerController`** — `AVPlayer`, observation KVO, sélection de variante HLS, Picture-in-Picture, `AVAudioSession`, reprise après coupure réseau, remontée de l'état de bufferisation. Machine à états à durée de vie longue, qui doit survivre au démontage de l'écran (PiP, audio en arrière-plan).
- **`ChatSession`** — connexion WebSocket, reconnexion avec backoff exponentiel, buffer de coalescence, déduplication par identifiant de message, backpressure quand le débit dépasse ce que l'UI peut afficher. Ce n'est pas du câblage, c'est un vrai composant avec des invariants — et il est testé. **Son protocole est entièrement spécifié par l'ADR 0004** : authentification, heartbeat applicatif (30 s, fermeture à 90 s), codes de fermeture `4401` / `4403` (ADR 0005), politique de backpressure serveur et schémas de messages issus de `packages/contracts`. `ChatSession` en est le pendant client et ne redéfinit rien.
- **`LiveStatusChannel`** — consommateur du **canal 2** de l'ADR 0004 (compteur de viewers, statut live, raids), en SSE, servi par l'API et non par le service de chat. Il a sa propre politique de reconnexion, distincte de celle du chat : c'est précisément l'intérêt de la séparation des canaux — quand le chat tombe, le compteur et le statut du live continuent. Objet séparé de `ChatSession`, et lu par des feuilles différentes.
- **Formulaires multi-étapes** — onboarding, configuration de monétisation : état intermédiaire réel, validation progressive, qui n'appartient ni au domaine ni à une vue isolée.

**La différence avec MVVM n'est pas l'existence de ces objets, c'est leur portée et leur nombre** :
- scopés à une **capacité** (chat, player), pas à un écran ;
- durée de vie parfois **supérieure à celle de l'écran** (le player survit en PiP, la session de chat survit à une rotation) ;
- ils **possèdent** leur état au lieu de le refléter — un `PlayerController` est la source de vérité de l'état de lecture, il ne reformate pas un modèle situé ailleurs.

Un projet aura peut-être trois ou quatre de ces objets, pas un par écran.

### Points spécifiques à ce produit

**Player.** `AVPlayer` + HLS/LL-HLS, encapsulé dans un `UIViewRepresentable` autour d'une `AVPlayerLayer`, piloté par `PlayerController`. PiP via `AVPictureInPictureController`, audio en arrière-plan via la catégorie `.playback` d'`AVAudioSession` et le mode d'arrière-plan correspondant. Le contrôleur est un `@MainActor @Observable`, et les callbacks KVO d'`AVPlayer` sont ramenés sur le main actor explicitement — point sensible en Swift 6 strict (ADR 0010).

**Chat.** Liste virtualisée (`LazyVStack` dans un `ScrollView`, ancrée en bas) avec **coalescence des messages par lots d'environ 100 ms**. Point dur : publier chaque message individuellement à 50 msg/s déclenche 50 passes de layout par seconde et SwiftUI s'écroule. `ChatSession` accumule dans un buffer et publie un lot par tick ; la fenêtre affichée est bornée (quelques centaines de messages, les plus anciens sont évincés). La valeur de 100 ms est un point de départ à ajuster à la mesure — c'est le bon compromis attendu entre latence perçue et coût de rendu, pas une certitude.

**Sécurité.** Certificate pinning sur le domaine API (facilité par le reverse proxy de l'ADR 0012, qui évite d'avoir à épingler des domaines tiers). App Attest / DeviceCheck sur les endpoints sensibles — création de compte, actions de monétisation, envoi de messages — pour limiter l'abus par clients non officiels.

**Cache.** SwiftData ou GRDB dans `Core/Persistence`, derrière un protocole défini dans `Domain`, pour le cache de métadonnées (chaînes suivies, profil, dernières catégories) permettant un premier rendu instantané. **Aucun cache de segments vidéo live** : les segments d'un live n'ont aucune valeur après quelques secondes, et les mettre en cache ne fait que consommer du disque et compliquer la logique de lecture.

## Conséquences

### Positives

- L'invalidation suit la fréquence de changement : un burst de chat n'impacte pas le player ni le header. C'est le bénéfice principal, et il est directement observable sur la page de chaîne.
- Nettement moins de code de câblage ; ajouter un champ au modèle ne demande pas trois modifications.
- Partage d'état entre écrans naturel : un seul `ChannelStore` injecté, pas de synchronisation à écrire.
- Le player et la session de chat peuvent survivre à l'écran (PiP, audio de fond) sans contorsion.
- Alignement avec l'idiome SwiftUI : moins de friction à chaque nouvelle API du framework.
- L'effort de test se concentre là où il attrape des régressions réelles : domaine et parcours critiques.

### Négatives

- **Va contre la convention dominante.** La majorité des ressources, tutoriels et exemples iOS supposent MVVM. Chaque décision d'architecture devra être prise sans modèle à copier, et un futur contributeur trouvera le code inhabituel.
- Discipline requise pour scoper correctement les modèles observables : rien n'empêche mécaniquement de créer un gros `AppStore` fourre-tout, qui reproduirait exactement le problème d'invalidation reproché à MVVM. La contrainte est ici humaine, pas compilatoire — contrairement aux frontières de modules de l'ADR 0010.
- Moins de tests unitaires de présentation. Le pari est que les tests de domaine et d'interaction couvrent mieux ; si le taux de bugs de câblage devient élevé, le pari est perdu.
- **Contre-argument honnête, à conserver** : avec une équipe iOS de six personnes, la rigidité de MVVM ou de TCA aurait une valeur propre — une convention uniforme qui évite les débats à chaque PR, un cadre qui empêche un développeur junior de se tromper, une structure qui facilite l'onboarding. Ce bénéfice est réel et il est ici strictement nul, puisqu'il n'y a personne à coordonner. **Cet ADR serait à réexaminer si le projet s'ouvrait à plusieurs développeurs iOS.**
- L'injection par `@Environment` est moins explicite qu'une injection par initialiseur : une dépendance manquante se manifeste au runtime, pas à la compilation.

### Risques et mitigations

- **Incertitude réelle : le seuil exact à partir duquel l'invalidation devient un problème n'est pas connu.** L'argument du point 3 est structurellement solide mais les chiffres — 50 msg/s, coût réel d'une réévaluation de `body` — restent des estimations. Mitigation : instrumenter tôt avec Instruments (SwiftUI, Hangs, Time Profiler) sur la page de chaîne dans des conditions réalistes, et considérer les recalculs de `body` par seconde comme une métrique suivie, pas comme une intuition.
- **`ChannelStore` devient le fourre-tout redouté.** Mitigation : règle explicite — un modèle observable qui contient des propriétés de fréquences de changement très différentes doit être scindé. Le critère de découpage est la fréquence, pas le domaine fonctionnel.
- **Dépendances manquantes dans `@Environment` au runtime.** Mitigation : valeurs par défaut explicites qui échouent bruyamment en debug (`fatalError` avec un message nommant la dépendance), et une composition root unique dans `App` qui injecte tout au même endroit.
- **Coalescence du chat mal calibrée.** Trop long, le chat paraît saccadé ; trop court, le gain disparaît. Mitigation : rendre la fenêtre configurable (idéalement par feature flag, ADR 0012) et la régler à la mesure sur un vrai flux dense.
- **`AVPlayer` et Swift 6 strict.** Les callbacks KVO et les délégués `AVFoundation` ne sont pas tous correctement annotés. Mitigation : encapsulation complète dans `PlayerController`, `@preconcurrency import` localisé et commenté, aucune fuite de type non-`Sendable` vers les features.
- **Le pari sur la testabilité peut être faux.** Si des bugs de câblage échappent régulièrement, la réponse n'est pas de réintroduire MVVM partout mais d'élargir les tests d'interaction UI sur les parcours concernés. À réévaluer sur données réelles, pas sur principe.

## Notes d'implémentation

- Les modèles observables sont `@MainActor @Observable final class`, injectés dans `App` (composition root) via `.environment(...)`.
- Le domaine reste hors du main actor : types valeur immuables, `Sendable`, sans dépendance UI.
- Les vues lisent l'environnement au **niveau le plus bas possible** : c'est ce qui rend le tracking par propriété efficace. Lire un modèle dans une vue parente pour le passer en paramètre annule le bénéfice et doit être évité.
- `@State` reste utilisé pour l'état strictement local à une vue (champ de saisie, feuille ouverte, onglet sélectionné). C'est le bon outil pour ça.
- `PlayerController` et `ChatSession` sont injectés depuis un niveau supérieur à l'écran de chaîne, pour survivre à sa disparition.
- Découpage de la page de chaîne en vues feuilles indépendantes (`ChannelHeader`, `PlayerSurface`, `ChatList`, `ChatComposer`, `SubscribeBar`), chacune ne lisant que le modèle qui la concerne.
- Les fakes de `ChatSession` et `PlayerController` vivent dans les targets de fixtures (ADR 0010) et alimentent previews et tests.

## Liens

- ADR 0010 — Modularisation iOS en packages SPM locaux (couches `Domain` / `Core` / `Features` et concurrence stricte Swift 6)
- ADR 0009 — Contrat API (types générés consommés par `Core/Networking`, jamais par les vues)
- ADR 0012 — Stratégie analytics (feature flags bootstrappés pilotant notamment la coalescence du chat)
- ADR 0004 — Chat en process séparé et topologie temps réel (protocole de `ChatSession`, canal 2 SSE de `LiveStatusChannel`)
- ADR 0005 — Stratégie de tokens (stockage Keychain, sérialisation du refresh, codes de fermeture WebSocket)
