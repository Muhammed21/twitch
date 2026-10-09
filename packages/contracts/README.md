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
- un `z.enum` qui ne passe pas par `openEnum` ;
- une union sans variante de repli en dernière position, sauf `.meta({ closed: true })` justifié en revue ;
- un `.nullable()` posé directement sur une propriété du DTO : `.optional()`, ou un schéma nommé imbriqué ;
- un `.nullish()`, où qu'il soit.
- un type qu'il ne sait pas vérifier (transformation, `z.date()`, `z.any()`…) : le garde descend dans les enveloppes (`readonly`, `default`, `catch`, `lazy`, `pipe`, intersection, `record`, `tuple`) et ne laisse passer en silence aucun autre type.

Les schémas de requête restent en `z.object` strict : refuser un champ inconnu est le bon comportement côté serveur.
