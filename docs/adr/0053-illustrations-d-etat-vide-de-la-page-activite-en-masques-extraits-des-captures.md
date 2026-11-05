# 0053 — Les illustrations d'état vide de la page Activité sont des masques extraits des captures, comme celles du tableau de bord

- Statut : Proposé
- Date : 2026-11-06
- Décideurs : Muhammed Cavus
- Amende : ADR 0052 (§1, liste fermée des illustrations ; §2 et §4, trois teintes par illustration)

## Contexte et problématique

La page Activité du mode spectateur a deux onglets, chacun construit sur son état vide tant que les notifications (T2) et les chuchotements (hors périmètre, ADR 0021 §5) n'existent pas. Dans l'app Twitch, ces deux états vides montrent une illustration au-dessus du message :

- **Chuchotements** (`docs/new-reference-ui/IMG_9613.PNG`) : un personnage inquiet, au-dessus de « Aucun chuchotement disponible ». La même illustration figure dans `docs/reference-ui/messages/liste-whispers--vide.png`.
- **Notifications** : aucune capture de `docs/new-reference-ui/` ne montre cet état. `docs/reference-ui/creer/notifications-createur--vide.png` (thème clair) et `docs/reference-ui/activite/notifications--vide-theme-sombre.png` (thème sombre) montrent un personnage à lunettes de soleil sur un carré violet, au-dessus de « You're all caught up. What a pro! ».

L'ADR 0052 §1 ferme la liste des illustrations au clap et au graphique du tableau de bord : « Toute autre illustration demande un nouvel ADR. » Son §2 sépare chaque dessin en trois teintes (encre, contour, remplissage).

Relevé sur les captures, à @3x :

| Illustration | Capture source                                             | Rectangle (px)              | Fond      | Teintes                                                                                                          |
| ------------ | ---------------------------------------------------------- | --------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------- |
| Personnage   | `docs/new-reference-ui/IMG_9613.PNG`                       | environ 362, 883, 481 × 531 | `#f7f7f8` | encre `#000000`, contour `#323239`, remplissage `#ffffff`, surlignage jaune `#f5f500`, losange de fond `#efeff1` |
| Lunettes     | `docs/reference-ui/creer/notifications-createur--vide.png` | environ 344, 943, 513 × 471 | `#f7f7f7` | encre `#000000`, contour `#323337`, remplissage `#ffffff`, surlignage jaune, carré violet `#9047ff`              |

Chaque dessin tient en cinq teintes, pas trois. Le jaune n'a pas de token aujourd'hui ; le gris `#efeff1` (`core.color.neutral.90`), le violet (`core.color.purple.60`, `#9147ff`) et le contour (`core.color.neutral.20`, `#323338`) en ont un. La capture sombre des notifications montre le même dessin, aux mêmes couleurs, posé sur le fond sombre : c'est la première valeur sombre relevée pour une illustration.

Problématique : les états vides de la page Activité montrent-ils l'illustration de Twitch, extraite comme celles du tableau de bord, et avec combien de teintes ?

## Facteurs de décision

- **Fidélité** (ADR 0036) : l'illustration domine l'écran vide, son absence se voit.
- **Une seule méthode** : l'ADR 0052 a fixé l'extraction, le rangement, le manifeste et le point d'entrée ; une seconde méthode pour deux dessins de plus ne se justifie pas.
- **Sans retouche** (ADR 0046, ADR 0052) : aucun trait dessiné à la main.
- **Tokens** (ADR 0019) : chaque teinte suit un `ColorRole`, dans les deux thèmes.
- **Provenance** : la capture de `docs/new-reference-ui/` fait foi ; `docs/reference-ui/` ne sert que pour un écran absent de la première.

## Options envisagées

### Option A — Pas d'illustration

- Avantages : aucune œuvre tierce de plus dans le dépôt.
- Inconvénients : les deux états vides perdent leur élément principal ; c'est l'état actuel de la page.
- **Écartée** : contraire à l'ADR 0036, comme dans l'ADR 0052.

### Option B — Méthode de l'ADR 0052, limitée à trois teintes

- Avantages : aucun changement de méthode.
- Inconvénients : le jaune, le gris du losange et le violet du carré n'entrent dans aucun des trois masques ; il faudrait les fondre dans une autre teinte, ce qui est une retouche.
- **Écartée.**

### Option C — Méthode de l'ADR 0052, un masque par teinte relevée, sans limite à trois

- Avantages : même extraction, même manifeste, même point d'entrée ; chaque teinte garde sa couleur, par token.
- Inconvénients : cinq masques par illustration ; la séparation des bords entre cinq teintes est plus délicate qu'entre trois ; un token de couleur de plus (le jaune).
- **Retenue.**

### Option D — Découpe opaque de la capture

- Avantages : immédiate.
- Inconvénients : carré clair en thème sombre, couleurs hors tokens.
- **Écartée**, pour les raisons de l'ADR 0052 (option C).

## Décision

### 1. Écrans concernés

Deux illustrations s'ajoutent à la liste de l'ADR 0052 §1 :

| Illustration | Écran                                | Capture source                                                                                                                              |
| ------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Personnage   | Activité, onglet Chuchotements, vide | `docs/new-reference-ui/IMG_9613.PNG`                                                                                                        |
| Lunettes     | Activité, onglet Notifications, vide | `docs/reference-ui/creer/notifications-createur--vide.png`, contrôlée sur `docs/reference-ui/activite/notifications--vide-theme-sombre.png` |

La liste reste fermée : toute autre illustration demande un nouvel ADR.

### 2. Teintes

Une illustration a autant de masques que de teintes relevées sur sa capture, au lieu de trois. Le manifeste de l'ADR 0052 §3 donne, pour chaque illustration, ses teintes et leur ordre d'empilement, du fond vers le premier plan. La règle de séparation des bords de l'ADR 0052 §2 s'applique entre deux teintes voisines, quel que soit leur nombre.

### 3. Couleurs et thèmes

Chaque teinte suit un `ColorRole`. Les teintes déjà portées par un token le réutilisent ; le jaune entre dans `packages/design-tokens/tokens/` avec la provenance « Relevé sur les captures de l'app iOS Twitch (docs/new-reference-ui/IMG_9613) ».

En thème sombre, chaque rôle garde sa valeur claire, comme l'ADR 0052 §4 : la capture sombre des notifications le confirme pour les lunettes. Le losange gris du personnage, relevé seulement en clair, suit la même règle jusqu'à une capture sombre.

### 4. Reste inchangé

Extraction, rangement, manifeste, test de recomposition, accessibilité et point d'entrée unique (`IllustrationImage` dans `Core/DesignSystem`) suivent l'ADR 0052.

## Conséquences

### Positives

- Les deux états vides de la page Activité ressemblent à l'app Twitch.
- Une seule méthode pour toutes les illustrations d'état vide.
- Première valeur sombre relevée pour une illustration, qui conforte le choix de l'ADR 0052 §4.

### Négatives

- **Dépôt public** : deux éléments graphiques de Twitch de plus.
- **Cinq masques par illustration**, et une séparation des bords plus délicate.
- **Source ancienne pour les lunettes** : la capture vient de `docs/reference-ui/`, en 1179 × 2676, d'une autre version de l'app ; le dessin peut avoir changé depuis.
- **Losange gris non relevé en sombre** : `#efeff1` sur un fond sombre est un choix par défaut, pas une valeur de Twitch.

### Risques et mitigations

- **Bords mal répartis entre cinq teintes** (halo, liseré). Mitigation : le test de recomposition de l'ADR 0052 §3 compare le résultat à la capture.
- **Les lunettes ne correspondent plus à l'app actuelle.** Mitigation : une capture de l'état vide des notifications dans `docs/new-reference-ui/` remplace la source, par une PR de masques, sans nouvel ADR.
- **La liste s'allonge sans décision.** Mitigation : le §1 reste une liste fermée.

## Notes d'implémentation

1. Tant que l'ADR est `Proposé`, les deux états vides restent le texte seul (PR de la page Activité).
2. Après acceptation : passer la ligne de statut de l'ADR 0052 à « Accepté — §1, §2 et §4 amendés par 0053 », et mettre à jour son statut dans `docs/adr/README.md`.
3. Une PR étend le script d'extraction et le manifeste à un nombre variable de teintes, ajoute les masques, le token jaune et les rôles de couleur.
4. Une seconde PR branche `IllustrationImage` dans `ActivityEmptyState`, en citant `IMG_9613` et les captures de `docs/reference-ui/`.

## Liens

- [ADR 0052](0052-illustrations-d-etat-vide-du-tableau-de-bord-en-masques-extraits-des-captures.md) — méthode des illustrations d'état vide ; cet ADR amende sa liste (§1) et son nombre de teintes (§2, §4).
- [ADR 0046](0046-glyphes-d-interface-extraits-des-captures-en-masques.md) — glyphes extraits des captures en masques, méthode d'origine.
- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles relevées sur l'app iOS Twitch.
- [ADR 0021](0021-perimetre-fonctionnel-et-cartographie-des-entites.md) — périmètre : notifications en T2, chuchotements hors périmètre.
- [ADR 0019](0019-package-design-tokens.md) — design tokens, dont le jaune à ajouter.
