# Plan — fidélité du design de l'app iOS aux captures de référence

Objectif : chaque écran déjà livré dans `apps/ios` reprend à l'identique les captures de `docs/reference-ui/` (ADR 0036) : structure, navigation, états et valeurs visuelles, toutes passées par les design tokens (ADR 0019) via `Core/DesignSystem` (ADR 0010). Ce plan ne crée aucune fonctionnalité : ce qui sort du périmètre de l'ADR 0021, ou qui n'existe pas encore côté API, est listé comme écart à décider, jamais inventé ni câblé.

Les mesures se font sur les captures en pleine résolution (1179 × 2676 dont 120 px de barre Mobbin en bas : l'app occupe 1179 × 2556, soit 393 × 852 pt à @3x).

## Inventaire des écrans et écarts

### 1. Structure de navigation et barre d'onglets

Captures : `accueil/flux-live--defaut.png`, `accueil/flux-suivis--aucun-live.png`, `parcourir/liste-chaines-live--defaut.png`, `profil/menu-compte--defaut.png`, `profil/menu-compte--theme-sombre.png`, `parametres/parametres--defaut.png`, `live/lecteur--controles-visibles.png`, `chat/chat-chaine--defaut.png`.

| Référence                                                                                                                                      | Produit actuel                                                                   | Écart                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Barre d'onglets en bas : Home, Browse, bouton « + » en pilule, Activity, Profile ; 49 pt, filet de 1 px en haut, fond de l'écran               | Aucune barre d'onglets : l'accueil seul, dans une `NavigationStack`              | Barre absente (PR 1)                                                                        |
| Onglet actif : glyphe plein et libellé violets (`#772ce8` en clair, `#bf94ff` en sombre) ; inactif : glyphe au trait et libellé `text.primary` | —                                                                                | Couleur d'onglet actif absente des tokens (PR 1)                                            |
| Onglet Profile : avatar de 24 pt (avatar par défaut vert `#bfff00`, glyphe noir) ; actif, anneau violet de 2 pt séparé de l'avatar par 1 pt    | Bouton « person.crop.circle » dans la barre de navigation, qui ouvre une feuille | Le profil est une feuille, pas un onglet (PR 1)                                             |
| Profile, Settings et Stream Manager s'empilent dans l'onglet Profile, barre d'onglets visible                                                  | Feuille modale avec sa propre pile                                               | PR 1                                                                                        |
| Page de chaîne, lecteur et chat en plein écran, sans barre d'onglets                                                                           | Pas de barre, donc rien à masquer                                                | La barre se masque sur la page de chaîne (PR 1)                                             |
| Onglets Browse, « + » (feuille Create : Stream Games, Stream IRL, Creator Dashboard) et Activity                                               | Aucun écran correspondant                                                        | **Hors périmètre actuel : à décider (Q1, Q2, Q3)**                                          |
| Glyphes Twitch propres (maison, loupe, cloche, avatar)                                                                                         | —                                                                                | Glyphes SF Symbols les plus proches (`house`, `house.fill`, `person.fill`) ; à décider (Q4) |

### 2. Accueil

Captures : `accueil/flux-live--defaut.png`, `accueil/flux-live--defaut-2.png`, `accueil/flux-live--suivi.png`, `accueil/flux-live--theme-sombre.png`, `accueil/flux-suivis--aucun-live.png`, `accueil/flux-suivis--vide.png`, `accueil/flux-clips--defaut.png`, `accueil/flux-accueil--menu-options-clip.png`, `accueil/flux-accueil--modale-pas-interesse*.png`, `accueil/flux-accueil--toast-contenu-retire.png`.

| Référence                                                                                                                                                        | Produit actuel                                               | Écart                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onglets hauts Following / Live / Clips, soulignement de l'onglet actif                                                                                           | Titre de navigation « Home »                                 | Following suppose le follow côté iOS (T2, non livré) ; Clips est « Plus tard » (ADR 0021 §7) : **à décider (Q5)**                                       |
| Onglet Live : flux vertical plein écran, un live par page, vidéo en lecture, avatar LIVE et spectateurs, Follow, titre, catégorie, actions partager / son / menu | Liste verticale de cartes : rectangle gris 16:9, titre, slug | Structure différente ; le flux suppose miniature ou lecture en place, avatar, spectateurs et catégorie, absents de `GET /v1/lives` : **à décider (Q6)** |
| Browse › Live Channels : carte miniature pleine largeur, badge LIVE, « 3K viewers », avatar, nom, titre, catégorie, tags                                         | (même liste que ci-dessus)                                   | La liste actuelle est structurellement la liste Live Channels de Browse ; données manquantes : miniature, spectateurs, avatar, catégorie, tags (Q6)     |
| Following vide : illustration de cœur, « Keep up with your favorite creators », bouton Let's Go!                                                                 | « home.empty » en texte secondaire                           | État vide à reprendre une fois le contenu de l'onglet décidé (Q5) ; l'illustration est un asset Twitch (Q7)                                             |
| Chargement / erreur : aucune capture                                                                                                                             | `ProgressView` et message + Retry                            | Aucune référence : garder l'existant                                                                                                                    |
| Options du flux (pas intéressé, bloquer, signaler), toast « Content has been removed »                                                                           | —                                                            | Recommandation et signalement : T2/T3, hors livraison actuelle                                                                                          |

### 3. Page de chaîne et lecteur

Captures : `live/lecteur--controles-visibles.png`, `chat/chat-lecteur--toast-abonne.png`, `chaine/page-chaine--*.png`, `chaine/notifications-chaine--*.png`, `live/options-lecteur--*.png`.

| Référence                                                                                                                                                                       | Produit actuel                                        | Écart                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Lecteur 16:9 sous la barre d'état, sans barre de navigation ; contrôles en surimpression (réduire, Clip, cast, partager, réglages, pause, durée, spectateurs, son, plein écran) | Lecteur sous une barre de navigation au titre du slug | Barre de navigation à retirer ; contrôles : pause, durée du live, spectateurs, son et plein écran en périmètre ; Clip, cast hors périmètre (Q8) |
| Bloc chaîne : avatar 34 pt, nom + badge vérifié, titre, catégorie, tag de langue, bouton Subscribe ; rangée Following / Notifications / Subscribe                               | En-tête : titre, pastille LIVE, spectateurs           | Avatar, catégorie, tags, follow, notifications, abonnement : données ou fonctionnalités absentes côté iOS (Q9)                                  |
| Page de chaîne hors live (bannière, onglets Home / About / Clips / Videos / Schedule)                                                                                           | —                                                     | Hors livraison actuelle                                                                                                                         |

### 4. Chat

Captures : `chat/chat-chaine--defaut.png`, `chat/chat-chaine--saisie.png`, `chat/chat-chaine--message-envoye.png`, `chat/chat-lecteur--toast-abonne.png`, `live/lecteur--controles-visibles.png`.

| Référence                                                                                                         | Produit actuel                                                 | Écart                                                                                        |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| En-tête « CHAT » en capitales sous le bloc chaîne, filet                                                          | Aucun en-tête                                                  | À reprendre (PR 4)                                                                           |
| Ligne : horodatage `04:13` en texte secondaire, pseudo coloré suivi de « : », message ; interligne relevé         | Pseudo coloré et message (`ChatLine`), interligne `chatRowGap` | Horodatage et mesures à vérifier (PR 4)                                                      |
| Séparateur « New » rouge, message de bienvenue « Welcome to the chat room! »                                      | Notices de statut                                              | Séparateur « New » : à décider (Q10)                                                         |
| Champ « Send chat » en pilule `surface.secondary`, icônes Bits et emotes, menu ; envoi à droite pendant la saisie | Champ arrondi et bouton d'envoi `paperplane`                   | Forme, hauteur et glyphes à reprendre (PR 4) ; Bits, emotes, points de chaîne hors périmètre |
| Bandeau « Follower Only Chat »                                                                                    | —                                                              | Mode de salon T2 non livré                                                                   |
| Classement des dons (top donateurs)                                                                               | —                                                              | Hors périmètre                                                                               |

### 5. Profile, My Channel, Stream Manager, Edit Stream Info, Settings

Captures : `profil/menu-compte--defaut.png`, `profil/menu-compte--theme-sombre.png`, `chaine/page-chaine--mode-createur.png`, `creer/edition-infos-diffusion--defaut.png`, `creer/edition-infos-diffusion--defile.png`, `creer/gestionnaire-diffusion--*.png`, `parametres/parametres--defaut.png`, `parametres/menu-parametres--modale-deconnexion.png`.

| Référence                                                                                                                               | Produit actuel                                      | Écart                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| En-tête : bannière noire avec Edit Profile, avatar 66 pt chevauchant, pseudo en gras, « Last live 23h ago », bio                        | Pseudo seul en `title`                              | Bannière, avatar, dernier live, bio : données absentes côté iOS (Q11) ; Edit Profile hors livraison                                                                                  |
| Cartes : My Channel ; Creator Dashboard + Stream Manager (filet entre lignes) ; Subscriptions, Drops & Rewards, Twitch Turbo ; Settings | Trois cartes : My Channel, Stream Manager, Settings | Stream Manager seul dans sa carte ; Creator Dashboard, Subscriptions (T3), Drops (hors scope), Turbo (hors scope) absents : conforme au périmètre, ordre et filets à vérifier (PR 5) |
| Glyphes Twitch des lignes                                                                                                               | SF Symbols                                          | Q4                                                                                                                                                                                   |
| Stream Manager : widgets mobiles (Chat, Activity Feed, Quick Actions…), aperçu du flux, badge LIVE                                      | Écran maison : titre, clé de stream, réglages OBS   | Aucun équivalent de la clé et d'OBS dans la référence : **à décider (Q12)**                                                                                                          |
| Edit Stream Info : Cancel / Done, « Title » + « 122 remaining », champ `surface.secondary`                                              | Feuille Edit Stream Info avec titre et compteur     | Mesures à comparer (PR 5)                                                                                                                                                            |
| Settings : carte de lignes (Account, Preferences…), « Twitch v22.6 (…) », bouton Log Out pleine largeur `surface.secondary`             | Nom, email, bouton Log Out en bas                   | Lignes de réglages hors livraison ; version de l'app et position du bouton à reprendre (PR 5) ; logo « an amazon company » non repris (marque)                                       |

### 6. Connexion, onboarding, mise à jour forcée

Captures : `onboarding/accueil-bienvenue--*.png`, `auth/connexion--*.png`, `auth/inscription-terminee--defaut.png`.

| Référence                                                | Produit actuel                                             | Écart                                                   |
| -------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Bienvenue violet, liste animée, slogan, Log In / Sign Up | Livré et relevé (ADR 0036)                                 | Aucun écart structurel relevé                           |
| Log In natif (Username, Password, Trouble logging in)    | Page HTML servie par l'API dans une feuille web (ADR 0039) | Hors app iOS : l'écart, s'il y en a, se traite côté API |
| You're All Set!                                          | Livré (ADR 0040)                                           | Aucun                                                   |
| Mise à jour forcée : aucune capture                      | Titre et message centrés                                   | Aucune référence : garder l'existant                    |

## Découpage en PR

Chaque PR reste sous 1 200 lignes de diff, cite ses captures et ajoute ses tokens dans les deux thèmes avec leur provenance.

1. **Barre d'onglets et structure de navigation** : composant de barre dans `DesignSystem`, onglets Home et Profile, pile par onglet dans `Router`, barre masquée sur la page de chaîne, profil en onglet. Tokens : couleur d'onglet actif, filet, avatar par défaut, libellé d'onglet, dimensions.
2. **Accueil** : selon Q5 et Q6.
3. **Page de chaîne et lecteur** : retrait de la barre de navigation, bloc chaîne, contrôles en périmètre.
4. **Chat** : en-tête CHAT, lignes horodatées, champ « Send chat ».
5. **Profile, Settings, Edit Stream Info** : cartes et filets, Settings (version, Log Out).
6. **Stream Manager** : selon Q12.

## Questions à trancher

- **Q1** Browse : l'onglet n'a aucun écran au produit. Le montrer (et y mettre la liste des lives, qui correspond à Browse › Live Channels), ou l'omettre ?
- **Q2** Bouton « + » : la feuille Create (Stream Games, Stream IRL, Creator Dashboard) n'a pas d'équivalent ; le Stream Manager existe. L'omettre, ou y brancher le Stream Manager ?
- **Q3** Activity : notifications (T2, non livrées) et whispers (hors scope). Omettre l'onglet ?
- **Q4** Glyphes : SF Symbols les plus proches, ou reprise des glyphes Twitch (assets, comme le Glitch de l'ADR 0037) ?
- **Q5** Onglets hauts de l'accueil : Following (follow iOS non livré) et Clips (« Plus tard ») sont absents. Garder un accueil sans onglets hauts, ou un seul onglet Live ?
- **Q6** Contenu de l'accueil : flux vertical plein écran (Live) ou liste de cartes (Live Channels) ? Les deux demandent miniature ou lecture en place, avatar, spectateurs et catégorie dans `GET /v1/lives`.
- **Q7** Illustrations Twitch des états vides (cœur, bulle « They'll be back! ») : reprises telles quelles comme l'ADR 0040, ou non ?
- **Q8** Contrôles du lecteur hors périmètre (Clip, cast) : omis ?
- **Q9** Bloc chaîne du lecteur : avatar, catégorie, tags, follow, notifications et abonnement manquent côté iOS ; quels éléments entrent maintenant ?
- **Q10** Séparateur « New » et message de bienvenue du chat : à reprendre ?
- **Q11** En-tête du profil (bannière, avatar, « Last live », bio) : données absentes de `GET /v1/me` ; quel sous-ensemble ?
- **Q12** Stream Manager : la référence montre le gestionnaire mobile à widgets, le produit un écran clé de stream + OBS sans équivalent. Garder l'écran actuel au style des cartes de la référence ?
- **Q13** Avatar par défaut : Twitch attribue une couleur par compte ; seules des captures vertes (`#bfff00`) existent. Garder le vert pour tous les comptes ?
- **Q14** Libellé d'onglet : la capture mesure 10 pt (taille de `UITabBar`), le text style iOS le plus proche est `caption2` (11 pt). Garder `caption2` pour le Dynamic Type ?
