# @repo/contracts

Schémas Zod du contrat de l'API, source de vérité du client Swift (ADR 0009). Conventions de compatibilité : ADR 0024.

| Brique                                 | Usage                                                                                               |
| -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `openEnum([...])`                      | Tout enum transporté en réponse : valeurs connues, plus une chaîne libre                            |
| `Uuid`                                 | Identifiant, schéma nommé, décodé en `Foundation.UUID`                                              |
| `extensibleUnion(discriminant, [...])` | Union de réponse, terminée par la variante de repli `z.looseObject({ <discriminant>: z.string() })` |
| `responses.Problem`                    | Erreur RFC 9457 renvoyée par l'API                                                                  |

## Conventions des réponses

Un schéma de réponse s'exporte depuis `src/responses/`, nommé par `.meta({ id })`. `checkResponseSchema` le parcourt en entier, schémas imbriqués compris, et un test l'applique à chaque réponse exportée. Il refuse :

- un objet écrit `z.object` ou `z.strictObject` : une réponse s'écrit `z.looseObject` ;
- un `z.enum` qui ne passe pas par `openEnum`, y compris en clé de `z.record` ;
- une union sans variante de repli en dernière position, sauf `.meta({ closed: true })` justifié en revue ;
- un `.nullable()` posé directement sur une propriété du DTO : `.optional()`, ou un schéma nommé imbriqué ;
- un `.nullish()`, où qu'il soit.
- un type qu'il ne sait pas vérifier (transformation, `z.date()`, `z.any()`…) : le garde descend dans les enveloppes (`readonly`, `default`, `catch`, `lazy`, `pipe`, intersection, `record`, `tuple`), parcourt une seule fois un schéma récursif (`z.lazy` ou getter), et ne laisse passer en silence aucun autre type.

Les schémas de requête restent en `z.object` strict : refuser un champ inconnu est le bon comportement côté serveur.

## Messages temps réel du chat

`realtime` porte les charges utiles socket.io, nommées `Realtime*` et publiées dans `components.schemas` d'`openapi.json` (ADR 0022, ADR 0024 §7). Le nom de l'événement socket.io est le discriminant.

| Sens             | Événement                                       | Charge utile              |
| ---------------- | ----------------------------------------------- | ------------------------- |
| Client → serveur | `chat:send`                                     | `RealtimeChatSend`        |
| Client → serveur | `room:join`                                     | `RealtimeRoomJoin`        |
| Client → serveur | `room:leave`                                    | `RealtimeRoomLeave`       |
| Serveur → client | `chat:message`                                  | `RealtimeChatMessage`     |
| Serveur → client | `chat:rejected`, valeur de l'ack de `chat:send` | `RealtimeChatRejected`    |
| Serveur → client | `chat:user_cleared`                             | `RealtimeChatUserCleared` |
| Serveur → client | `session:revoked`                               | `RealtimeSessionRevoked`  |

- Les charges client sont strictes (`z.strictObject`) ; `clientEventSchema(event)` ne donne aucun schéma à un événement inconnu, et `apps/chat` le rejette et le compte (ADR 0022, §6). Le corps d'un message fait de 1 à 500 caractères.
- Les charges serveur suivent les conventions des réponses. `RealtimeServerMessage` enveloppe `{ event, data }` et se termine par la variante de repli `{ event: string }`.

## Taxonomie analytics

`analytics.AnalyticsEvents` est la source unique des événements PostHog (ADR 0012), avec le funnel d'onboarding de l'ADR 0051 §7 : nom `objet:action_au_passé` en snake_case, source déclarée (`client` ou `server`), propriétés en `z.strictObject`. `findTaxonomyViolations` refuse, et un test l'applique à la taxonomie :

- un nom hors de `objet:action_au_passé`, une propriété ou une valeur d'énumération hors du snake_case ;
- une clé PII (`email`, `phone`, `name`, `address`, `ip`, `token`, `password`), seule ou comme mot d'une clé (`user_email`) ;
- un booléen sans préfixe `is_` ou `has_`, une propriété facultative, des propriétés ouvertes ;
- un type autre que chaîne, entier, booléen ou énumération ;
- une propriété ou une valeur d'énumération qui est un mot réservé de Swift (`default`, `in`…) ;
- deux événements qui donnent le même identifiant Swift (`a:b_c` et `a_b:c`) ;
- une propriété énumérée dont les valeurs changent d'un événement à l'autre.

`pnpm generate` (tâche `generate` de `@repo/ios`, qui appelle `generate:swift`) écrit les événements client en Swift dans `apps/ios/Packages/Domain/Sources/AnalyticsEvent+Generated.swift` :

- `AnalyticsEventName` ;
- une énumération par propriété énumérée, nommée d'après la clé et partagée entre les événements (`step` → `AnalyticsStep`) ;
- `AnalyticsEvent`, dont les cas sans propriété sont des constantes (`.accountSignedIn`) et les autres des fabriques typées (`.onboardingStepSkipped(step:stepIndex:)`).

Le job « Generated artefacts » échoue si le fichier commité diverge.
