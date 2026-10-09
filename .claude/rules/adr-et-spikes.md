---
paths:
  - "docs/adr/**"
  - "docs/spikes/**"
---

# ADR et spikes

Un ADR enregistre une décision durable ; un spike enregistre une recherche bornée qui éclaire une décision. Les deux sont historiques : ils décrivent ce qui était su et décidé à leur date. Format [MADR](https://adr.github.io/madr/), en français.

## Quand écrire un ADR

Une décision mérite un ADR quand elle est durable, coûteuse à défaire, et qu'un développeur la reprendrait sans le savoir. Un choix réversible en une PR n'en mérite pas. Avant d'écrire, cherche dans `docs/adr/` un ADR qui la couvre déjà : une décision qui en change une autre la **remplace**, elle ne s'écrit pas à côté.

L'ADR se décide avec le développeur, il ne se décide pas à sa place : n'invente ni contrainte, ni option écartée, ni justification. Un nouvel ADR naît `Proposé` ; seul un humain le passe à `Accepté`.

## Fichier et numéro

`docs/adr/NNNN-titre-en-kebab-case.md`, sur quatre chiffres : le plus grand numéro de `docs/adr/` plus un. Vérifie aussi les PR ouvertes (`gh pr list`) : un numéro libre sur ta branche peut être pris ailleurs. Un numéro n'est jamais réutilisé, même pour un ADR rejeté.

Le titre est la décision elle-même, pas le sujet : « Monolithe modulaire hexagonal plutôt que microservices », pas « Architecture de l'API ».

## En-tête

```markdown
# NNNN — Titre de la décision

- Statut : Proposé
- Date : AAAA-MM-JJ
- Décideurs : Prénom Nom
- Amende : ADR NNNN (ce qui change), ADR NNNN (…)
```

`Amende` n'apparaît que si l'ADR modifie une partie d'un ADR existant.

## Sections, dans cet ordre

1. `## Contexte et problématique` — le problème, les contraintes, et pour finir une ligne `Problématique : <la question à trancher> ?`. Le catalogue (`docs/CATALOG.md`) résume l'ADR par cette ligne.
2. `## Facteurs de décision` — les critères, en liste, qui départagent les options.
3. `## Options envisagées` — une `### Option X — nom` par option, avec ses avantages, ses inconvénients et son verdict (**Écartée** et pourquoi, ou **retenue**).
4. `## Décision` — ce qui est décidé, découpé en `### 1. …`, `### 2. …` quand la décision a plusieurs volets. Le texte est prescriptif.
5. `## Conséquences` — `### Positives`, `### Négatives`, `### Risques et mitigations`. Les trois sont obligatoires : un ADR sans conséquence négative n'a pas été pesé.
6. `## Notes d'implémentation` — l'ordre de mise en place, les extraits de code ou de configuration.
7. `## Liens` — les ADR et spikes liés, une ligne chacun avec ce qui les relie.

## Un ADR accepté ne se réécrit pas

Pour changer une décision acceptée :

1. Écris un nouvel ADR, avec `Amende :` dans son en-tête.
2. Dans l'ancien ADR, change **seulement** la ligne de statut : `- Statut : Accepté — <partie> remplacée par [NNNN](NNNN-titre.md)`. Son corps reste tel quel.
3. Dans `docs/adr/README.md` : ajoute la ligne du nouvel ADR à l'index, mets à jour le statut de l'ancien, et ajoute l'arête au graphe de « Dépendances principales ».
4. Si le changement tranche une divergence ou ouvre un point, mets à jour « Points ouverts » ou « Divergences résolues ».

Seuls la ligne de statut, les liens cassés et le formatage d'un ADR accepté peuvent changer.

## Spikes

`docs/spikes/AAAA-MM-JJ-sujet.md`. Un spike ne produit pas de code de production : son code est jetable, et les extraits utiles sont recopiés dans le compte rendu.

```markdown
# Spike — sujet

- Date : AAAA-MM-JJ
- Origine : l'ADR et le passage qui ont déclenché la recherche, cité entre « »
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.
```

Puis, dans cet ordre :

1. `## Question` — la question précise, en un paragraphe. Le catalogue résume le spike par sa première phrase.
2. `## Réponse courte` — la réponse en tête, avant le détail : un lecteur pressé s'arrête là.
3. `## Montage` — versions exactes, machine, configuration : de quoi refaire la mesure.
4. `## Constats` (ou les résultats par sonde) — ce qui a été observé, chiffres compris.
5. `## Recommandation` — liste numérotée, une action par point.
6. `## Ce que le spike n'a pas vérifié` — obligatoire : ce qui reste ouvert, pour que personne ne le croie couvert.

Un spike qui change une décision se termine par un ADR, ou par un amendement d'ADR proposé, jamais par une modification silencieuse de l'ADR concerné.

## Après chaque ajout

Le pre-commit régénère `docs/CATALOG.md` dès qu'une page de `docs/` change ; sinon, `pnpm generate`. La CI vérifie que le catalogue est à jour et que les liens internes pointent vers des fichiers qui existent.
