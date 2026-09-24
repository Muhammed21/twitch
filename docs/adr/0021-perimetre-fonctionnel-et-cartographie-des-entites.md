# 0021 — Périmètre fonctionnel et cartographie des entités

- Statut : Proposé
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Complète : ADR 0003 (contextes futurs, propriétaires des entités non couvertes)

## Contexte et problématique

L'ADR 0003 découpe le domaine en 8 bounded contexts et écarte volontairement l'option « 12+ contextes fins » (clips, VOD, raids, badges… séparés), au motif qu'ils resteraient vides pendant des mois. Cette décision reste juste. Mais elle a un effet de bord : les entités qu'elle n'a pas découpées ne sont pas non plus **rangées**. Une relecture des ADR 0001 à 0020 montre trois situations :

- des entités **couvertes** par un contexte et un ADR (compte, chaîne, session, chat, sanction, abonnement, bits, follow) ;
- des entités **citées sans propriétaire** : les clips et la VOD apparaissent dans le stockage (ADR 0008) et dans les scopes d'administration (`admin:clip.moderate`, ADR 0006, 0007), les raids dans le canal SSE (ADR 0004), le rôle VIP dans `authz` (ADR 0006), les emotes dans le stockage objet — sans qu'aucun contexte ne les possède ;
- des entités **absentes**, dont certaines ont un impact transverse fort : le blocage entre utilisateurs touche le chat, le follow et les messages privés ; le catalogue des catégories est référencé par `channel` et `discovery`, mais n'appartient à personne.

Le risque n'est pas de manquer de fonctionnalités, c'est de les ajouter plus tard **au mauvais endroit** : les clips dans `stream` parce que « c'est de la vidéo », les points de chaîne dans `monetization` parce que « c'est une monnaie », les whispers dans `chat` parce que « ce sont des messages ». Chacun de ces placements est tentant, et chacun est faux.

Problématique : pour chaque entité significative d'une plateforme de live, dire qui la possède, quand elle arrive, et ce qui est hors scope — sans créer aujourd'hui un seul contexte vide.

## Facteurs de décision

- **Pas de contexte vide** (ADR 0003) : un contexte n'est créé qu'avec son premier use-case.
- **Décider le propriétaire avant le besoin** : ranger une entité coûte une ligne aujourd'hui, et une migration de données plus tard.
- **Cycle de vie** comme critère principal de placement : ce qui naît et meurt ensemble vit ensemble.
- **Risque juridique et de sécurité** : certaines fonctionnalités (messages privés, prédictions) apportent des obligations bien plus lourdes que leur code.
- **Capacité d'un développeur solo**.

## Options envisagées

**Option A — Ne rien décider, ranger au fil de l'eau.** Zéro coût immédiat. Mais chaque décision sera prise sous pression de livraison, au moment où le placement le plus rapide est rarement le bon. Écarté.

**Option B — Créer maintenant les contextes manquants (`media`, `engagement`, `messaging`…).** Rouvre exactement ce que l'ADR 0003 a écarté : des modules vides, des contrats sans producteur. Écarté.

**Option C — Une cartographie normative : chaque entité reçoit un propriétaire (existant ou futur nommé) et un horizon, sans création de code.** Les contextes futurs sont **nommés et bornés** mais n'existent pas dans l'arborescence. **Retenu.**

## Décision

### 1. Horizons

| Horizon | Sens |
|---|---|
| **T1** | Tranche verticale n°1 (ADR 0003) : un streamer lance un live, un viewer le regarde et chatte |
| **T2** | Plateforme sociale minimale : follow, modération complète, notifications |
| **T3** | Monétisation et engagement de la chaîne : abonnements, bits, emotes, raids |
| **Plus tard** | Voulu, mais sans échéance ; son propriétaire est fixé ici pour que son arrivée ne soit pas un débat |
| **Hors scope** | Décision explicite de ne pas le faire ; revenir dessus exige un nouvel ADR |

### 2. Cartographie

#### Comptes, chaînes, diffusion

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| Compte, session, profil | `identity` | T1 | ADR 0003, 0005 |
| Chaîne (slug, titre, bannière) | `channel` | T1 | ADR 0003 |
| Session de diffusion, clé de stream | `stream` | T1 | ADR 0001, 0003 |
| Catégorie de la chaîne, tags | `channel` | T2 | Tags libres, normalisés (minuscules, sans accents), plafonnés à 10 par chaîne |
| **Catalogue des catégories** | `channel` | T2 | Voir §3 |
| Planning de diffusion | `channel` | Plus tard | Un `ScheduleSegment` est une propriété de la chaîne permanente, pas d'une session ; `notification` consomme pour les rappels |
| Historique titre / catégorie d'une session | `stream` | T2 | Échantillonné au changement ; utile à la VOD et aux analytics |

#### Social

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| Follow | `channel` | T2 | ADR 0020 |
| Page « Suivis » | `discovery` | T2 | Projection, ADR 0020 |
| **Blocage entre utilisateurs** | `moderation` | T2 | Voir §4 |
| Messages privés (whispers) | futur `messaging` | **Hors scope** | Voir §5 |

#### Chat et modération

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| Salon, message, présence | `chat` | T1 | ADR 0004 |
| Timeout par le propriétaire | `moderation` | T1 | ADR 0003 |
| Ban, mots interdits, filtrage automatique | `moderation` | T2 | ADR 0003 |
| Signalement | `moderation` | T2 | Signalement de message, de chaîne ou de compte |
| Modes de salon (slow, followers-only, sub-only) | `chat` | T2 | ADR 0004, 0020 |
| Liste des chatters présents | `chat` | T2 | Présence Redis, ADR 0004 |
| Rôles `moderator`, `vip`, `editor` | écrits par `channel` / `moderation`, stockés dans `authz` | T2 | ADR 0006. Le VIP n'a pas de règle métier propre : c'est un rôle, pas une entité |
| Message épinglé, annonce | `chat` | Plus tard | État éphémère du salon, meurt avec la session |
| Historique complet du chat, replay du chat | — | **Hors scope** | ADR 0003 : coût de rétention disproportionné |

#### Monétisation

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| Abonnement, entitlement, cadeau d'abonnement | `monetization` | T3 | ADR 0013, 0014 |
| Bits (monnaie virtuelle) | `monetization` | T3 | ADR 0015 |
| Reversement streamer | `monetization` | T3 | ADR 0017 |
| **Emotes de chaîne** | `channel` | T3 | Voir §6 |
| Badges (abonné, modérateur, VIP) | `chat` les dérive | T3 | ADR 0003 : dérivés d'events, jamais stockés comme donnée de référence. Les visuels de badge par chaîne appartiennent à `channel`, comme les emotes |
| Publicité, drops | — | **Hors scope** | Écosystème d'annonceurs et de partenaires hors de portée |

#### Vidéo à la demande

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| **VOD, clips** | futur `media` | Plus tard | Voir §7 |
| Marqueurs de stream | futur `media` | Plus tard | N'a de sens qu'avec la VOD |

#### Engagement

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| **Raid** | `stream` | T3 | Voir §8 |
| Host mode | — | **Hors scope** | Fonctionnalité abandonnée par les plateformes établies au profit du raid |
| Points de chaîne, récompenses | futur `engagement` | Plus tard | Voir §9 |
| Sondages | futur `engagement` | Plus tard | Voir §9 |
| Hype train | futur `engagement` | Plus tard | Projection d'events de `monetization` |
| Prédictions | — | **Hors scope** | Voir §9 |

#### Découverte et plateforme

| Entité | Propriétaire | Horizon | Note |
|---|---|---|---|
| Liste des lives | `discovery` | T1 | ADR 0003 |
| Recherche, recommandation | `discovery` | T3 | Projections uniquement, ADR 0003 |
| Home curatée, catégories mises en avant | Payload (éditorial) | T2 | ADR 0007 : référence un identifiant de catégorie, ne possède pas la catégorie |
| Notification push | `notification` | T2 | ADR 0003, 0020 |
| Équipes (teams) | — | **Hors scope** | Valeur faible, modèle d'appartenance entier à construire |
| Extensions tierces | — | **Hors scope** | Suppose une plateforme développeur (SDK, revue, sandbox) : un produit à part entière |

### 3. Le catalogue des catégories appartient à `channel`

Une catégorie est une donnée de référence avec des invariants : une chaîne ne peut pas pointer vers une catégorie inexistante, deux catégories peuvent fusionner, une catégorie peut être retirée. Ce n'est donc pas de l'éditorial, et Payload ne peut pas la posséder (ADR 0007). `discovery` non plus : il ne possède aucune donnée de référence (ADR 0003).

`channel` est le seul contexte qui **écrit** une référence de catégorie, et c'est donc lui qui la possède. Il publie `channel.category.created`, `channel.category.merged`, `channel.category.retired`. La fusion réécrit les références des chaînes concernées dans `channel`, puis `discovery` se met à jour par events. L'administration du catalogue passe par l'API, via la coquille Payload (ADR 0007), avec un scope `admin:category.manage`. Payload ne garde que la **mise en avant** d'une catégorie, qui la référence par identifiant et l'omet si elle n'existe plus (ADR 0007).

### 4. Le blocage entre utilisateurs appartient à `moderation`

Bloquer quelqu'un est une **restriction décidée par un utilisateur contre un autre**. C'est la même nature qu'une sanction, à une portée différente : la personne, et non une chaîne. Le placer dans `identity` violerait la règle « `identity` répond à qui es-tu, jamais à qu'as-tu le droit de faire » (ADR 0003).

- Agrégat `UserBlock(blockerId, blockedId, createdAt)` dans `moderation`. Events `moderation.user.blocked` et `moderation.user.unblocked`, via l'outbox : un blocage perdu est un problème de sécurité pour la personne qui bloque.
- Effets, chacun appliqué par le contexte concerné :
  - `channel` clôt le follow de la personne bloquée vers la chaîne de celle qui bloque et refuse les nouveaux (ADR 0020, §2) ;
  - `chat` masque, **pour la personne qui bloque seulement**, les messages de la personne bloquée, dans le fan-out qui lui est adressé ;
  - futur `messaging` : refus des messages privés.
- Un blocage ne remplace pas un ban : la personne bloquée peut toujours écrire dans le salon, et les autres la voient. Le propriétaire qui veut l'exclure la bannit.
- La liste des blocages n'est visible que par la personne qui bloque. La personne bloquée n'est jamais informée.

### 5. Les messages privés sont hors scope

Le code d'un système de messages privés est modeste. Ses obligations ne le sont pas : c'est le premier vecteur de harcèlement et de sollicitation de mineurs sur toute plateforme sociale, ce qui impose signalement, rétention de preuves, modération sur demande et réponse aux réquisitions. Une plateforme qui ouvre des messages privés sans cette chaîne complète crée un risque juridique et humain, pas une fonctionnalité.

Si le besoin est réévalué, les messages privés formeront un contexte `messaging` distinct de `chat`. Leur cycle de vie est l'inverse de celui du chat : persistants, sans session, entre deux personnes. Ils ne partageront pas le process de chat (ADR 0004).

### 6. Les emotes appartiennent à `channel`

Un jeu d'emotes est une propriété durable de la chaîne, qui existe hors ligne, comme la bannière. Les fichiers sont dans R2 (ADR 0008). L'**accès** à une emote d'abonné découle d'un entitlement (`monetization`, ADR 0013), jamais d'un attribut de l'emote. `channel` publie `channel.emote_set.updated` ; `chat` maintient la table de rendu, et vérifie le droit d'usage contre sa vue locale des entitlements. Les uploads passent par une validation (format, taille, dimensions) et une file de revue de modération avant publication.

### 7. VOD et clips : futur contexte `media`

Un clip ou une VOD naît d'une session, mais il **lui survit** : il a ses propres vues, sa propre modération, sa propre suppression, et reste visible des années après la fin de la session. Le ranger dans `stream`, dont l'agrégat est éphémère par définition (ADR 0003), mélangerait deux cycles de vie. C'est exactement l'erreur chaîne/session que l'ADR 0003 cherche à éviter.

Le contexte `media` sera créé avec son premier use-case. Il consommera `stream.started` et `stream.ended`, et dépendra de la capacité d'enregistrement du provider (ADR 0001, dont la bascule vers Mux est envisagée précisément si la VOD devient dominante). Les scopes `admin:clip.moderate` déjà déclarés (ADR 0006, 0007) lui seront rattachés.

### 8. Le raid appartient à `stream`

Un raid est un fait de **fin de session** : la session source se termine et renvoie son audience vers une chaîne en direct. Il ne survit pas à cet instant. Agrégat `Raid(sourceSessionId, targetChannelId, viewerCountAtLaunch, status)` dans `stream`. Events `stream.raid.launched` et `stream.raid.completed`, diffusés aux viewers sur le canal 2 (SSE, ADR 0004) ; `chat` annonce le raid dans le salon cible.

La chaîne cible choisit qui peut la raider (tout le monde, les chaînes suivies, personne). Ce réglage est une propriété de la chaîne permanente et appartient donc à `channel`, qui publie la politique. `stream` la lit dans une projection locale. Le mode followers-only « depuis N minutes » (ADR 0004, 0020) reste la contre-mesure aux raids hostiles.

### 9. Engagement : futur contexte `engagement`, et pas de prédictions

Les points de chaîne ressemblent à une monnaie, mais ce n'en est pas une : pas de valeur monétaire, pas d'achat, pas de reversement. Les ranger dans `monetization` les soumettrait à toutes les contraintes du seul contexte où une erreur coûte de l'argent (ADR 0003), sans aucun bénéfice. Ils formeront, avec les sondages et le hype train, un contexte `engagement`, créé avec son premier use-case.

Les **prédictions** sont hors scope. Parier des points sur une issue incertaine est un mécanisme de jeu d'argent dès que les points s'achètent ou s'échangent, même indirectement. Le risque de requalification juridique ne vaut pas la fonctionnalité.

### 10. Règle d'ajout

Toute entité absente de cette cartographie, ou tout changement de propriétaire ou de horizon, passe par un nouvel ADR qui amende celui-ci. Une fonctionnalité **Hors scope** ne se réintroduit pas par une PR : elle se réintroduit par un ADR qui explique ce qui a changé.

## Conséquences

### Positives

- Chaque entité a un propriétaire avant d'avoir du code : son arrivée est une implémentation, pas un débat d'architecture sous pression.
- Les trois placements tentants et faux (clips dans `stream`, points de chaîne dans `monetization`, whispers dans `chat`) sont écartés explicitement, avec leur raison.
- Les références orphelines des ADR précédents (clips, VOD, raids, VIP, emotes) ont maintenant un point d'ancrage.
- Le blocage, absent jusqu'ici, est défini avant le follow et le chat de tranche 2, qui en dépendent.

### Négatives

- Trois contextes futurs (`media`, `engagement`, `messaging`) sont nommés sans exister. Ils seront peut-être mal bornés, et le découvrir coûtera un ADR.
- `channel` gagne du poids : catalogue des catégories, emotes, visuels de badge, politique de raid, planning. Cela répond en partie au risque de contexte anémique de l'ADR 0003, mais crée le risque inverse.
- Déclarer hors scope les messages privés et les prédictions ferme des fonctionnalités que des utilisateurs réclameront.

### Risques et mitigations

- **Risque : `channel` devient un contexte fourre-tout.** Mitigation : réévaluer à la fin de T3 ; si le catalogue des catégories et les emotes ont des profils de changement distincts du reste, les extraire vers un contexte `catalog`, par un ADR.
- **Risque : un horizon ment.** « Plus tard » devient « jamais », ou une entité T3 est réclamée en T2. Mitigation : cette cartographie est relue à chaque fin de tranche, et le README des ADR note l'écart.
- **Risque : ajout sans ADR.** Une fonctionnalité apparaît dans un module sans passer par cette table. Mitigation : l'ADR 0018 oblige déjà à déclarer tout nouveau contexte, à deux endroits : dans la liste fermée des scopes de commit, et comme zone `import/no-restricted-paths`. Pour un nouvel agrégat dans un contexte existant, c'est la revue qui vérifie qu'il figure dans cette table.
- **Incertitude réelle : le blocage dans le fan-out du chat.** Filtrer par destinataire dans un salon de plusieurs milliers de personnes a un coût, et il n'est pas mesuré. Mitigation : ne filtrer que pour les destinataires qui ont au moins un blocage (ensemble Redis, en pratique une petite minorité), et mesurer le surcoût en seed de charge avant la mise en production du blocage.

## Notes d'implémentation

- Aucun dossier n'est créé pour `media`, `engagement` ou `messaging` (ADR 0003).
- `docs/glossaire.md` (ADR 0003) reçoit les termes `Follow`, `UserBlock`, `Category`, `EmoteSet`, `Raid`, avec leur contexte.
- Le seed déterministe (ADR 0008) s'enrichit, à l'horizon correspondant, d'un blocage réciproque, d'une catégorie fusionnée et d'un raid terminé.
