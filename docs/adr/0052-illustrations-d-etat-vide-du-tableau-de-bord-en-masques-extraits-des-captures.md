# 0052 — Les illustrations d'état vide du tableau de bord sont des masques extraits des captures, colorés par tokens

- Statut : Proposé
- Date : 2026-11-05
- Décideurs : Muhammed Cavus
- Amende : ADR 0036 (§6 marque), ADR 0040 (§1, une seule illustration dans l'app)

## Contexte et problématique

Le tableau de bord des créateurs a deux onglets dont l'état vide montre une illustration au-dessus du message :

- **Contenu** (`docs/new-reference-ui/IMG_9625.PNG`) : un clap de cinéma, au-dessus de « Aucun clip de votre chaîne ».
- **Statistiques** (`docs/new-reference-ui/IMG_9626.PNG`, et derrière la feuille d'actions de `IMG_9627.PNG`) : un graphique en barres sur une feuille, au-dessus de « Aucun résumé de stream pour votre chaîne ».

L'app affiche aujourd'hui le message seul (`DashboardEmptyState`). Les deux dessins appartiennent à Twitch. L'ADR 0040 ne reprend qu'une illustration, celle de « You're All Set! », « sur cet écran seulement », depuis un fichier fourni. Aucun fichier officiel n'existe pour ces deux dessins : la seule source est la capture.

Relevé sur les captures, à @3x : chaque dessin tient en quatre teintes, l'encre `#000000`, le contour et l'ombre `#323338`, le remplissage `#ffffff`, sur le fond `#f7f7f8`. Le clap occupe environ 415 × 380 px (138 × 127 pt), le graphique environ 406 × 410 px (135 × 137 pt). Aucune capture ne montre ces écrans en thème sombre.

L'ADR 0046 a déjà tranché un cas voisin pour les glyphes d'interface : extraits des captures en masques, sans retouche, colorés par un `ColorRole`.

Problématique : les états vides de Contenu et de Statistiques montrent-ils l'illustration de Twitch, d'où vient-elle, et comment suit-elle les tokens et les deux thèmes ?

## Facteurs de décision

- **Fidélité** (ADR 0036) : l'illustration domine l'écran vide, son absence se voit.
- **Sans retouche** (décision Q4 de `plans/ios-design-fidelite.md`, ADR 0046) : aucun trait dessiné à la main.
- **Provenance** : chaque illustration remonte à une capture et à un rectangle.
- **Tokens** (ADR 0019) : une couleur de l'interface passe par un token, dans les deux thèmes.
- **Thème sombre** : l'illustration ne doit pas s'afficher dans un carré clair (la conséquence négative acceptée par l'ADR 0040).
- **Projet Xcode** : seules les ressources d'un paquet SwiftPM sont permises (ADR 0046).

## Options envisagées

### Option A — Pas d'illustration

- Avantages : aucune œuvre tierce de plus dans le dépôt.
- Inconvénients : l'écran vide perd son élément principal.
- **Écartée** : contraire à l'ADR 0036.

### Option B — Fichiers officiels fournis par le décideur, comme l'ADR 0040

- Avantages : image nette ; provenance citée.
- Inconvénients : ces fichiers n'existent pas dans le dépôt.
- **Écartée** pour l'instant. Elle reste la cible si ces fichiers arrivent.

### Option C — Découpe opaque de la capture, versionnée telle quelle

- Avantages : immédiate ; pixel pour pixel.
- Inconvénients : le fond `#f7f7f8` est dans l'image, d'où un carré clair en thème sombre ; les couleurs sont figées dans le fichier, hors tokens.
- **Écartée.**

### Option D — Masques par teinte extraits de la capture, colorés par tokens

- Avantages : même méthode que l'ADR 0046, donc sans retouche et traçable ; fond transparent ; chaque teinte suit un `ColorRole` dans les deux thèmes.
- Inconvénients : résolution figée à @3x ; trois masques par illustration au lieu d'un ; la séparation des teintes sur les bords lissés demande un traitement plus fin que pour un glyphe unicolore.
- **Retenue.**

### Option E — Redessin vectoriel à l'identique (SVG ou `Path` SwiftUI)

- Avantages : net à toutes les échelles ; couleurs par tokens.
- Inconvénients : c'est une retouche, contraire à la décision Q4 et à l'option C écartée par l'ADR 0046 ; le trait « fait main » des dessins se reproduit mal à la main.
- **Écartée.**

## Décision

### 1. Écrans concernés

Deux illustrations sont reprises, sur ces écrans seulement :

| Illustration        | Écran                                      | Capture source                       |
| ------------------- | ------------------------------------------ | ------------------------------------ |
| Clap                | Tableau de bord, onglet Contenu, vide      | `docs/new-reference-ui/IMG_9625.PNG` |
| Graphique en barres | Tableau de bord, onglet Statistiques, vide | `docs/new-reference-ui/IMG_9626.PNG` |

`IMG_9627.PNG` montre la même illustration de Statistiques sous un voile : elle sert à contrôler, pas à extraire. Toute autre illustration demande un nouvel ADR. L'ADR 0040 s'applique toujours à « You're All Set! ».

### 2. Extraction

Chaque illustration est découpée dans sa capture en pleine résolution (@3x), selon la méthode de l'ADR 0046 §1, étendue à plusieurs teintes :

- un masque par teinte : encre (`#000000`), contour (`#323338`), remplissage (`#ffffff`) ;
- le fond `#f7f7f8` devient transparent ;
- un pixel de bord, entre deux teintes, se répartit entre leurs deux masques selon sa position entre elles ;
- le traitement n'ajoute, n'efface ni ne déplace aucun pixel.

### 3. Rangement et provenance

Les masques sont des ressources du paquet `Core/DesignSystem`, en PNG @3x, à côté des glyphes. Un manifeste versionné donne pour chaque illustration la capture, le rectangle de découpe, le fond et les teintes. Un test vérifie que chaque masque a son entrée dans le manifeste, et l'inverse, et qu'un masque recomposé sur le fond relevé redonne la découpe de la capture, à une tolérance près fixée par le test.

### 4. Couleurs et thèmes

Chaque masque s'affiche en mode gabarit, coloré par un `ColorRole` (ADR 0019) : un rôle pour l'encre, un pour le contour, un pour le remplissage. Une couleur manquante entre dans `packages/design-tokens/tokens/` avec la provenance « Relevé sur les captures de l'app iOS Twitch (docs/new-reference-ui/IMG_9625, IMG_9626) ».

Aucune capture ne montre ces écrans en thème sombre. Tant qu'il n'y en a pas, les trois rôles gardent en sombre leur valeur claire : l'illustration se pose sur le fond sombre comme un autocollant, sans carré autour.

### 5. Accessibilité

L'illustration est décorative : masquée à VoiceOver (`accessibilityHidden(true)`). Le message sous l'illustration porte seul le sens de l'état vide. L'illustration garde sa taille relevée ; le message suit le Dynamic Type.

### 6. Point d'entrée

`Core/DesignSystem` expose les illustrations par un point d'entrée unique, qui empile les masques dans l'ordre remplissage, contour, encre. Les écrans de `Features/Dashboard` ne lisent ni fichier ni couleur.

## Conséquences

### Positives

- Les états vides de Contenu et de Statistiques ressemblent aux captures.
- Chaque illustration remonte à une capture et à un rectangle, et le test de recomposition détecte une retouche.
- Pas de carré clair en thème sombre, contrairement à l'illustration de l'ADR 0040.

### Négatives

- **Dépôt public** : deux éléments graphiques de Twitch de plus.
- **Écrans @2x** : le masque @3x est réduit par le système, le trait s'adoucit.
- **Agrandissement** : l'illustration ne suit pas le Dynamic Type sans flou.
- **Thème sombre non relevé** : les couleurs claires en sombre sont un choix par défaut, pas une valeur de Twitch. Le contour `#323338` se distingue peu d'un fond sombre ; seul le remplissage blanc dessine la forme.
- **Trois masques par illustration**, et un traitement des bords plus complexe que pour les glyphes.

### Risques et mitigations

- **Bords mal répartis entre teintes** (halo, liseré). Mitigation : le test de recomposition compare le résultat à la capture.
- **Masque retouché par mégarde.** Mitigation : le manifeste permet de refaire l'extraction et de comparer.
- **L'illustration gagne d'autres écrans sans décision.** Mitigation : la liste du §1 est fermée ; le point d'entrée n'expose que ces deux illustrations.
- **Rendu sombre réel différent chez Twitch.** Mitigation : une capture sombre des deux écrans fixe les valeurs sombres des trois rôles, par une PR de tokens, sans nouvel ADR.

## Notes d'implémentation

1. Tant que l'ADR est `Proposé`, l'état vide reste le message seul.
2. Après acceptation, une PR ajoute le script d'extraction, les masques, le manifeste et leurs tests dans `Core/DesignSystem`, puis les rôles de couleur manquants (le contour `#323338` n'a pas de token aujourd'hui).
3. Une seconde PR branche le point d'entrée dans `DashboardEmptyState`, en citant `IMG_9625` et `IMG_9626`.

## Liens

- [ADR 0040](0040-illustration-inscription-terminee-reprise-telle-quelle.md) — illustration de « You're All Set! » reprise telle quelle ; cet ADR amende son §1, qui limitait la reprise à cet écran.
- [ADR 0046](0046-glyphes-d-interface-extraits-des-captures-en-masques.md) — glyphes extraits des captures en masques ; même méthode, étendue à plusieurs teintes.
- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles relevées sur l'app iOS Twitch ; cet ADR amende son §6 pour ces deux illustrations.
- [ADR 0019](0019-package-design-tokens.md) — design tokens, dont les rôles de couleur des masques.
- [ADR 0010](0010-modularisation-ios-packages-spm-locaux.md) — `Core/DesignSystem`, seul module qui porte les ressources graphiques.
