# 0035 — Slug de chaîne dérivé du nom d'affichage, au format Twitch, jamais refusé à la création

- Statut : Accepté — option B (plugin `username`) reprise et emplacement de la liste des mots réservés (§2) amendés par [0039](0039-pages-d-authentification-servies-par-l-api-en-html-sans-javascript.md)
- Date : 2026-10-15
- Décideurs : Muhammed Cavus

## Contexte et problématique

L'ADR 0003 crée une chaîne pour chaque compte, à la réception de `identity.account.registered`. Une chaîne porte un slug, son adresse permanente (`twitch://channel/<slug>`, ADR 0021). L'ADR 0009 impose un `ChannelSlug` qui « respecte un format et une liste de réservés », sans fixer l'un ni l'autre.

Trois contraintes pèsent sur la création :

- `channel` ne lit rien chez `identity` (ADR 0003, règle 2) : le slug se construit avec ce que porte l'event ;
- la création est asynchrone, après l'inscription (ADR 0002, outbox) : un refus ne peut plus être montré à l'utilisateur, et un event qui échoue toujours bloque sa chaîne pour de bon ;
- l'inscription ne demande qu'un nom d'affichage, un e-mail et un mot de passe.

Problématique : d'où vient le slug d'une chaîne créée à l'inscription, quel format respecte-t-il, et que faire quand il est pris ou réservé ?

## Facteurs de décision

- Un consommateur asynchrone ne peut pas échouer définitivement sur une donnée valide.
- Le slug reste lisible : il sert d'adresse.
- La règle du slug vit à un seul endroit, le domaine `channel`.
- L'inscription ne change pas pour l'utilisateur.

## Options envisagées

### Option A — Dérivé du nom d'affichage, sans refus

L'event porte le nom d'affichage. `channel` le normalise, puis ajoute un suffixe si le résultat est trop court, réservé ou pris.

- Avantages : jamais de refus ; slug lisible ; aucune règle de slug côté `identity`.
- Inconvénients : le slug n'est pas choisi par l'utilisateur ; deux noms proches donnent des suffixes.
- **Retenue.**

### Option B — Un username choisi à l'inscription

Plugin `username` de better-auth : le slug est le login, validé et rendu unique à l'inscription.

- Avantages : fidèle à Twitch ; le refus se montre au bon moment.
- Inconvénients : la règle du slug existe en double, dans `identity` et dans `channel` ; l'inscription et l'app iOS changent.
- **Écartée** : elle duplique la règle du slug et touche l'inscription pour un gain d'apparence.

### Option C — Slug technique provisoire

`user_<8 premiers caractères hexadécimaux de l'identifiant du compte>`, sans rien lire de l'inscription.

- Avantages : aucun changement de contrat.
- Inconvénients : toutes les chaînes naissent avec une adresse illisible.
- **Écartée.**

## Décision

### 1. Format

Un slug respecte `^[a-z0-9_]{4,25}$` : minuscules, chiffres et soulignés, de 4 à 25 caractères, comme Twitch.

### 2. Mots réservés

Une liste fermée, dans le domaine `channel`, refuse les slugs qui imitent une route ou un rôle de l'application : `admin`, `api`, `auth`, `directory`, `help`, `login`, `logout`, `moderator`, `privacy`, `search`, `settings`, `signup`, `staff`, `support`, `terms`, `twitch`, `well_known`. Une PR l'étend.

### 3. Dérivation

`identity.account.registered` porte `displayName`. Le slug s'en déduit :

1. décomposition Unicode et retrait des accents, minuscules ;
2. chaque suite de caractères hors `[a-z0-9]` devient un `_`, sans `_` en bord ;
3. coupe à 25 caractères ; un nom vide donne `user`.

Les candidats sont, dans l'ordre, ce résultat, puis le résultat suivi de `_2` à `_9`, puis suivi de `_` et des 12 premiers caractères hexadécimaux de l'identifiant du compte (48 bits), la base étant raccourcie pour tenir dans 25 caractères. Avec 12 caractères, deux comptes de même base n'ont une chance sur deux de partager ce dernier candidat qu'au-delà d'environ 16 millions de comptes ; avec 6, ce serait dès environ 4 800, et les noms sans lettre latine, qui partagent tous la base `user`, y arriveraient vite. Le premier candidat valide et libre est retenu. Les candidats ne dépendent que de l'event : un event rejoué donne les mêmes.

### 4. Une chaîne par compte

Le slug et le propriétaire sont uniques en base. Le changement de slug par l'utilisateur fera l'objet d'un use-case à part.

## Conséquences

### Positives

- La création d'une chaîne n'échoue jamais sur le nom choisi.
- La règle du slug n'existe que dans `channel`.
- L'inscription ne change pas.

### Négatives

- L'utilisateur ne choisit pas son slug à l'inscription.
- Deux comptes au même nom obtiennent `nom` et `nom_2` selon l'ordre d'arrivée des events.
- Un nom sans aucune lettre latine donne `user`, puis un suffixe.

### Risques et mitigations

- **Risque : deux créations concurrentes visent le même slug.** L'unicité en base fait échouer l'une des transactions ; l'event est rejoué (at-least-once, ADR 0002) et choisit un autre candidat.
- **Risque : les dix candidats sont pris.** Le dernier porte 48 bits de l'identifiant du compte ; s'il est pris malgré tout, la création échoue à chaque tentative, puisque les candidats ne dépendent que de l'event, et se verra dans les journaux. Un nom d'une seule lettre ne garde que ce dernier candidat, `a_2` à `a_9` étant trop courts.

## Notes d'implémentation

- `apps/api/src/modules/channel/domain/channel-slug.ts` : format, mots réservés, candidats.
- `events.identity.accountRegistered` (version 1) gagne `displayName` ; `identityOutbox` le remplit avec le `name` de l'inscription.

## Liens

- [0002](0002-monolithe-modulaire-hexagonal.md) : outbox, at-least-once, consommateurs idempotents.
- [0003](0003-decoupage-bounded-contexts.md) : création de la chaîne à l'inscription, pas de lecture chez `identity`.
- [0009](0009-contrat-api-zod-source-de-verite.md) : `ChannelSlug`, invariant métier.
