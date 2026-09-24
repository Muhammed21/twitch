# 0024 — Conventions de contrat pour la compatibilité ascendante

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0009 (garde-fou n°3, garde-fou n°4, notes d'implémentation, risques), ADR 0023 (types des messages serveur côté iOS)
- Source : [spike du 2026-09-24 sur la chaîne du contrat](../spikes/2026-09-24-contrat-zod-swift.md), [spike de charge socket.io](../spikes/2026-09-24-charge-socketio.md) pour le coût du parsing

## Contexte et problématique

L'ADR 0009 fait de Zod la source de vérité, génère `openapi.json` avec `nestjs-zod`, puis le client Swift avec `swift-openapi-generator`. Son garde-fou n°4 promet que certains changements ne cassent pas les binaires iOS déjà installés : ajouter un champ en réponse, ajouter une valeur d'enum grâce à un cas `unknown(String)`.

Le spike a testé la chaîne réelle (Zod 4.6, `nestjs-zod` 5.5, NestJS 11 et 12, `swift-openapi-generator` 1.13, Swift 6 strict). Elle compile, mais avec les réglages par défaut, **8 cas de décodage sur 20 échouent à tort**, et plusieurs défauts ne produisent aucune erreur de build :

1. **Tout champ ajouté en réponse casse les anciens clients.** `z.object` émet `additionalProperties: false`, et le client généré le vérifie au décodage. La ligne « ajouter un champ optionnel en réponse : oui » du garde-fou n°4 est fausse.
2. **Un `.nullable()` posé directement sur un DTO devient un tableau** (`string[]`) dans l'OpenAPI. Le `nextCursor` de la pagination (ADR 0008) casse sur chaque réponse.
3. **Un champ nullable qui n'est pas une chaîne nue disparaît du type Swift** (date, entier borné, `.nullish()`), avec un simple avertissement dans le log de build.
4. **Les enums générés sont fermés** (`@frozen`, sans cas de repli) : une nouvelle valeur fait échouer toute la réponse. Le générateur ne sait pas produire le cas `unknown(String)` que l'ADR 0009 exige.
5. **Une nouvelle variante d'union fait échouer toute la réponse**, avec ou sans `discriminator`. Or `EntitlementState` (ADR 0013) et `ServerMessage` (ADR 0022) sont faits pour grandir.
6. **Les dates de `Date.toISOString()` (avec millisecondes) ne se décodent pas** avec le transcodeur par défaut, et aucun transcodeur fourni n'accepte les deux formes.
7. **En mode OpenAPI 3.0, le document produit est invalide**, et le générateur le refuse.

Chaque défaut a une parade testée : avec toutes les parades, tous les cas de la seconde sonde passent. Mais ces parades sont des conventions de schéma et des étapes de pipeline que l'ADR 0009 ne prévoit pas.

Deux autres questions restent ouvertes par l'ADR 0009. Comment les schémas des messages temps réel (`ServerMessage`) atteignent-ils Swift, alors qu'ils ne passent par aucun endpoint REST ? Et le coût du parsing Zod est-il un risque sur le chemin du chat ?

## Facteurs de décision

- **Tenir réellement le garde-fou n°4** : un binaire iOS installé ne doit pas planter au décodage parce que le serveur a évolué.
- **Rendre les défauts bruyants** : tout défaut silencieux de la chaîne doit devenir un échec de CI.
- **Ne jamais patcher le code Swift généré** (ADR 0009) ; transformer un artefact par une règle pure et testable est acceptable.
- **Confiner la laideur** : les types générés maladroits ne doivent pas sortir de `Core/Networking` (ADR 0010, règle 2).

## Options envisagées

**Option A — Garder la chaîne, ajouter conventions et normalisation.** Toutes les parades sont testées et locales. Coût : des règles de schéma à respecter et à outiller, et quelques types générés peu idiomatiques, confinés derrière un mapper. **Retenu.**

**Option B — Écrire les types Swift à la main à partir de l'OpenAPI.** Aucune surprise de générateur, mais on perd la raison d'être de l'ADR 0009 : un contrat unique, vérifié par le compilateur des deux côtés. Écarté.

**Option C — Changer de générateur Swift.** Aucun générateur Swift mature ne gère mieux les enums ouverts et les unions extensibles ; on déplacerait le problème. Écarté.

## Décision

### 1. OpenAPI 3.1 uniquement

`cleanupOpenApiDoc` est appelé en 3.1. Le mode 3.0 produit un document invalide (issue amont `nestjs-zod` #474).

### 2. Objets : réponses ouvertes, requêtes strictes

- **Schémas de réponse en `z.looseObject(...)`.** Le document porte `"additionalProperties": {}`, et le client généré conserve les clés inconnues sans échouer. C'est ce qui rend vraie la ligne « ajouter un champ en réponse : oui ».
- **Schémas de requête en `z.object(...)` strict.** Côté serveur, refuser un champ inconnu reste le bon comportement.
- Règle de lint dans `packages/contracts` : un schéma exporté dans `responses/` qui utilise `z.object` est une erreur.

### 3. Enums ouverts en réponse

- Tout enum transporté en réponse passe par un helper `openEnum([...])`, qui produit `z.union([z.enum([...]), z.string()])`. Le client généré reçoit une struct à deux valeurs (valeur connue, chaîne brute), qu'une valeur inconnue remplit sans échouer.
- `z.enum` nu est interdit par lint dans les schémas de réponse. Il reste autorisé en requête.
- Le mapper de `Core/Networking` traduit la struct générée en enum de `Domain` avec un cas `.unknown(String)`. Le corollaire iOS du garde-fou n°4 est ainsi tenu par le mapper, et non par le générateur, qui ne sait pas le faire.

### 4. Unions extensibles : variante de repli obligatoire

- Toute union de réponse susceptible de gagner des variantes (`EntitlementState`, `ServerMessage`, et par défaut toute union de réponse) se termine par une **variante de repli** : `z.looseObject({ <discriminant>: z.string() })`, en dernière position, sans `discriminator`.
- Le type généré est une struct à valeurs optionnelles, où une valeur connue remplit aussi la variante de repli. Le mapper de `Core/Networking` prend la première variante connue qui a décodé, sinon produit un cas `.unknown` de `Domain`.
- Une union de réponse sans variante de repli est une erreur de lint, sauf annotation explicite (`.meta({ closed: true })`) justifiée en revue.

### 5. Nullabilité

- **Pas de `.nullable()` directement sur un DTO** (lint). Un champ qui peut manquer est `.optional()`. Si la distinction entre « nul » et « absent » a un sens métier, le champ va dans un schéma nommé imbriqué.
- **`.nullish()` interdit** (lint).
- **Étape `normalize-nullable`** dans la génération, entre `cleanupOpenApiDoc` et l'écriture de `openapi.json`. Elle réécrit tout `anyOf` à deux branches dont l'une est `{ "type": "null" }` en `{ ...branche, "type": [T, "null"] }`. C'est une fonction pure, testée sur ses propres fixtures ; elle transforme l'artefact, jamais le code Swift.
- Accepté : un champ requis nullable et absent se décode en `nil` côté client. Le serveur garantit la présence par Zod en sortie ; le client ne détectera pas cette régression.

### 6. Types scalaires

- **Dates** : `Core/Networking` configure le client avec un transcodeur ISO 8601 tolérant : il accepte les dates avec et sans millisecondes, et encode toujours avec millisecondes.
- **UUID** : un schéma nommé `Uuid` dans `packages/contracts` (`z.uuid().meta({ id: "Uuid" })`), mappé sur `Foundation.UUID` par `typeOverrides` et `additionalImports` dans la configuration du générateur. Un identifiant mal formé est rejeté au décodage.
- **Entiers** : `z.int()` (±2⁵³), qui devient `Swift.Int` sans perte.

### 7. Messages temps réel : publiés comme schémas de `openapi.json`

L'ADR 0009 ne disait pas comment `ServerMessage` atteint Swift. Décision :

- Chaque événement serveur socket.io (ADR 0022, §6) a un schéma de charge utile nommé dans `packages/contracts`. L'ensemble est publié dans `components.schemas` de `openapi.json`, sous un préfixe `Realtime` (`RealtimeSessionRevoked`, `RealtimeChatMessage`…), avec une table de correspondance nom d'événement → schéma.
- Le client minimal de l'ADR 0023 (`Core/ChatTransport`) décode chaque charge utile avec le type Swift généré correspondant. Les conventions §2 à §6 s'appliquent de la même façon.
- **À vérifier au premier passage de `contract-check`** : le générateur produit-il les schémas qu'aucun chemin ne référence ? Le spike ne l'a testé qu'à travers un endpoint factice. Si ce n'est pas le cas, repli : un endpoint de documentation `GET /v1/realtime/schema`, qui n'est jamais appelé mais qui référence ces schémas.

### 8. Job `contract-check` renforcé

Ajouts aux notes d'implémentation de l'ADR 0009 :

- **Génération avec `tsc`**, jamais `tsx` ni esbuild sans métadonnées de décorateurs. Sans elles, le document perd silencieusement les paramètres de requête et les codes de réponse.
- **Échec si le log du générateur Swift contient `is not supported` ou `skipping`.** Un champ supprimé du type Swift n'est aujourd'hui qu'un avertissement.
- **Test de compatibilité ascendante** : le client Swift généré depuis l'`openapi.json` de `main` doit décoder des fixtures produites par le serveur de la branche, dont un champ ajouté, une valeur d'enum ajoutée et une variante d'union ajoutée. C'est le seul test qui vérifie la promesse du garde-fou n°4 du côté où elle compte ; `oasdiff` raisonne sur le document, pas sur le client généré.

### 9. Versions

- **NestJS épinglé en 11.x.** `nestjs-zod` 5.5 ne déclare pas NestJS 12 dans ses dépendances pairs. Passer en 12 attendra qu'il le fasse, plutôt que d'installer en `--legacy-peer-deps`.
- `nestjs-zod`, `zod` et `swift-openapi-generator` sont épinglés en version exacte ; toute montée de version passe par le test de compatibilité du §8.

### 10. Coût du parsing Zod : retiré des risques

Le spike de charge mesure 0,33 µs par message valide et 0,58 µs par message invalide (Zod 4.6, `JSON.parse` compris), soit plus d'un million de messages par seconde et par cœur. La diffusion coûte trois à quatre ordres de grandeur de plus. Le garde-fou n°3 de l'ADR 0009 (instrumenter, puis optimiser dans un ordre fixé) reste, mais l'incertitude sur le coût du parsing est levée : ce n'est pas un sujet.

## Conséquences

### Positives

- Le garde-fou n°4 de l'ADR 0009 devient vrai, et il est vérifié par un test, pas seulement affirmé.
- Les défauts silencieux de la chaîne deviennent des échecs de CI.
- Les messages temps réel ont enfin des types Swift générés, avec les mêmes règles que le REST.

### Négatives

- Des conventions de schéma à connaître, à outiller en lint, et à expliquer en revue.
- Des types générés peu idiomatiques pour les enums ouverts et les unions extensibles (structs `value1` / `value2`), confinés au mapper de `Core/Networking`.
- Une étape de normalisation à maintenir entre deux outils tiers.
- NestJS reste une version majeure en retard.

### Risques et mitigations

- **Risque : une montée de version corrige ou change un défaut, et la normalisation devient fausse.** Mitigation : `normalize-nullable` a ses fixtures ; le test de compatibilité du §8 échoue si le client généré change de comportement.
- **Risque : `nestjs-zod` abandonné.** Il porte deux des défauts constatés (nullable à la racine, OpenAPI 3.0). Mitigation inchangée par rapport à l'ADR 0009 : son usage réel est réinternalisable. Le spike en précise le périmètre : pipe de validation, génération des DTO, patch OpenAPI.
- **Incertitude : schémas non référencés** (§7). Levée au premier passage de `contract-check`, avec un repli prévu.

## Notes d'implémentation

- `packages/contracts` : sous-dossiers `requests/`, `responses/`, `realtime/` ; helpers `openEnum`, `extensibleUnion` et `Uuid` ; règles de lint des §2 à §5.
- Tests à écrire en premier : `normalize-nullable` sur un `anyOf` date, entier et chaîne ; lint qui refuse `z.object` en réponse, `z.enum` nu en réponse, `.nullish()` et une union sans repli ; test de compatibilité avec un champ ajouté, une valeur d'enum ajoutée et une variante ajoutée.
- `Core/Networking` : transcodeur tolérant, mappers vers `Domain` avec cas `.unknown` ; aucun type généré exposé publiquement (ADR 0010).
