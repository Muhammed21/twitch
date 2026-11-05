# Référence UI : captures iPhone de l'app Twitch

**Type:** reference

Captures de l'app iOS Twitch prises sur iPhone par Muhammed Cavus (1179×2556 à @3x, interface en français, thème clair), référence du design de l'app iOS du produit : structure, comportement et valeurs visuelles (ADR 0036). Les valeurs passent par les design tokens (ADR 0019) ; le périmètre est celui de l'ADR 0021. Usage : voir `.claude/rules/reference-ui.md`.

Les captures appartiennent à Twitch Interactive, Inc. et ne servent que de référence interne : elles ne sont pas redistribuées. Le wordmark Twitch n'est pas repris ; le Glitch l'est, depuis le SVG officiel de `docs/brand/` (ADR 0037). Un écran absent d'ici se cherche dans [`docs/reference-ui/`](../reference-ui/README.md).

Les fichiers gardent le nom donné par l'iPhone (`IMG_96xx.PNG`), dans l'ordre du parcours capturé. Pour passer en points, divise les pixels par 3.

## Mode spectateur

Barre d'onglets : Accueil, Parcourir, bouton « + » en pilule grise, Activité, Profil (avatar). L'onglet actif est violet.

### Accueil

| Capture                  | Écran                  | État       | Ce qu'elle montre                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ---------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9607](IMG_9607.PNG) | Accueil, onglet Live   | défaut     | Onglets Suivis / Live / Clips (soulignés en noir) ; puces de filtre (Tout actif en noir, Fortnite, Discussions, EA Sports FC…) ; flux de lives en pleine largeur : badge « Live », nombre de spectateurs, boutons son coupé et « ⋮ » sur la vidéo ; sous la vidéo, avatar, pseudo vérifié, bouton « Suivre » violet, titre, tag « Always On ». |
| [IMG_9608](IMG_9608.PNG) | Accueil, onglet Suivis | aucun live | « Live maintenant ! », pilule « Essayer sans publicité » et icône de réglages ; état vide illustré « Elles reviendront ! » avec bouton « Explorer le live » ; section « Regarder la suite » (miniatures avec durée et barre de progression violette) ; début de « Vos chaînes hors ligne ».                                                    |
| [IMG_9609](IMG_9609.PNG) | Accueil, onglet Suivis | défilé     | Suite de 9608 : « Regarder la suite », puis « Vos chaînes hors ligne » : avatar rond, pseudo (badge vérifié), nombre de nouvelles vidéos.                                                                                                                                                                                                      |

### Parcourir

| Capture                  | Écran                             | État            | Ce qu'elle montre                                                                                                                                                                                                                                  |
| ------------------------ | --------------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9610](IMG_9610.PNG) | Parcourir, onglet Catégories      | défaut          | Loupe et champ « Rechercher » ; onglets Catégories (actif, violet souligné) / Chaînes live, icône de filtre ; grille de 3 pochettes : nom, point rouge et nombre de spectateurs (« 181,1 k »), tag gris ; badge rose « NOUVEAU » sur une pochette. |
| [IMG_9611](IMG_9611.PNG) | Feuille d'actions du bouton « + » | mode spectateur | Feuille sur voile sombre : « Streaming / Streamer depuis cet appareil » (bloc violet), « Ajouter des clips à votre rétrospective » (désactivé, grisé), « Tableau de bord des créateurs / Gérez votre chaîne et votre contenu », « Annuler ».       |

### Activité

| Capture                  | Écran                          | État             | Ce qu'elle montre                                                                                                                                                                                                                                         |
| ------------------------ | ------------------------------ | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9612](IMG_9612.PNG) | Activité, onglet Notifications | une notification | Titre « Activité », roue de réglages ; onglets Notifications (actif) / Chuchotements ; section « PLUS TÔT » et lien violet « MARQUER TOUT COMME LU » ; notification non lue marquée d'un filet violet à gauche, Glitch violet, date relative « -2 sem. ». |
| [IMG_9613](IMG_9613.PNG) | Activité, onglet Chuchotements | vide             | Illustration, « Aucun chuchotement disponible », texte d'aide, bouton violet « Commencer une conversation ».                                                                                                                                              |

### Profil

En-tête commun : bannière avec roue de réglages et « Modifier le profil », avatar, pseudo, « Hors ligne » ; boutons « Gestionnaire de stream » et « Statistiques », pilule « Essayer sans publicité » ; onglets Accueil / À propos / Clips / Vidéos / Ca… (défilants).

| Capture                  | Écran                   | État   | Ce qu'elle montre                                                                                                            |
| ------------------------ | ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9614](IMG_9614.PNG) | Profil, onglet Accueil  | défaut | Carrousel de clips : carte « Clips que j'ai créés » avec bouton blanc « Afficher tout », puis clips (titre, nombre de vues). |
| [IMG_9615](IMG_9615.PNG) | Profil, onglet À propos | vide   | Illustration, « Dites-nous-en plus ! », « Vous êtes plus qu'un simple profil… racontez-nous tout ! ».                        |
| [IMG_9616](IMG_9616.PNG) | Profil, onglet Clips    | vide   | « DEPUIS TOUJOURS » et « FILTRER PAR » violet ; illustration clap, « Aucun clip trouvé ».                                    |
| [IMG_9617](IMG_9617.PNG) | Profil, onglet Vidéos   | vide   | Illustration pellicule, « Pas de vidéos sur cette chaîne », « C'est calme… trop calme… ».                                    |

### Gestionnaire de stream

Ouvert depuis le bouton « Gestionnaire de stream ». En-tête : croix de fermeture, icône caméra rouge, « Gestionnaire de str… », badge noir « HORS LIGNE », avatar. Les widgets sont des cartes qui défilent horizontalement ; la barre du bas sélectionne le widget (pastille cerclée de noir) et finit par un bouton d'édition de la disposition.

| Capture                  | Écran                              | État      | Ce qu'elle montre                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9618](IMG_9618.PNG) | Widget Chat                        | vide      | En-tête « CHAT » et « ⋮ » ; « Bienvenue sur le chat de fakup_ ! » ; champ « Envoyer un message » avec bouton d'émoticônes.                                                                                                                                                   |
| [IMG_9619](IMG_9619.PNG) | Widget Fil d'actualité             | vide      | « FIL D'ACTUALITÉ » et « Filtre » violet ; « C'est trop calme… trop calme… » et texte d'aide.                                                                                                                                                                                |
| [IMG_9620](IMG_9620.PNG) | Widget Actions rapides             | défaut    | Grille de 3×3 tuiles colorées : Modifier les infos du stream, Partager le stream (violet), Lancer un raid, Démarrer le chat partagé (magenta), Mode bouclier (rouge), Mode lent, Chat en émoticônes uniquement, Chat réservé aux followers, Paramètres de modération (bleu). |
| [IMG_9621](IMG_9621.PNG) | Widget File d'attente de l'AutoMod | désactivé | Bouclier, « L'AutoMod est désactivé » et explication.                                                                                                                                                                                                                        |
| [IMG_9622](IMG_9622.PNG) | Widget Actions de modérateur       | vide      | « Filtre » violet ; icône de document, « En attente d'actions » et explication.                                                                                                                                                                                              |

## Bascule entre les modes

| Capture                  | Écran                              | État   | Ce qu'elle montre                                                                     |
| ------------------------ | ---------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| [IMG_9623](IMG_9623.PNG) | Transition vers le mode créateur   | défaut | Fond clair, Glitch noir centré, « Passage au tableau de bord des créateurs » en gras. |
| [IMG_9630](IMG_9630.PNG) | Transition vers le mode spectateur | défaut | Même mise en page, « Retour sur Twitch ».                                             |

## Mode créateur (tableau de bord des créateurs)

Barre d'onglets : Accueil, Contenu, bouton « + » en pilule violette, Statistiques, Chaîne. En-tête : avatar à gauche, titre centré.

| Capture                  | Écran                             | État          | Ce qu'elle montre                                                                                                                                                                                                                                                                                                                                 |
| ------------------------ | --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [IMG_9624](IMG_9624.PNG) | Accueil du tableau de bord        | hors ligne    | Bouton « Regarder » (œil) en haut à droite ; carte de chiffres Temps de stream / Spectateurs / Followers (« -- » hors live) ; aperçu noir « HORS LIGNE » ; bouton violet « Gestionnaire de stream », bouton gris « Modifier les infos du stream » et texte d'aide ; carte « Pas d'activité récente » ; lien violet « Voir toutes les activités ». |
| [IMG_9625](IMG_9625.PNG) | Contenu                           | vide          | « Trier » à droite ; champ « Rechercher » ; illustration clap, « Aucun clip de votre chaîne ».                                                                                                                                                                                                                                                    |
| [IMG_9626](IMG_9626.PNG) | Statistiques                      | vide          | Icônes calendrier (grisée) et information ; illustration, « Aucun résumé de stream pour votre chaîne ».                                                                                                                                                                                                                                           |
| [IMG_9627](IMG_9627.PNG) | Feuille d'actions du bouton « + » | mode créateur | Comme 9611, avec « Quitter le tableau de bord des créateurs / Regarder des streams, des clips et des stories » (icône de sortie) à la place du tableau de bord.                                                                                                                                                                                   |
| [IMG_9628](IMG_9628.PNG) | Modifier les infos du stream      | vide, haut    | Feuille modale : Annuler, titre tronqué, Enregistrer ; champs Titre et Notifications de live (« 140 restants »), Catégorie (recherche), Tags, Classification de contenu (menu), Langue ; aides grises sous les champs, lien violet « En savoir plus ».                                                                                            |
| [IMG_9629](IMG_9629.PNG) | Modifier les infos du stream      | défilé, bas   | Interrupteur « Contenu promotionnel » et son aide (liens violets) ; « Repères » (« 140 restants », « Description (facultative) »), lien « Ajouter un repère » ; « Partager le lien vers la chaîne » et « Partager ».                                                                                                                              |

## Navigation

- Bouton « + » du mode spectateur → feuille 9611. « Tableau de bord des créateurs » → transition 9623 → accueil du tableau de bord 9624.
- Bouton « + » du mode créateur → feuille 9627. « Quitter le tableau de bord des créateurs » → transition 9630 → mode spectateur.
- Profil, « Gestionnaire de stream » → Gestionnaire de stream (9618 à 9622) ; la croix le ferme.
- Tableau de bord, « Modifier les infos du stream » → feuille 9628, qui défile jusqu'à 9629.
