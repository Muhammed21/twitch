# 0019 — Package de design tokens : source unique DTCG compilée en Swift et en CSS

- Statut : Accepté
- Date : 2026-09-23
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'app iOS est le livrable principal (ADR 0010, 0011). Son rendu repose sur un vocabulaire visuel — couleurs, espacements, rayons, typographie, durées d'animation — qui, si rien n'est décidé, finit sous forme de littéraux dispersés dans les vues : `Color(red: 0.57, green: 0.27, blue: 1.0)` recopié quinze fois, `padding(16)` qui devient `padding(15)` par accident, et un `Color.white` posé sur un fond clair parce que la vue n'a été regardée qu'en thème sombre.

Trois contraintes rendent le problème plus dur que le cas générique.

1. **L'app doit gérer un thème sombre et un thème clair.** Ce n'est pas un raffinement tardif : c'est ce qui double la surface de chaque décision de couleur et ce qui rend une constante statique fausse par construction. Une palette mono-thème peut se poser à la main ; deux palettes qui doivent rester en correspondance exacte ne le peuvent pas.
2. **Une partie de la couleur est une donnée de runtime.** Un streamer personnalise l'identité de sa chaîne. La couleur d'accent affichée dépend donc de la chaîne consultée, valeur qui arrive par l'API et change d'un écran à l'autre. Un système de tokens compilé au build ne peut pas la contenir — mais il doit définir *où elle a le droit d'apparaître*.
3. **Le domaine du live a son propre vocabulaire visuel porteur de sens.** Le rouge « EN DIRECT », les badges de rôle du chat, les niveaux d'abonnement, les tailles d'emotes : ce sont des signifiants produit, pas de la décoration. S'ils sont écrits en dur dans les vues, ils divergeront, et une divergence sur un signifiant est un bug fonctionnel, pas un détail esthétique.

S'ajoute une contrainte de contexte : **développeur solo**. Il n'y a pas de designer pour arbitrer, pas de reviewer pour refuser une couleur hors palette, et pas de recette manuelle pour repérer un texte gris sur fond gris. Tout garde-fou qui repose sur la vigilance ne tiendra pas six mois. Les seuls qui tiennent sont ceux que le build applique.

Un projet frère (`netflix`) a déjà résolu la moitié du problème : tokens DTCG, séparation `core` / `semantic`, compilation par Style Dictionary, formatters Swift écrits en fonctions pures et testés, sortie SPM générée mais versionnée, vérification CI de la fraîcheur du généré. Ce dispositif fonctionne et est repris. Mais il est **mono-thème sombre**, n'a **aucune couleur de runtime**, et **aucun contrôle d'accessibilité**. Les trois points ci-dessus sont précisément ce que cet ADR doit trancher en plus.

## Facteurs de décision

- Les deux thèmes doivent rester **structurellement complets** : impossible d'ajouter un rôle en sombre en oubliant le clair.
- Le code applicatif ne doit jamais écrire `if colorScheme == .dark`. La résolution du thème appartient au système, pas aux vues.
- Le contraste doit être **vérifié mécaniquement**, au build pour les paires du design, à l'exécution pour la couleur choisie par un streamer.
- Xcode doit consommer des **fichiers Swift réels** : il ne lance ni Node ni pnpm, et une preview qui dépend d'un toolchain JS est une preview cassée.
- Le Dynamic Type doit être hérité, pas réimplémenté — y compris pour les images inline du chat.
- Cérémonie soutenable en solo : pas de couche dont le seul bénéfice serait une convention d'équipe inexistante.
- Cohérence avec le graphe de modules de l'ADR 0010, sans l'affaiblir.

## Options envisagées

**Option A — Pas de tokens. Valeurs littérales dans les vues.**
Coût initial nul. Mais avec deux thèmes, chaque couleur devient un `if` dans une vue, la correspondance light/dark n'est garantie par rien, et le contraste n'est vérifié par personne. C'est l'option qui garantit la dette. Écartée.

**Option B — Tokens écrits directement en Swift, à la main (`enum DesignTokens`).**
L'option la plus tentante en solo : zéro outillage, zéro build, tout dans Xcode. Elle est écartée sur un point précis, pas par principe. Un fichier Swift écrit à la main ne peut vérifier **aucun** des invariants qui comptent ici : que tout rôle sémantique existe dans les deux thèmes ; que `text.primary` sur `background.primary` atteint 4.5:1 dans chacun d'eux ; qu'aucun token ne masque l'API `Font` de SwiftUI ; qu'un alias sémantique pointe bien vers un primitif existant. Écrire ces vérifications en Swift reviendrait à réécrire Style Dictionary dans un langage qui ne tourne pas en CI sans simulateur. Et la sortie serait mono-cible : rien pour le back-office. Écartée.

**Option C — Asset catalog Xcode (`.xcassets`) comme source de vérité des couleurs.**
C'est la voie native du dark mode : un `Color Set` porte nativement une valeur *Any* et une valeur *Dark*, plus les variantes *High Contrast*. Réellement séduisant sur le seul axe couleur. Écartée pour quatre raisons : l'accès se fait **par chaîne de caractères** (`Color("backgroundPrimary")`), donc une faute de frappe rend une couleur par défaut au runtime au lieu d'une erreur de compilation — exactement le piège déjà identifié dans l'ADR 0010 sur les assets par bundle ; un asset catalog ne porte ni typographie, ni espacements, ni durées ; son format sur disque est un arbre de dossiers et de JSON illisibles en diff ; et il n'est partageable avec aucune autre plateforme. Note importante : cette option est écartée **comme source de vérité**, pas comme cible de génération — elle reste un repli documenté ci-dessous si la résolution dynamique retenue pose problème.

**Option D — Tokens Studio + synchronisation depuis un fichier Figma.**
C'est le workflow du projet `netflix`, et c'est le bon workflow — quand il existe un fichier Figma source avec des Variables publiées. Ici, **il n'y en a pas**. Adopter le tooling de synchronisation avant d'avoir la source à synchroniser, c'est construire un pipeline vide. Écartée *pour l'instant*, et c'est une nuance qui compte : le format DTCG retenu est précisément celui qu'exporte Tokens Studio, donc la bascule ultérieure est une substitution de la manière dont `tokens/` est rempli, pas une réécriture du package.

**Option E — Génération à la volée par une Run Script Phase Xcode.**
Supprime le besoin de versionner le généré. Écartée fermement : elle impose Node et pnpm à toute compilation Xcode, rend les builds dépendants de l'état d'un `node_modules`, casse les previews SwiftUI (qui compilent sans jouer les phases de script de façon fiable), et transforme une erreur de token en échec de build opaque. Le généré versionné coûte un diff à relire ; celle-ci coûte la boucle de feedback, qui est justement ce que l'ADR 0010 protège.

**Option F (retenue) — Package `@repo/design-tokens` : tokens DTCG multi-thèmes, compilés par Style Dictionary via des formatters maison testés, vers un package SPM généré et versionné, plus des variables CSS, avec vérification de contraste et de fraîcheur au build.**

## Décision

### 1. Structure du package

```
packages/design-tokens/
├── tokens/
│   ├── core/                 primitifs, sans sémantique, mono-valués
│   │   ├── color.json        core.color.purple.60, core.color.neutral.10…
│   │   ├── dimension.json    grille 8pt
│   │   └── motion.json       durées et courbes primitives
│   ├── semantic/
│   │   ├── color.light.json  mêmes chemins, valeurs du thème clair
│   │   ├── color.dark.json   mêmes chemins, valeurs du thème sombre
│   │   ├── typography.json   text styles iOS (indépendant du thème)
│   │   ├── spacing.json      espacements et rayons (indépendants du thème)
│   │   ├── live.json         vocabulaire du domaine live (dimensions)
│   │   └── motion.json       durées sémantiques + variantes mouvement réduit
│   └── contrast-pairs.json   paires à vérifier, avec leur seuil
├── src/formats/              formatters purs + adaptateurs Style Dictionary
├── src/contrast/             ratio WCAG, fonction pure, testée
├── scripts/                  build, check-generated, check-contrast, export-vectors
├── platforms/swift/          package SPM GÉNÉRÉ, versionné
└── platforms/css/            variables CSS GÉNÉRÉES, versionnées
```

Les principes repris du projet `netflix`, sans amendement :

- **Format DTCG** (`$type`, `$value`, `$description`), un `$description` sur tout token dont la valeur n'est pas évidente.
- **Seuls les tokens `semantic` sont générés.** Les `core` ne sortent jamais du package. C'est la propriété qui rend le rethémage possible : ajouter un thème, c'est ajouter un fichier d'alias, sans toucher une ligne de Swift.
- **Nommage `categorie.groupe.variante`** : la catégorie donne le fichier généré, le reste donne le nom du membre. `color.background.primary` → `Color.backgroundPrimary`, `spacing.md` → `Spacing.md`.
- **Formatters écrits en fonctions pures**, prenant une liste de tokens et rendant une chaîne, testées unitairement sans Style Dictionary. L'adaptateur SD est une coquille.
- **Sortie générée mais versionnée**, et un script `tokens:check` qui **échoue en CI** si la régénération produit un diff.
- **Typographie exprimée en text styles système iOS** (`largeTitle`, `caption2`…) plus une graisse, jamais en tailles figées : c'est ce qui donne le Dynamic Type gratuitement.
- **Le formatter refuse les noms qui masqueraient l'API SwiftUI** (`body`, `headline`, `caption`, `title`…), parce qu'un token nommé `body` ferait résoudre `.font(.body)` vers le token sans la moindre erreur de compilation. D'où `bodyText`, `cardTitle`, `captionLabel`.

Le reste de cette décision porte sur ce qui diverge.

---

### 2. Multi-thème : un fichier d'alias par thème, une couleur dynamique en sortie

C'est l'adaptation la plus structurante. Elle se décompose en deux questions distinctes.

#### 2.1 Comment un token sémantique porte deux valeurs

Trois modèles possibles :

- **Un `$value` composite** (`{ "light": "…", "dark": "…" }`) : compact, mais ce n'est pas du DTCG valide pour `$type: color`, donc plus aucun outil amont ne sait le lire, et l'option D se referme.
- **Un préfixe de thème dans le chemin** (`color.dark.background.primary`) : le thème devient un segment de nom, il contamine le nommage et le filtrage de chaque formatter.
- **Un fichier d'alias par thème, à chemins identiques** (retenu).

**Décision : `tokens/semantic/color.light.json` et `color.dark.json` déclarent exactement le même arbre de chemins, et n'en diffèrent que par le primitif visé.**

```jsonc
// color.light.json
{ "color": { "background": { "primary": { "$type": "color", "$value": "{core.color.neutral.100}" } } } }
// color.dark.json
{ "color": { "background": { "primary": { "$type": "color", "$value": "{core.color.neutral.5}" } } } }
```

Chaque fichier reste DTCG-valide et lisible isolément. Le build construit **deux dictionnaires Style Dictionary** — `core` + `semantic/light`, puis `core` + `semantic/dark` — résout les alias de chacun, et passe la **paire** de dictionnaires résolus au formatter de couleurs.

**Le build échoue si les deux arbres ne sont pas identiques en structure.** Un chemin présent dans un thème et absent de l'autre est une erreur, pas un avertissement. C'est l'invariant central du multi-thème : il n'existe pas de rôle sémantique à moitié défini. C'est aussi ce qu'aucune des options A à C ne pouvait garantir.

Les axes indépendants du thème (typographie, espacements, rayons, dimensions, mouvement) restent dans un fichier unique. Rien n'oblige un token à être bi-valué s'il ne l'est pas.

#### 2.2 Ce que le formatter Swift génère

Trois stratégies côté Swift :

- **Deux constantes par rôle** (`backgroundPrimaryLight` / `backgroundPrimaryDark`) : reporte la résolution dans chaque vue. Chaque site d'usage doit lire `@Environment(\.colorScheme)` et choisir. C'est un `if` par couleur, et un `if` oublié par vue. Écartée sans hésitation.
- **Génération d'un asset catalog embarqué dans le package** : natif, mais réintroduit l'accès par chaîne et le bundle de ressources dans un package généré. Écartée comme sortie principale, conservée comme repli.
- **Une constante unique portant un fournisseur dynamique** (retenue).

**Décision : le formatter génère une `static let` unique par rôle, adossée à un `UIColor` à fournisseur dynamique, résolu par `UITraitCollection`.**

```swift
public extension Color {
    /// Fond des écrans et des barres. clair #FFFFFF · sombre #0E0E10
    static let backgroundPrimary = Color(uiColor: UIColor { trait in
        trait.userInterfaceStyle == .dark
            ? UIColor(red: 0.055, green: 0.055, blue: 0.063, alpha: 1)
            : UIColor(red: 1.000, green: 1.000, blue: 1.000, alpha: 1)
    })
}
```

Ce que cela achète : le site d'appel est identique au cas mono-thème (`.background(Color.backgroundPrimary)`), la bascule clair/sombre est prise en charge par le système **y compris à chaud**, et `.preferredColorScheme(.light)` dans une preview suffit à voir l'autre thème. Le thème n'apparaît nulle part dans le code applicatif : c'est l'objectif.

Limite connue et assumée : un fournisseur dynamique ne se résout que dans un contexte qui porte des traits. Extrait vers un `CGColor`, passé à un `CALayer`, ou utilisé dans un `Canvas` hors hiérarchie de vues, il retombe sur la valeur par défaut sans prévenir. Mitigation : `Core/DesignSystem` expose un accès explicite `Color.backgroundPrimary.resolved(in: colorScheme)` pour ces cas, et les formatters génèrent aussi, pour chaque rôle, les deux valeurs statiques sous un type imbriqué `Color.Static` — jamais utilisées dans les vues, réservées aux contextes sans traits et aux tests.

La variante *high contrast* (`accessibilityContrast`) n'est **pas** générée aujourd'hui. Le modèle la supporte sans changement de forme — ce serait un troisième et un quatrième fichier d'alias, et une branche supplémentaire dans le fournisseur. On ne l'ajoute pas avant d'avoir un écran réel qui échoue en contraste renforcé.

---

### 3. Couleur d'accent par chaîne : les tokens définissent le contrat, pas la valeur

C'est le point spécifique à ce produit, et il se tranche par une frontière nette.

**Décision : la couleur d'accent d'une chaîne n'est pas un token. Les tokens définissent le *rôle* `color.accent.*` et sa valeur par défaut ; la couleur du streamer est une donnée de runtime qui *substitue* cette valeur dans un périmètre délimité.**

#### Pourquoi surtout pas un token par chaîne

Il faut le dire explicitement parce que c'est la mauvaise idée qui vient naturellement. Un token par chaîne, ce serait : une cardinalité non bornée (autant de tokens que de streamers), une génération impossible au build (la donnée est créée après le déploiement), un `tokens:check` qui échouerait à chaque inscription, et un package de design transformé en base de données. La règle sous-jacente est générale : **un token décrit une intention du design, pas une valeur appartenant à un utilisateur.**

#### Le mécanisme retenu

Les tokens déclarent un petit ensemble fermé de rôles :

| Rôle | Rempli par |
| --- | --- |
| `color.accent.default` | Token. L'accent du produit, utilisé hors contexte de chaîne. |
| `color.accent.onAccent` | Token. Le texte/glyphe posé sur une surface d'accent. |
| `color.accent.fallback` | Token. Le repli quand la couleur de chaîne est inutilisable. |

Côté Swift, `Core/DesignSystem` définit une valeur `ChannelTheme` immuable et `Sendable`, injectée dans l'environnement par la feature `Channel` :

```swift
public struct ChannelTheme: Sendable, Equatable {
    public let accent: Color        // surfaces et décor
    public let onAccent: Color      // contenu posé sur l'accent
    public let isFallback: Bool
}
```

Les vues lisent `@Environment(\.channelTheme)`. Hors d'une chaîne, l'environnement porte le thème par défaut construit sur les tokens. Aucune vue ne manipule un hexadécimal venu du réseau.

#### Validation de contraste à l'exécution

La couleur arrive par l'API : c'est une donnée non fiable, au même titre que n'importe quel champ. Elle est validée **deux fois**, et les deux fois comptent :

1. **Côté API, à l'enregistrement.** C'est là qu'on peut donner un retour utile au streamer (« cette couleur ne sera pas lisible sur le thème clair »). Une validation purement cliente le laisserait sans explication.
2. **Côté client, à la construction du `ChannelTheme`.** Parce que la règle serveur peut évoluer, parce que des valeurs antérieures à la règle existent, et parce qu'une donnée réseau ne se fait pas confiance.

La stratégie de repli est graduée, et volontairement pas binaire :

- La couleur est évaluée contre le fond du thème **courant** — donc potentiellement acceptable en sombre et refusée en clair. Le `ChannelTheme` est recalculé au changement de thème.
- Si le ratio est insuffisant, on **corrige d'abord la luminance** de la couleur (en espace OKLCH, teinte et chroma préservées, luminance bornée) jusqu'à franchir le seuil. L'identité perçue du streamer est conservée ; c'est nettement préférable à « votre violet devient gris ».
- Si la correction ne peut pas atteindre le seuil dans les bornes fixées, repli sur `color.accent.fallback`, et `isFallback` passe à `true` pour que l'UI puisse le signaler côté paramètres de chaîne.

Enfin, une règle d'usage qui est la vraie protection : **l'accent de chaîne n'est jamais employé pour un rôle porteur de sens.** Il habille l'en-tête de chaîne, le bouton de suivi, les accents décoratifs. Il ne remplace jamais le rouge « en direct », ni un badge de rôle, ni un état d'erreur. Sans cette règle, un streamer qui choisit un rouge vif rendrait son indicateur de live indistinct de son décor.

---

### 4. Contrôle de contraste automatisé au build

Amélioration nette sur le dispositif `netflix`, et le garde-fou qui justifie le plus l'outillage en solo.

**Décision : `tokens/contrast-pairs.json` déclare les couples avant-plan / arrière-plan du design et leur seuil. Une étape de build calcule le ratio WCAG 2.1 pour chaque couple, dans chaque thème, et échoue si un seul passe sous son seuil.**

```jsonc
{
  "pairs": [
    { "foreground": "color.text.primary",   "background": "color.background.primary", "min": 4.5 },
    { "foreground": "color.text.secondary", "background": "color.surface.elevated",   "min": 4.5 },
    { "foreground": "color.status.live",    "background": "color.background.primary", "min": 3.0,
      "note": "SC 1.4.11 — indicateur non textuel" },
    { "foreground": "color.chat.username.3", "background": "color.surface.chat",      "min": 4.5 }
  ]
}
```

Choix de fond :

- **Seuils** : 4.5:1 pour le texte courant (WCAG 2.1 AA, SC 1.4.3), 3:1 pour le texte large et pour les éléments non textuels porteurs d'information (SC 1.4.11).
- **Les deux thèmes sont vérifiés à chaque build**, avec la même liste de paires. C'est ce qui empêche le thème clair d'être une pensée après coup — et ce sera le cas, puisqu'on développe en sombre.
- **Le validateur refuse une paire dont l'avant-plan est translucide sans fond de composition explicite.** Un ratio ne veut rien dire sur une couleur à alpha tant qu'on ne sait pas sur quoi elle est composée ; produire un chiffre là serait pire que ne rien vérifier, parce que ce serait une assurance fausse.
- **Le ratio est une fonction pure testée** (`src/contrast/`), contre les vecteurs de référence de la spécification WCAG — dont les cas dégénérés noir/blanc (21:1) et identiques (1:1).
- **La même fonction existe côté Swift** dans `Core/DesignSystem` pour la validation runtime de l'accent de chaîne. Deux implémentations, donc un risque de dérive : le script `export-vectors` écrit un fichier de cas de test JSON dans le package SPM généré, et les tests Swift le consomment. Les deux implémentations sont ainsi tenues par le même jeu d'assertions.

Ce que ce contrôle **ne** fait **pas**, et il faut le dire : il vérifie les paires *déclarées*, pas les paires réellement composées à l'écran. Une vue peut poser `text.secondary` sur `surface.chat` sans que le couple figure dans la liste. C'est traité en risques.

---

### 5. Tokens du domaine live : ce qui est un rôle, ce qui est une donnée

Le vocabulaire du live est ce qui distingue ce design system d'un système générique. La ligne de partage :

| Élément | Nature | Justification |
| --- | --- | --- |
| Rouge « en direct » | **Token** `color.status.live` | Signifiant produit, cardinalité 1, doit être identique partout. |
| État de chaîne (en ligne / hors ligne / rediffusion) | **Token** `color.status.online` / `.offline` / `.rerun` | Ensemble fermé de trois états définis par le produit. |
| Niveaux d'abonnement 1/2/3 | **Token** `color.tier.one` / `.two` / `.three` | Cardinalité fermée, fixée par le catalogue de l'ADR 0015. Le *prix* et le *libellé* du tier sont des données ; son traitement visuel est un rôle. |
| Badges de rôle du chat (broadcaster, modérateur, VIP, abonné) | **Token** `color.badge.*` | Ensemble fermé, aligné sur les rôles de l'ADR 0006. Un rôle d'autorisation qui apparaît dans l'UI a une couleur de rôle. |
| **Palette** de couleurs de pseudo | **Token** `color.chatUsername.1…n` | Voir ci-dessous. |
| **Choix** de couleur de pseudo d'un utilisateur | **Donnée** : un index dans la palette | Voir ci-dessous. |
| Dimensions d'emotes et de badges | **Token** `dimension.emote.*` / `dimension.badge.*` | Métriques de mise en page, réutilisées à l'identique dans le chat, le sélecteur et la fiche. |
| Couleur d'accent d'une chaîne | **Donnée** | Section 3. |
| Nombre de viewers, durée du live, URL d'une emote, code d'une emote | **Donnée** | Aucune décision de design là-dedans. |

**Le cas des couleurs de pseudo mérite d'être argumenté**, parce qu'il est le plus ambigu et que la réponse naïve est mauvaise. Twitch permet historiquement à certains utilisateurs de choisir un hexadécimal libre. On l'écarte. Motif : une couleur libre ne peut pas être garantie lisible sur le fond du chat, dans les deux thèmes, et la corriger à l'exécution supposerait un calcul de contraste par message sur un flux qui peut monter à cinquante messages par seconde (ADR 0004, 0011). **La palette de pseudos est donc un ensemble fermé et ordonné de tokens, choisi pour franchir 4.5:1 sur `color.surface.chat` dans les deux thèmes** — chaque entrée est déclarée dans `contrast-pairs.json`, donc vérifiée au build. Le choix de l'utilisateur est un **index** dans cette palette, pas une couleur. La lisibilité devient une propriété du système au lieu d'une espérance.

C'est la même logique que pour l'accent de chaîne, appliquée à l'autre bout : quand la personnalisation peut être bornée sans perte de valeur produit, on la borne ; quand elle ne peut pas l'être (l'identité d'une chaîne), on la valide et on prévoit un repli.

---

### 6. Dynamic Type, emotes, et mouvement

#### Typographie

Reprise intégrale de l'approche `netflix` : text styles système plus graisse, jamais de taille en points, refus des noms qui masquent `Font`. Rien à amender.

#### Emotes et badges sous Dynamic Type

C'est là que l'approche `netflix` ne suffit plus. À la taille d'accessibilité maximale, le texte d'un message de chat triple, et une emote figée à 28 points devient un timbre-poste au milieu d'un texte géant : la ligne se disloque et le message, dont l'emote est une partie du sens, devient incompréhensible.

**Décision : les dimensions d'emotes et de badges ne sont pas des constantes figées. Chaque token porte sa taille de référence, le text style auquel elle se rapporte, et un plafond d'agrandissement.**

```jsonc
"emote": {
  "inline": {
    "$type": "dimension",
    "$value": "{core.dimension.350}",
    "$description": "Emote dans une ligne de chat. Mesurée pour s'aligner sur la hauteur de capitale du corps de texte.",
    "$extensions": { "com.twitch.scale": { "relativeTo": "body", "maxScale": 2.0 } }
  }
}
```

Le formatter génère une valeur portant ces métadonnées, et `Core/DesignSystem` fournit un modificateur qui applique `@ScaledMetric(relativeTo:)` avec le plafond. Le plafond n'est pas une coquetterie : sans lui, à AX5, un message contenant six emotes devient une colonne d'images. Il ne s'applique **qu'aux images inline, jamais au texte** — plafonner du texte serait ignorer un réglage d'accessibilité, ce qui n'est pas acceptable ; plafonner une illustration décorative qui accompagne du texte agrandi l'est.

Corollaire hors tokens, noté ici parce que c'est le même problème : une emote est une image porteuse de sens, elle a besoin d'un label d'accessibilité. Ce label est le code de l'emote — une donnée, pas un token.

#### Mouvement

**Décision : oui, des tokens de mouvement, et oui, une variante `reduced`.** Le produit en a un besoin concret : l'indicateur « en direct » pulse, les messages de chat entrent en animation, un cheer déclenche une célébration, le player transitionne vers le plein écran. Ce sont exactement les animations que `prefers-reduced-motion` existe pour désactiver, et laisser ces durées en dur dans les vues garantit que la moitié seulement respectera le réglage.

```jsonc
"duration": {
  "livePulse": { "$type": "duration", "$value": "1200ms",
    "$extensions": { "com.twitch.reducedMotion": "0ms" } }
}
```

Le formatter génère une valeur résolue via `accessibilityReduceMotion`, de sorte que le site d'appel ne teste rien.

Et une règle de design qui accompagne le token : **l'état « en direct » ne se signale jamais par le seul mouvement.** Le pulse s'arrête en mouvement réduit ; le point rouge et le libellé « EN DIRECT » restent. Un état qui disparaît quand on désactive les animations est un bug d'accessibilité, pas un compromis.

---

### 7. Cibles de sortie : Swift et CSS. Ni Android, ni JavaScript.

**Décision tranchée : le package génère le package SPM Swift *et* un fichier de variables CSS. Rien d'autre.**

Le CSS n'est pas de l'anticipation : il a un consommateur réel et déjà décidé, le back-office Payload (ADR 0007), dont l'interface d'administration accepte une feuille de style. Sans tokens partagés, sa palette divergera de l'app — et la divergence sera invisible jusqu'au jour où quelqu'un compare deux captures.

L'argument YAGNI ne s'applique pas ici, et il faut être précis sur pourquoi : YAGNI protège du **code à écrire et à maintenir**. Le CSS ne demande ni l'un ni l'autre — c'est le format intégré `css/variables` de Style Dictionary, soit une entrée dans `platforms` de la configuration, zéro ligne de formatter maison, zéro test à écrire. Les deux thèmes s'expriment naturellement en un bloc `:root` et un bloc sous `@media (prefers-color-scheme: dark)`. Le coût marginal est une entrée de configuration ; le bénéfice est la fin d'une source de divergence.

En revanche **pas d'Android** (aucune plateforme Android au programme) et **pas de sortie JavaScript/TypeScript** (aucun consommateur : les schémas partagés du monorepo relèvent de l'ADR 0009, pas des tokens). Ces deux-là seraient de l'anticipation pure, et la sortie Android en particulier demanderait des formatters maison, donc du code et des tests.

Le contrôle de contraste s'applique aux deux cibles : ce sont les mêmes tokens résolus, la vérification est en amont de la génération.

---

### 8. Insertion dans le graphe de modules — résolution de la contradiction avec l'ADR 0010

L'ADR 0010 énonce en règle 5 que `Core/DesignSystem` est « une feuille dont tout le monde peut dépendre, et qui ne dépend de rien », et précise en notes d'implémentation qu'il « ne dépend de rien d'autre que SwiftUI ». Cet ADR introduit un package dont `DesignSystem` devra dépendre. La contradiction est réelle et doit être tranchée, pas contournée.

**Ce que la règle 5 protégeait.** Son objet n'est pas le nombre de dépendances de `DesignSystem` : c'est l'absence de cycle et l'absence de métier. `DesignSystem` est importé par tout le monde ; s'il pouvait importer `Domain`, `Core/Networking` ou une `Feature`, il deviendrait le point par lequel n'importe quoi atteint n'importe quoi. « Ne dépend de rien » était une formulation commode de « ne peut créer aucun cycle et ne connaît aucun métier ».

**Ce que le package de tokens est.** Une feuille absolue : aucun code écrit à la main, aucune logique, aucune dépendance hors SwiftUI, aucune connaissance du projet. Il ne peut participer à aucun cycle, par construction. Il est au graphe ce que SwiftUI est déjà : un plancher.

**Décision : `DesignTokens` devient le plancher du graphe iOS, sous `DesignSystem`, et la règle 5 est reformulée comme suit.**

> 5. **`Core/*` ne dépendent pas entre eux**, à une exception nommée : `DesignSystem` est une feuille dont tout le monde peut dépendre. `DesignSystem` ne dépend que de SwiftUI et de `DesignTokens`, package **généré** (ADR 0019) sans code écrit à la main, sans dépendance hors SwiftUI, et qui ne connaît aucun module du projet — il est un plancher du graphe, au même titre que SwiftUI.
>
> 5 bis. **Aucun module autre que `Core/DesignSystem` n'importe `DesignTokens`.** Les `Features/*` consomment les composants et les styles de `DesignSystem`, pas les tokens bruts.

La règle 5 bis n'est pas une formalité, c'est elle qui préserve le bénéfice. Si une feature importe directement les tokens, elle court-circuite les composants, et la capacité à changer un rendu en un seul point disparaît — ce qui était l'objet de tout l'exercice. Elle est vérifiable mécaniquement par le lint d'imports déjà prévu par l'ADR 0010 : un `import DesignTokens` hors de `Core/DesignSystem` fait échouer la CI.

Le graphe devient :

```
Features/*  →  Core/DesignSystem  →  DesignTokens (généré)  →  SwiftUI
            →  Domain
```

Aucune règle de l'ADR 0010 n'est affaiblie : la règle 4 (aucune dépendance feature → feature) est intacte, l'isolation de `Domain` est intacte, et la nouvelle arête ne va que vers le bas.

**Résolution physique.** Le package généré vit dans `packages/design-tokens/platforms/swift/` (côté monorepo pnpm), et `Packages/Package.swift` (côté Xcode) le référence par chemin relatif : `.package(path: "../packages/design-tokens/platforms/swift")`. Cette arête traverse la frontière entre les deux mondes d'outillage, ce qui est un point de fragilité nommé dans les risques.

---

### 9. Provenance des valeurs

Reprise de la discipline de `netflix`, qui est le point le plus sous-estimé de son README. Chaque axe déclare **d'où vient sa valeur**, et chaque `$description` le rappelle au niveau du token.

| Axe | Origine | Ce qu'on peut en faire |
| --- | --- | --- |
| Couleurs de marque et accent par défaut | Charte publique de la marque, relevée sur les surfaces officielles. | Ne pas toucher sans décision explicite. |
| Palettes neutres clair / sombre | **Convention**, construite comme une échelle de luminance régulière, contrainte par les paires de contraste. | Retouchable, tant que le contrôle de contraste passe. |
| Couleurs d'état du live et des badges | **Décision produit** : ce sont des signifiants, choisis pour être distinguables entre eux et des couleurs d'accent. | Retouchable, mais toute modification touche au sens. |
| Palette de pseudos de chat | **Convention**, dimensionnée par la contrainte de contraste sur le fond du chat dans les deux thèmes. | Ajouter une entrée impose d'ajouter sa paire de contraste. |
| Typographie | **Convention** : text styles système iOS. | Libre. |
| Espacements et rayons | **Convention** : grille 8pt (Apple HIG). | Libre. |
| Dimensions d'emotes et de badges | **Mesuré** : alignement sur la hauteur de capitale du corps de texte. | Toucher casse l'alignement vertical du chat. |
| Durées de mouvement | **Convention**, calées sur les durées d'animation système iOS. | Libre. |

Pourquoi cette discipline est ce qui rend le package maintenable : sans elle, six mois plus tard, on ne sait plus si modifier une valeur revient à **corriger une convention qu'on s'est donnée** (gratuit, à faire sans réfléchir) ou à **s'écarter d'une décision de design** (coûteux, à faire sciemment). En solo, cette mémoire n'existe nulle part ailleurs que dans le fichier.

---

### 10. Workflow de mise à jour

Divergence assumée avec `netflix`, qui part d'un fichier Figma via l'API REST.

**Il n'existe pas aujourd'hui de source de design arrêtée pour ce projet.** Prétendre le contraire produirait un pipeline de synchronisation vers un fichier vide. Donc :

**Décision : jusqu'à nouvel ordre, `tokens/` fait foi. Il est édité à la main.** C'est l'inversion exacte de la règle `netflix` n° 2 (« `tokens/` n'est jamais édité à la main »), et elle est suspendue explicitement plutôt que silencieusement.

Contreparties, qui sont ce qui empêche l'édition manuelle de dégénérer :

1. Toute valeur ajoutée ou modifiée renseigne sa **provenance** dans `$description`, selon la grille ci-dessus.
2. Un token n'est ajouté que lorsqu'un **écran réel** en a besoin. Pas d'échelle complète « au cas où ».
3. Toute couleur de texte ou d'élément porteur d'information ajoute sa **paire de contraste** dans le même commit. Un rôle de couleur sans paire déclarée est un rôle non vérifié.
4. `tokens/`, `platforms/swift/` et `platforms/css/` sont committés **ensemble**. Le `tokens:check` en CI ne pardonne pas l'oubli.

**Critère de bascule**, écrit d'avance pour qu'il soit appliqué et pas discuté : dès qu'un fichier de design existe avec des **Figma Variables publiées** couvrant au moins les couleurs des deux thèmes, on bascule. L'export DTCG devient la source, `tokens/` redevient généré, l'édition manuelle est interdite, et la règle n° 2 est rétablie. Le format DTCG retenu ici est celui qu'exporte Tokens Studio : la bascule change la manière dont `tokens/` est rempli, pas le package.

## Conséquences

### Positives

- Une seule source de vérité pour le vocabulaire visuel, partagée par l'app iOS et le back-office.
- **La complétude des deux thèmes est un invariant de build.** Il est impossible d'ajouter un rôle en sombre en oubliant le clair.
- **Le code applicatif n'écrit jamais `if colorScheme == .dark`.** La résolution du thème est prise en charge par le système, à chaud, et une preview bascule d'un modificateur.
- **Le contraste est vérifié mécaniquement** sur les paires déclarées, dans les deux thèmes, à chaque build — un garde-fou d'accessibilité qui ne dépend d'aucune vigilance humaine.
- La couleur d'accent d'une chaîne a une frontière nette : un contrat de palette côté tokens, une valeur validée et repliée côté runtime, et une interdiction d'usage sur les rôles porteurs de sens.
- Le vocabulaire du live (états, badges, tiers, emotes) est nommé une fois et ne peut plus diverger entre écrans.
- Dynamic Type hérité gratuitement, **y compris pour les images inline du chat**, ce qu'une taille figée aurait cassé aux tailles d'accessibilité.
- Le mouvement respecte `reduce motion` par construction, sans que chaque animation ait à y penser.
- Formatters et calcul de contraste sont des **fonctions pures testables en TDD**, sans simulateur, cohérentes avec la discipline du projet.
- Le rethémage futur (co-branding, thème événementiel) est un fichier d'alias, pas une refonte.
- Le généré étant versionné, Xcode ne dépend d'aucun toolchain JavaScript et les previews restent rapides (ADR 0010).

### Négatives

- **Un package de plus à maintenir**, avec sa configuration, ses formatters et ses tests, avant même le premier écran.
- La boucle « changer une couleur » passe par `tokens/` → `pnpm build` → commit du généré. Plus longue qu'éditer une constante Swift, et il faudra y résister.
- **Le généré est versionné**, donc les diffs de PR contiennent du bruit et le `tokens:check` échoue chaque fois qu'on oublie de rejouer le build.
- Le fournisseur `UIColor` dynamique ne se résout pas hors contexte de traits : un contournement documenté existe, mais c'est un piège silencieux plutôt qu'une erreur de compilation.
- Le calcul de ratio de contraste est **implémenté deux fois** (TypeScript pour le build, Swift pour le runtime) : duplication réelle, atténuée mais non supprimée par le partage de vecteurs de test.
- Deux thèmes doublent le coût de chaque nouvelle couleur, et imposent de décliner chaque preview.
- L'écosystème DTCG n'est pas stabilisé : les `$type` personnalisés (`iosTextStyle`) et les `$extensions` utilisés ici sont des conventions locales, pas un standard.
- Le rendu final passe par une chaîne d'outils : quand une couleur est fausse à l'écran, la cause peut être dans le token, l'alias, le formatter ou le généré non recompilé.

### Risques et mitigations

- **Modéliser des rôles sémantiques faux, faute d'écrans réels.** C'est le risque principal, et il est probable, pas théorique. Construire une taxonomie sémantique avant d'avoir dessiné trois écrans produit des rôles qui décrivent des valeurs (`color.purple`) plutôt que des intentions, ou des rôles trop fins qui n'ont qu'un seul usage. Mitigations : ne créer que les tokens dont la **première feature verticale** (`Channel`, ordre fixé par l'ADR 0010) a besoin ; règle de relecture — *un token qui n'a toujours qu'un seul usage après trois écrans n'est pas un rôle, c'est une valeur*, il est fusionné ou supprimé ; accepter les renommages tant que le nombre d'usages reste faible, et considérer la taxonomie comme instable jusqu'au troisième écran livré.
- **Fausse assurance du contrôle de contraste.** Il valide les paires *déclarées*, pas les paires réellement composées à l'écran. Une vue peut poser n'importe quel texte sur n'importe quelle surface sans que le couple soit dans la liste — et le build restera vert. Mitigations : déclarer les paires fait partie de la définition de fini d'un composant de `DesignSystem` ; audit ponctuel à l'Accessibility Inspector sur les écrans livrés ; à terme, envisager un lint qui repère les couples `foregroundStyle`/`background` non déclarés, sans surestimer sa faisabilité.
- **Le modèle de contraste WCAG 2.1 est imparfait sur fond sombre**, où il surestime la lisibilité du texte clair. Mitigations : viser une marge au-dessus du seuil sur le corps de texte du thème sombre plutôt que le strict 4.5 ; suivre l'évolution d'APCA / WCAG 3, sans l'adopter tant que WCAG 2.1 reste le référentiel opposable (RGAA, EN 301 549).
- **Dérive entre l'implémentation TypeScript et l'implémentation Swift du ratio.** Mitigation : vecteurs de test générés par le package et consommés par les tests Swift, incluant les cas limites. Si la dérive survient malgré tout, le repli est d'abandonner la validation runtime côté client et de s'appuyer uniquement sur la validation serveur — moins robuste, mais sans duplication.
- **Une couleur d'accent hostile.** Un streamer choisit un rouge proche du rouge « en direct », ou un vert proche du badge modérateur : la correction de contraste ne détecte rien, puisque le problème est une collision de sens, pas de lisibilité. Mitigation : la règle d'usage — l'accent ne porte jamais un rôle signifiant — est la seule protection réelle. Complément possible si le cas se présente : refuser les teintes dans un intervalle autour des couleurs d'état.
- **Le thème clair sera sous-testé.** On développera en sombre, et le clair se dégradera sans qu'on le voie. Mitigations : previews systématiquement déclinées en `.preferredColorScheme(.light)` et `.dark` ; contrôle de contraste exécuté sur les deux ; et la complétude structurelle empêche au moins l'absence pure et simple d'une valeur.
- **Le plafond d'agrandissement des emotes peut être lu comme une entorse à l'accessibilité.** Mitigation : plafond fixé haut (2x), appliqué exclusivement aux images inline, jamais au texte, et à revoir sur retour d'usage réel en tailles d'accessibilité.
- **Fragilité du chemin relatif entre `Packages/Package.swift` et `packages/design-tokens/platforms/swift/`.** Cette arête traverse la frontière pnpm/Xcode, et l'ADR 0010 documente déjà l'instabilité d'Xcode sur les packages locaux. Mitigation : chemin relatif et jamais d'URL, `Package.swift` du package généré stable (il n'est pas régénéré à chaque build, seules les sources le sont), et acceptation du `rm -rf DerivedData` déjà admise.
- **Sur-ingénierie initiale.** Un package avec formatters, validateur de contraste, vecteurs partagés et deux cibles de sortie, avant le premier écran, est beaucoup pour une personne. Mitigation : ordre de construction strict (ci-dessous), et critère d'arrêt — rien n'est ajouté au package tant qu'un écran réel ne le réclame.
- **Style Dictionary v5 et la spécification DTCG évoluent encore.** Mitigation : la logique de valeur vit dans les formatters maison, qui sont des fonctions pures testées et portables ; Style Dictionary n'assure que la résolution d'alias et l'orchestration. Un changement de compilateur serait douloureux mais pas structurant.

## Notes d'implémentation

- **Ordre de construction**, aligné sur l'ordre de l'ADR 0010 (`Domain` → `Core/DesignSystem` → …) : (1) formatter de couleurs bi-thèmes et son test ; (2) `core` + `semantic` des couleurs, deux thèmes, quatre ou cinq rôles seulement ; (3) `tokens:check` en CI ; (4) contrôle de contraste ; (5) typographie et espacements ; (6) tokens du domaine live ; (7) mouvement ; (8) sortie CSS. Ne pas commencer par la taxonomie complète.
- Les formatters restent des fonctions pures `(tokens) => string`, testées sans Style Dictionary ; l'adaptateur SD est une coquille sans logique, comme dans le package `netflix`.
- Le build construit un dictionnaire par thème puis joint les dictionnaires résolus. L'assertion de complétude structurelle est faite **avant** tout formatage, pour que l'erreur nomme le chemin manquant et le thème concerné.
- Le formatter de couleurs génère, pour chaque rôle, la `static let` dynamique **et** les deux valeurs statiques sous `Color.Static.*`, réservées aux contextes sans traits et aux tests.
- `tokens:check`, `check-contrast` et `test` sont trois tâches Turborepo distinctes, pour que l'échec nomme sa cause.
- Côté Xcode : `.package(path: "../packages/design-tokens/platforms/swift")` dans `Packages/Package.swift`, et `DesignTokens` en dépendance du seul target `Core/DesignSystem`.
- La règle 5 bis (interdiction d'importer `DesignTokens` hors de `DesignSystem`) s'ajoute au script de lint d'imports déjà prévu par l'ADR 0010.
- Le `Package.swift` du package généré est écrit une fois et n'est pas régénéré : seules les sources le sont, ce qui évite un churn inutile et une casse de la résolution Xcode à chaque build.
- La validation serveur de la couleur d'accent de chaîne appartient au contexte `channel` et passe par le contrat de l'ADR 0009 ; le seuil et la règle de repli sont documentés ici et implémentés là-bas.

## Liens

- ADR 0009 — Contrat API : Zod source de vérité. La couleur d'accent d'une chaîne est un champ de ce contrat, validé au même titre que les autres ; les tokens n'en portent que le rôle et le repli.
- ADR 0010 — Modularisation iOS en packages SPM locaux. **Cet ADR amende sa règle 5** et y ajoute une règle 5 bis : `DesignTokens` devient le plancher du graphe sous `Core/DesignSystem`, et seul `DesignSystem` a le droit de l'importer.
- ADR 0011 — Architecture de présentation iOS : MV avec `@Observable`. Le `ChannelTheme` est une valeur immuable injectée par l'environnement, conformément au mode d'injection retenu là-bas ; il n'introduit aucun objet observable supplémentaire.
- ADR 0007 — Payload en CMS et console d'admin par proxy. Consommateur de la sortie CSS, et justification de son existence.
- ADR 0018 — Qualité de code et discipline de dépôt. Les garde-fous introduits ici (`tokens:check`, contrôle de contraste, lint d'imports, tests des formatters) sont des tâches de CI qui relèvent de cette discipline ; le cas particulier du **code généré versionné** — exclu du lint et du formatage, mais vérifié pour sa fraîcheur — est à cadrer avec lui.
