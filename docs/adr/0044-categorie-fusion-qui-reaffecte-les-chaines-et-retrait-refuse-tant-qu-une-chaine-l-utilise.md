# 0044 — Une catégorie fusionnée réaffecte ses chaînes, et une catégorie n'est retirée qu'une fois inutilisée

- Statut : Proposé
- Date : 2026-11-04
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'onglet Browse de l'app iOS liste les catégories en live (captures `docs/reference-ui/parcourir/`). L'ADR 0021 (§3) place le catalogue des catégories et la catégorie d'une chaîne dans `channel`. Il fixe aussi les events `channel.category.created`, `channel.category.merged` et `channel.category.retired`, et une administration par l'API derrière le scope `admin:category.manage`. Enfin, la fusion réécrit les références des chaînes, puis `discovery` se met à jour par events.

Plusieurs points restent ouverts dans les ADR :

- comment une catégorie est identifiée dans les URL et dans les références ;
- ce que devient la catégorie source d'une fusion ;
- le retrait d'une catégorie qu'une chaîne utilise encore ;
- comment l'administration est autorisée tant que la coquille Payload de l'ADR 0007 n'existe pas ;
- comment le propriétaire pose la catégorie de sa chaîne, et comment `discovery` l'apprend ;
- la pochette de la catégorie.

Problématique : quel cycle de vie donner à une catégorie, de sa création à sa fusion ou à son retrait, et qui peut le piloter ?

## Facteurs de décision

- **Invariant de l'ADR 0021** : une chaîne ne pointe jamais vers une catégorie inexistante.
- **Pas de changement silencieux de masse** : une action d'administration ne modifie pas des chaînes sans que ce soit son objet.
- **Projections reconstructibles** (ADR 0041) : `discovery` rejoue les events de `channel` pour reconstruire Browse.
- **Une seule autorité** (ADR 0007) : l'administration passe par les mêmes cas d'usage, quelle que soit l'interface qui les appelle.
- **Capacité d'un développeur solo**.

## Options envisagées

### Option A — Retirer une catégorie utilisée vide la catégorie de ses chaînes

Le retrait remet à `null` la catégorie de chaque chaîne concernée. Simple pour l'administrateur, mais un clic retire leur catégorie à des chaînes en live, sans destination. **Écartée** : c'est un changement de masse qui n'est pas l'objet de l'action.

### Option B — Retirer une catégorie utilisée est refusé ; la fusion déplace ses chaînes

Le retrait répond `409` tant qu'une chaîne utilise la catégorie. Pour se débarrasser d'une catégorie utilisée, on la fusionne dans une autre, ce qui dit explicitement où vont ses chaînes. **Retenue.**

### Option C — Une fusion supprime la catégorie source

La ligne source disparaît. Un lien ancien (`/v1/categories/{slug}/lives`) ne mène plus nulle part, et une référence Payload (ADR 0007) non plus. **Écartée** au profit d'une source conservée et marquée fusionnée.

## Décision

### 1. Identité

Une catégorie a :

- un identifiant UUID, stable, qu'utilisent les références des chaînes et de Payload ;
- un slug unique, qui apparaît dans les URL (`just-chatting`), au format `^[a-z0-9]+(-[a-z0-9]+)*$` et de 50 caractères au plus. L'administrateur le choisit à la création, et il ne change plus ;
- un nom affiché, de 1 à 50 caractères ;
- une pochette optionnelle (§6).

Son état vaut `active`, `merged` ou `retired`. Seule une catégorie `active` se pose sur une chaîne et apparaît dans les lectures.

### 2. Fusion

`merge(source, target)` s'exécute en une transaction de `channel` :

1. toutes les chaînes de la source passent sur la cible ;
2. la source passe à `merged`, avec `mergedIntoId = target` ;
3. l'outbox reçoit `channel.category.merged { sourceCategoryId, targetCategoryId }`.

Une fusion dans soi-même, depuis ou vers une catégorie qui n'est pas `active`, est refusée par un `409`. La réaffectation ne publie pas un `channel.metadata.updated` par chaîne : `discovery` applique la fusion à partir de l'event unique.

### 3. Retrait

Le retrait d'une catégorie qu'une chaîne utilise encore est refusé par un `409`. Une catégorie inutilisée passe à `retired`, et l'outbox reçoit `channel.category.retired { categoryId }`. Une catégorie retirée ne revient pas : on en crée une nouvelle.

### 4. Administration

Les routes d'administration (`/v1/admin/categories…`) exigent deux conditions cumulées, comme l'ADR 0007 :

- le jeton porte le scope `admin:category.manage` ;
- son titulaire a le rôle de plateforme `admin`, qui donne `manage` sur `Category` (ADR 0006).

Le scope n'est accordé à aucun client iOS. L'en-tête `X-Acting-User` arrive avec la coquille Payload (ADR 0007).

### 5. Catégorie d'une chaîne

Le propriétaire, ou un éditeur, pose la catégorie par `PATCH /v1/channels/{id}` avec `categoryId` (UUID d'une catégorie `active`, ou `null` pour la retirer). `channel.metadata.updated` porte alors l'état complet des métadonnées : `{ channelId, title, categoryId }`. Le champ s'ajoute à la version 1 sans la casser, car le payload d'un event est un `looseObject` qui garde un champ inconnu. Le catalogue des catégories actives, que l'app lit pour proposer un choix, est servi par `channel` sur `GET /v1/categories/catalog`.

### 6. Pochette

La catégorie porte une clé d'objet optionnelle, attachée par une route d'administration. Elle passe par la brique d'envoi d'image présigné, et l'URL publique est calculée à la lecture. `channel.category.created` porte la pochette quand elle existe. Son changement publie `channel.category.updated { categoryId, name, imageKey }`.

## Conséquences

### Positives

- Aucune chaîne ne perd sa catégorie sans qu'un administrateur ait dit où elle va.
- Une fusion produit un seul event, et `discovery` la rejoue sans dépendre de l'ordre des events par chaîne.
- Les anciens slugs restent connus : une lecture peut rediriger une catégorie fusionnée vers sa cible.

### Négatives

- Retirer une catégorie utilisée demande deux gestes : fusionner, ou attendre que ses chaînes en changent.
- Un quatrième event, `channel.category.updated`, s'ajoute aux trois de l'ADR 0021.
- `channel.metadata.updated` transporte la catégorie même quand seul le titre change.

### Risques et mitigations

- **Une fusion qui touche beaucoup de chaînes tient une longue transaction.** Mitigation : le catalogue compte quelques centaines de catégories et la réaffectation est un seul `UPDATE … WHERE categoryId = source`. À mesurer au seed de charge.
- **Un `channel.metadata.updated` antérieur à une fusion, rejoué après elle, remet l'ancienne catégorie dans `discovery`.** Mitigation : `discovery` résout une catégorie `merged` vers sa cible au moment d'appliquer l'event.

## Notes d'implémentation

1. `channel` : agrégat `Category`, administration, `Channel.categoryId`, events.
2. `discovery` : projection du catalogue, catégorie de chaque live, `GET /v1/categories` et `GET /v1/categories/{slug}/lives`.
3. Seed de dev : dix catégories, et une catégorie posée sur chaque chaîne de démo.

## Liens

- ADR 0021 : place le catalogue dans `channel` et nomme ses events.
- ADR 0007 : administration par l'API, scopes du compte de service, mise en avant dans Payload.
- ADR 0006 : rôle de plateforme `admin`.
- ADR 0041 : projections de `discovery` reconstruites depuis les outbox.
