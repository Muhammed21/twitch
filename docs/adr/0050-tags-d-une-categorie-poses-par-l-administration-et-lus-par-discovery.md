# 0050 — Les tags d'une catégorie sont posés par l'administration dans `channel`, et lus par `discovery`

- Statut : Proposé
- Date : 2026-11-04
- Décideurs : Muhammed Cavus

## Contexte et problématique

La référence UI montre des tags sous chaque catégorie de Browse : « IRL » sous Just Chatting, « Shooter » et « RPG » sous Fortnite, « FPS » et « Shooter » sous Call of Duty: Warzone (`docs/reference-ui/parcourir/liste-categories--defaut.png`, `liste-categories--theme-sombre.png`). L'en-tête de la page d'une catégorie les reprend, avec la pochette, le nom et l'audience.

L'ADR 0021 ne parle que des tags d'une **chaîne** : libres, normalisés en minuscules sans accents, 10 au plus par chaîne. Elle ne dit rien des tags d'une **catégorie**. L'ADR 0045 fixe le cycle de vie d'une catégorie (création, fusion, retrait, pochette) sans parler de tags. Les tags de la référence ne sont d'ailleurs pas normalisés : ils gardent leur casse d'affichage (« FPS », « RPG »).

Problématique : qui pose les tags d'une catégorie, sous quelle forme et dans quelle limite, et comment arrivent-ils dans les lectures de `discovery` ?

## Facteurs de décision

- **Fidélité à la référence** (ADR 0036) : des libellés courts, avec leur casse d'affichage, deux ou trois par catégorie.
- **Un seul propriétaire** pour la catégorie : `channel` (ADR 0021 §3, ADR 0045).
- **Lecture sans appel entre contextes** : `discovery` sert Browse à partir de ses projections (ADR 0003).
- **Simplicité** : ni table de référence ni écran de modération pour une poignée de libellés.

## Options envisagées

### Option A — Une liste fermée de tags, gérée comme une entité

Une table `Tag` avec son propre cycle de vie (création, renommage, retrait), et un lien entre catégories et tags. Cette option permettrait un filtre de Browse par tag et un renommage global. Elle ajoute une entité et des routes d'administration pour un besoin que la référence ne montre pas. **Écartée** pour l'instant.

### Option B — Une liste libre de libellés, posée par l'administration sur la catégorie

La catégorie porte une liste ordonnée de libellés, remplacée en entier par une route d'administration. Le changement publie l'état complet de la catégorie dans `channel.category.updated`, et `discovery` le projette. **Retenue.**

### Option C — Reprendre les tags des chaînes de la catégorie

Les tags affichés seraient ceux qui reviennent le plus souvent sur les chaînes en live de la catégorie. Ils ne seraient pas stables, et ils dépendraient de tags de chaîne qui n'existent pas encore. **Écartée.**

## Décision

### 1. Propriétaire et forme

`channel` possède les tags d'une catégorie : `ChannelCategory.tags`, une liste ordonnée de libellés.

- Chaque libellé fait de 1 à 24 caractères après suppression des espaces de bord. Il contient des lettres, des chiffres, des espaces, `-`, `&` et `'`.
- La casse d'affichage est gardée (« FPS », « Shooter »). Deux libellés égaux sans tenir compte de la casse ni des accents sont un doublon, et la requête est refusée.
- Une catégorie porte **5 tags au plus**, et peut n'en porter aucun.

### 2. Administration

`PUT /v1/admin/categories/{slug}/tags { "tags": ["FPS", "Shooter"] }` remplace la liste entière. La route exige le scope `admin:category.manage` (ADR 0045 §4).

- Une liste invalide (libellé hors format, doublon, plus de 5 tags) rend `400`.
- Une catégorie inconnue rend `404`, et une catégorie fusionnée ou retirée rend `409`.
- La réponse est la catégorie, avec ses `tags`.

### 3. Événement

Le changement publie `channel.category.updated { categoryId, name, imageKey, tags }`, l'état complet de la catégorie. Le champ `tags` s'ajoute à la version 1 sans la casser (payload `looseObject`, ADR 0045 §5). Un event plus ancien, sans `tags`, se lit comme une liste vide. Le changement de pochette publie lui aussi `tags`.

### 4. Lectures

`discovery` projette `tags` dans `DiscoveryCategoryView`.

- `GET /v1/categories` (Browse) rend `tags` sur chaque catégorie.
- `GET /v1/categories/{slug}` rend l'en-tête d'une catégorie : `slug`, `name`, `imageUrl?`, `liveCount`, `viewerCount` et `tags`. L'audience vient de `DiscoveryCategoryAudience` (ADR 0047). Une catégorie active sans live rend `liveCount: 0` et `viewerCount: 0`.
- Le slug d'une catégorie fusionnée rend la catégorie cible : le client lit le `slug` de la réponse. Un slug inconnu ou retiré rend `404`.
- Le catalogue (`GET /v1/categories/catalog`) ne porte pas les tags : le sélecteur de catégorie ne les affiche pas.

## Conséquences

### Positives

- La grille de Browse et l'en-tête de catégorie affichent les tags de la référence, sans nouvelle entité.
- `discovery` lit les tags dans sa projection, sans appel à `channel`.

### Négatives

- Renommer un tag sur toutes les catégories demande une requête par catégorie.
- Il n'y a pas de filtre de Browse par tag. S'il devient nécessaire, l'option A sera réévaluée.

### Risques et mitigations

- **Un tag mal orthographié sur une catégorie.** La route remplace la liste entière, et la correction est immédiate.

## Notes d'implémentation

1. Migration : `ChannelCategory.tags text[] NOT NULL DEFAULT '{}'`, et `DiscoveryCategoryView.tags` avec la même définition.
2. Route `PUT /v1/admin/categories/{slug}/tags`, et `tags` dans le payload de `channel.category.updated`.
3. `tags` dans `BrowseCategory`, et `GET /v1/categories/{slug}` avec son contrat `CategoryHeader`. Si la route Follow ajoute `followerCount` ou `isFollowing`, ces champs s'ajoutent à ce même contrat.
4. Tags du seed sur les 10 catégories de développement.

## Liens

- ADR 0003 : projections et outbox.
- ADR 0021 : périmètre fonctionnel, tags d'une chaîne.
- ADR 0036 : fidélité à la référence UI.
- ADR 0045 : cycle de vie d'une catégorie, et `channel.category.updated`.
- ADR 0047 : audience des catégories.
