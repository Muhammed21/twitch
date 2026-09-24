# Spike — chaîne du contrat Zod → OpenAPI → Swift

- Date : 2026-09-24
- Origine : incertitude déclarée par l'ADR 0009 (« la fidélité de `swift-openapi-generator` sur les schémas complexes. Unions discriminées, `oneOf`, champs nullable-vs-absent produisent du Swift parfois maladroit ou faux »)
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

La chaîne prescrite par l'ADR 0009 produit-elle, sur les cas difficiles du projet, du Swift **correct**, compilé en Swift 6 strict, et qui respecte la politique de compatibilité de l'ADR 0009 (§ garde-fou n°4) vis-à-vis des binaires iOS déjà installés ?

La chaîne testée : Zod → `nestjs-zod` (DTO + patch OpenAPI) → `openapi.json` → `swift-openapi-generator` (plugin SPM).

## Réponse courte

**Non, pas en l'état, et plusieurs défauts sont silencieux.** Avec les réglages par défaut, **8 des 20 cas de décodage échouent à tort** (un neuvième échoue à juste titre). Trois de ces échecs cassent la politique de compatibilité de l'ADR 0009 sur des changements qu'elle déclare autorisés :

1. **Tout champ ajouté côté serveur fait échouer le décodage chez les anciens clients.** `z.object` émet `additionalProperties: false`, et le client généré le vérifie strictement.
2. **Un `.nullable()` posé directement sur un DTO devient un tableau** (`string[]`) dans l'OpenAPI : la pagination par curseur (`nextCursor`) casse sur chaque réponse réelle.
3. **Un champ nullable qui n'est pas une chaîne nue** (date, entier borné, `.nullish()`) **disparaît du type Swift**, sans erreur de build, avec un simple avertissement.

S'y ajoutent : les dates émises par `Date.toISOString()` (toujours en millisecondes) ne se décodent pas avec la configuration par défaut ; une valeur d'enum ou une variante d'union inconnue fait échouer toute la réponse ; le mode OpenAPI 3.0 produit un document que le générateur refuse.

**Chaque défaut a une parade testée.** Avec toutes les parades en place, chaque cas de la seconde sonde se comporte comme attendu. La chaîne reste viable, mais seulement avec des conventions de schéma imposées dans `packages/contracts`, une étape de normalisation de l'OpenAPI, et un transcodeur de dates tolérant côté iOS. Rien de cela n'est dans l'ADR 0009 aujourd'hui.

## Montage

| Élément | Version |
|---|---|
| `zod` | 4.6.5 |
| `nestjs-zod` | 5.5.0 (release 2026-07-25) |
| NestJS (`@nestjs/core`, `common`, `swagger`) | 11.2.6 / 11.4.7 ; contrôle en 12.1.0 / 12.0.2 |
| `swift-openapi-generator` | 1.13.1 (release 2026-09-01) |
| `swift-openapi-runtime` | 1.12.1 |
| Toolchain | Swift 6.3.3, Xcode 26.6, `swiftLanguageMode(.v6)`, macOS 14 |

- Côté serveur : des schémas Zod réalistes (`ChannelSummary`, `ChannelPage` avec curseur, `EntitlementState` avec `PENDING_ATTRIBUTION`, `ServerMessage` du chat, `Problem` RFC 9457), des contrôleurs NestJS décorés par `@ZodResponse`, puis `SwaggerModule.createDocument` et `cleanupOpenApiDoc`, compilés avec `tsc`.
- Côté iOS : le document généré est placé dans une cible SPM avec le plugin `OpenAPIGenerator` (`types` + `client`, `namingStrategy: idiomatic`, `accessModifier: public`). Le client est appelé à travers un faux `ClientTransport` qui renvoie des JSON d'exemple : on exerce donc le vrai chemin de décodage du client généré, dates comprises.

## Résultats de la première sonde (réglages par défaut)

| Cas | Résultat | Remarque |
|---|---|---|
| Canal nominal | OK | |
| Entier ±2⁵³ (`z.int()`) | OK | `Swift.Int` ; `9007199254740991` passe |
| Date ISO 8601 **sans** millisecondes | OK | `Foundation.Date` |
| **Date avec millisecondes** (`2026-09-24T10:00:00.123Z`) | **FAIL** | `Expected date string to be ISO8601-formatted` |
| `title` nullable, valeur `null` | OK | `String?` |
| `title` nullable **requis, mais absent** | OK, à tort | Décodé en `nil` : « nul » et « absent » ne se distinguent pas côté client |
| `categoryId` optionnel présent | OK | |
| **`nextCursor` réel (chaîne)** | **FAIL** | Le type généré attend un tableau (voir constat 2) |
| **`nextCursor` `null` (dernière page)** | **FAIL** | Idem |
| **`lastLiveAt` (`.nullish()`) présent** | **FAIL** | Le champ a disparu du type, puis est rejeté comme propriété inconnue |
| **Champ ajouté côté serveur (`isPartner`)** | **FAIL** | `Additional properties are not allowed` |
| **Valeur d'enum inconnue (`status: "hibernating"`)** | **FAIL** | L'enum est `@frozen`, sans cas de repli |
| UUID mal formé | OK, à tort | `format: uuid` devient `Swift.String` : aucune validation |
| Union `ACTIVE`, `PENDING_ATTRIBUTION` | OK | Décodage par essais successifs, correct |
| **Statut d'entitlement inconnu (`GRACE_PERIOD`)** | **FAIL** | `The oneOf structure did not decode into any child schema` |
| Union : `status: ACTIVE` avec la forme `EXPIRED` | FAIL, à juste titre | Le littéral devient un enum à une seule valeur : bonne rigueur |
| `ServerMessage` `session.revoked`, `room.mode` | OK | |
| **`ServerMessage` de type inconnu (`raid.incoming`)** | **FAIL** | Toute la charge est rejetée |
| Erreur 400 `application/problem+json` | OK | Après déclaration explicite du type de contenu (voir constat 8) |

La compilation en Swift 6 strict passe dans tous les cas. Les seuls avertissements portent sur des `public import` inutilisés dans le code généré.

## Constats

### 1. `additionalProperties: false` casse la compatibilité ascendante — FAUX, bloquant

En mode `output`, `z.toJSONSchema` (qu'utilise `nestjs-zod`) émet `"additionalProperties": false` pour tout `z.object`. Le générateur en fait une vérification stricte au décodage :

```swift
try decoder.ensureNoAdditionalProperties(knownKeys: ["id", "slug", ...])
```

Conséquence : **ajouter un champ à une réponse fait échouer le décodage chez tous les binaires iOS déjà installés.** L'ADR 0009 déclare exactement l'inverse (« Ajouter un champ optionnel en réponse — Oui »). Ce n'est pas un cas limite : c'est la première chose qu'on fait en faisant évoluer une API.

**Parade testée** : déclarer les schémas de **réponse** en `z.looseObject(...)`. Le document porte alors `"additionalProperties": {}`, et le type généré garde les clés inconnues dans `additionalProperties: [String: OpenAPIValueContainer]`, sans échouer. Les schémas de **requête** restent en `z.object` strict : côté serveur, refuser l'inconnu est le bon comportement.

### 2. `.nullable()` à la racine d'un DTO devient un tableau — FAUX, bloquant

```ts
class ChannelPageDto extends createZodDto(z.object({ items: z.array(ChannelSummary), nextCursor: z.string().nullable() })) {}
```

produit dans l'OpenAPI :

```json
"nextCursor": { "type": "array", "items": { "type": "string" } }
```

puis en Swift : `public var nextCursor: [Swift.String]`.

Isolé sur cinq DTO minimaux : le défaut touche **toute propriété `z.string().nullable()` posée directement sur la classe DTO**, quelle que soit sa position. Les propriétés des schémas imbriqués et nommés (`.meta({ id })`) y échappent : `title` dans `ChannelSummary` sort correctement en `{"type": ["string","null"]}`. Le document brut de `@nestjs/swagger` est déjà faux, avant même `cleanupOpenApiDoc`. L'hypothèse la plus probable est que l'explorateur de propriétés de `@nestjs/swagger` interprète `type: [T, "null"]` (la forme courte émise par Zod ≥ 4.5) comme sa propre syntaxe de tableau `type: [String]`. Le défaut est reproduit à l'identique avec NestJS 12.

Conséquence : **la pagination par curseur (ADR 0008) casse sur chaque liste**, puisque le serveur envoie une chaîne ou `null`.

**Parades testées** : `nextCursor: z.string().optional()` (le champ est omis sur la dernière page) se génère en `Swift.String?`. Ou bien le champ nullable est déplacé dans un schéma nommé imbriqué. Une étape de normalisation ne peut pas corriger ce cas après coup : dans le document, l'information « nullable » est déjà perdue.

### 3. `anyOf [X, null]` : le champ disparaît — FAUX, silencieux

Dès que le schéma interne porte un mot-clé en plus du type, ce qui est le cas de `z.iso.datetime()`, de `z.int()` (bornes) ou de `z.uuid()` (motif), Zod émet un nullable sous la forme :

```json
"lastLiveAt": { "anyOf": [ { "type": "string", "format": "date-time", "pattern": "…" }, { "type": "null" } ] }
```

Le générateur ne sait pas le traiter et **retire le champ du type Swift**, avec pour seule trace un avertissement dans le log de build :

```
warning: Schema "null" is not supported, reason: "schema type", skipping [...ChannelSummary_Output/lastLiveAt]
```

Même comportement pour `z.int().nullable()` et pour `.nullish()`. Combiné au constat 1, le champ supprimé devient en plus une « propriété inconnue » qui fait échouer le décodage.

**Parade testée** : une étape de normalisation de l'OpenAPI (environ 20 lignes, `normalize-nullable.mjs` dans le spike) réécrit tout `anyOf` à deux branches dont l'une est `{ "type": "null" }` en `{ ...branche, "type": [T, "null"] }`. Après normalisation, `lastLiveAt` devient `Foundation.Date?` et `peakViewers` devient `Swift.Int?`. Cette étape transforme un artefact généré par une règle pure et testable : ce n'est pas un patch du code Swift généré, que l'ADR 0009 interdit à raison.

### 4. Enums fermés — FAUX vis-à-vis de l'ADR 0009

Tout `z.enum` devient un `@frozen public enum ...: String`, sans cas de repli. Une valeur ajoutée côté serveur fait échouer **toute la réponse**, et pas seulement le champ. L'ADR 0009 exige un cas `unknown(String)` côté iOS, que le générateur ne produit pas et ne sait pas produire (issues amont #428 et #608 closes sans cette fonctionnalité, #803 ouverte).

**Parade testée** : un enum « ouvert » côté Zod, `z.union([z.enum([...]), z.string()])`, génère un `anyOf` et une struct à deux valeurs (`value1: Enum?`, `value2: String?`). Une valeur inconnue se décode alors en `value1 == nil`, `value2 == "hibernating"`. C'est maladroit, mais correct, et confiné au mapper de `Core/Networking` qui le traduit en enum de `Domain` avec un cas `.unknown(String)` (ADR 0010, règle 2).

### 5. Unions : correctes pour les variantes connues, fragiles pour les nouvelles

- `z.discriminatedUnion` devient un `oneOf` **sans** mot-clé `discriminator`. Le générateur décode par essais successifs, et chaque littéral de discriminant devient un enum à une seule valeur. Le résultat est correct et strict, mais les noms de cas ne sont pas idiomatiques (`case EntitlementActiveOutput(...)`).
- Un `discriminator` peut être injecté via `.meta({ discriminator: { propertyName, mapping } })` : Zod le recopie tel quel, et le générateur produit alors un `switch` sur la valeur, avec des cas idiomatiques (`.active`, `.pendingAttribution`). Mais le `mapping` doit citer les noms suffixés `_Output` à la main.
- **Dans les deux cas, une variante inconnue fait échouer toute la réponse** (`unknownOneOfDiscriminator` ou `failedToDecodeOneOfSchema`). Pour `EntitlementState` (ADR 0013), qui gagnera des statuts, et pour `ServerMessage`, qui gagnera des types, c'est un crash de décodage programmé chez les anciens binaires.

**Parade testée** : un `z.union([Active, Pending, UnknownEntitlement])` sans discriminant, avec en dernière position une variante de repli `z.looseObject({ status: z.string() })`. Le document porte un `anyOf`, et `GRACE_PERIOD` se décode dans la variante de repli. Le type généré est une struct à valeurs optionnelles (`value1`, `value2`, `value3`), où une valeur connue remplit **aussi** la variante de repli. C'est laid, mais tolérant, et là encore confiné au mapper de `Core/Networking`.

### 6. Dates : aucun transcodeur fourni n'accepte les deux formes

`Date.toISOString()` côté Node émet **toujours** des millisecondes. Le transcodeur par défaut du runtime (`.iso8601`) les refuse ; `.iso8601WithFractionalSeconds` refuse à l'inverse les dates sans millisecondes. Un JSON qui mélange les deux formes (dates venues du provider vidéo ou de RevenueCat, par exemple) échoue avec l'un comme avec l'autre.

**Parade testée** : un transcodeur tolérant d'environ 10 lignes, qui essaie la forme avec millisecondes puis la forme sans. Il décode les deux, et encode toujours avec millisecondes.

```swift
struct TolerantISO8601: DateTranscoder {
    func encode(_ date: Date) throws -> String { try ISO8601DateTranscoder.iso8601WithFractionalSeconds.encode(date) }
    func decode(_ string: String) throws -> Date {
        if let date = try? ISO8601DateTranscoder.iso8601WithFractionalSeconds.decode(string) { return date }
        return try ISO8601DateTranscoder.iso8601.decode(string)
    }
}
```

### 7. OpenAPI 3.0 : document invalide — FAUX

Avec `cleanupOpenApiDoc(doc, { version: "3.0" })`, un `.nullable()` reste en `"type": ["string","null"]`, une syntaxe propre à 3.1. Le générateur refuse le document :

```
error: Expected `type` value in Document.components.schemas.ChannelSummary_Output.properties.title to be parsable as Scalar but it was not.
```

C'est l'issue amont `nestjs-zod` #474, ouverte. **Il faut rester en OpenAPI 3.1**, que le générateur gère.

### 8. Défauts de moindre gravité — MALADROITS

- **Suffixe `_Output` partout** : `ChannelSummary_Output` devient `Components.Schemas.ChannelSummaryOutput`. C'est cosmétique, mais ça se propage à tous les types du client.
- **`format: uuid` devient `Swift.String`.** On obtient un vrai `Foundation.UUID` avec un schéma nommé (`z.uuid().meta({ id: "Uuid" })`), plus `typeOverrides: { schemas: { Uuid_Output: Foundation.UUID } }` et `additionalImports: [Foundation]` dans la configuration du générateur. Testé : un identifiant mal formé est alors rejeté au décodage.
- **Nul et absent confondus côté client** : un champ requis nullable absent se décode en `nil`. C'est acceptable, puisque le serveur garantit la présence du champ par Zod en sortie, mais le client ne détectera pas une régression serveur sur ce point.
- **Union à la racine d'un DTO refusée par TypeScript** : `class X extends createZodDto(z.discriminatedUnion(...))` ne compile pas (`TS2509`). Il faut une enveloppe (`{ entitlement: EntitlementState }`), ce qui est de toute façon plus évolutif.
- **`.meta({ id })` sur le schéma racine d'un DTO** fait planter `cleanupOpenApiDoc` (« Found multiple schemas with name `Problem_Output` »). Seuls les schémas imbriqués peuvent porter un `id`.
- **`application/problem+json`** n'est pas émis par `@ZodResponse` ni par `@ApiResponse({ type })` : il faut un `content` explicite avec `getSchemaPath`. L'union `string | int` du chemin d'erreur (`errors[].path`) devient une struct `value1` / `value2`.
- **Les métadonnées de décorateurs sont indispensables.** Lancé avec `tsx` (esbuild, qui n'émet pas `emitDecoratorMetadata`), le document perd **silencieusement** tous les paramètres de requête (`cursor`, `limit`) et les codes de réponse. Il faut `tsc` (ou SWC avec métadonnées).
- **`nestjs-zod` 5.5.0 déclare des peers NestJS `^10 || ^11`**, alors que NestJS 12 est la version majeure courante. L'installation en 12 exige `--legacy-peer-deps`. Elle fonctionne, et reproduit à l'identique les défauts 2 et 3.
- **Bruit dans les diffs** : `z.uuid()` et `z.iso.datetime()` émettent de longues expressions régulières `pattern` dans chaque propriété. Le générateur les ignore, mais elles alourdissent chaque diff de `openapi.json` relu en PR.

## Résultats de la seconde sonde (avec toutes les parades)

Schémas de réponse en `looseObject`, enums ouverts, `nextCursor` optionnel, normalisation des `anyOf` nullables, `Uuid` nommé avec `typeOverrides`, transcodeur tolérant.

| Cas | Résultat |
|---|---|
| Nominal | OK |
| Champ ajouté côté serveur | OK, conservé dans `additionalProperties` |
| Enum ouvert, valeur inconnue | OK, `value2 == "hibernating"` |
| `lastLiveAt` (date nullable) : valeur, `null`, absent | OK |
| `peakViewers` (entier nullable) | OK |
| `nextCursor` absent (dernière page) | OK |
| Dates avec et sans millisecondes mélangées, transcodeur tolérant | OK |
| UUID mal formé avec `typeOverrides` | Rejeté, à juste titre |
| Variante d'union connue (`ACTIVE`, `PENDING_ATTRIBUTION`) | OK |
| Variante d'union inconnue avec variante de repli | OK |

## Ce que le spike n'a pas vérifié

- **Les messages WebSocket.** L'ADR 0009 place `ClientMessage` / `ServerMessage` dans `packages/contracts`, mais **ne dit pas comment ils atteignent Swift** : ils ne passent par aucun endpoint REST, donc par aucun `openapi.json`. Pour le spike, `ServerMessage` a été exposé via un endpoint factice. Il faut décider du chemin : endpoint de documentation dédié, ou composants ajoutés au document hors chemins. Cela touche aussi le client minimal de l'ADR 0023.
- **Les corps de requête** (sens client → serveur) et l'encodage côté Swift : la sonde n'a testé que le décodage des réponses.
- `oasdiff` sur `openapi.json` (job `contract-check` de l'ADR 0009) : non exécuté. À noter qu'avec `additionalProperties: false`, `oasdiff` considérerait probablement l'ajout d'un champ de réponse comme non cassant, alors qu'il l'est pour le client Swift généré.
- La performance de `z.toJSONSchema` sur un grand corpus, et le temps de build iOS induit par le plugin.

## Recommandation

La chaîne de l'ADR 0009 est conservée, mais elle n'est sûre qu'avec des conventions qui manquent aujourd'hui. À consigner dans un ADR qui amende l'ADR 0009 :

1. **OpenAPI 3.1 uniquement.** Le mode 3.0 produit un document invalide (constat 7).
2. **Schémas de réponse en `z.looseObject`, schémas de requête en `z.object` strict.** Sans cela, la ligne « ajouter un champ optionnel en réponse : oui » de l'ADR 0009 est fausse (constat 1).
3. **Enums transportés en réponse : helper `openEnum` obligatoire** dans `packages/contracts`, et `z.enum` nu interdit par lint dans les schémas de réponse (constat 4).
4. **Unions de réponse susceptibles de grandir : variante de repli obligatoire**, en dernière position (constat 5).
5. **Nullabilité** : pas de `.nullable()` à la racine d'un DTO (lint) ; `.nullish()` interdit ; une étape `normalize-nullable` dans le pipeline, entre la génération et le commit de `openapi.json`, avec ses propres tests (constats 2 et 3).
6. **Dates** : transcodeur ISO 8601 tolérant dans `Core/Networking` (constat 6).
7. **UUID** : schéma nommé `Uuid` dans `contracts`, avec `typeOverrides` et `additionalImports` (constat 8).
8. **Job `contract-check`** : génération avec `tsc` (jamais `tsx` ou esbuild) ; échec si le log du générateur contient `is not supported` ou `skipping`, car un champ supprimé est aujourd'hui un simple avertissement ; et un **test de compatibilité ascendante** qui décode, avec le client généré depuis l'`openapi.json` de `main`, des fixtures du serveur modifié (champ ajouté, valeur d'enum ajoutée, variante ajoutée).
9. **Types générés confinés à `Core/Networking`**, traduits en types de `Domain` par un mapper (déjà la règle 2 de l'ADR 0010). C'est ce qui rend supportables les structs `value1` / `value2` des constats 4 et 5.
10. **`nestjs-zod`** : épingler NestJS 11, ou accepter `--legacy-peer-deps` en 12. Le risque d'abandon cité par l'ADR 0009 se précise : les défauts 2 et 7 sont dans son périmètre.
