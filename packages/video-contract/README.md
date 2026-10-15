# @repo/video-contract

Contrat Zod entre `apps/video` et l'adapter `LiveVideoProviderPort` du module `stream` de `apps/api` (ADR 0031 §2). Seule dépendance : Zod.

| Schéma                 | Échange                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| `CreateChannelRequest` | Corps de `POST /channels` : `externalId`, la chaîne côté API       |
| `VideoChannel`         | Réponse de `POST /channels`                                        |
| `StreamKey`            | Réponse de `GET /channels/{id}/stream-key` et de sa rotation       |
| `LiveStreams`          | Réponse de `GET /streams` : les sessions en direct                 |
| `Problem`              | Toute erreur, en RFC 9457                                          |
| `StreamStarted`        | Webhook `stream.started`                                           |
| `StreamEnded`          | Webhook `stream.ended`                                             |
| `VideoEvent`           | Tout webhook : `stream.started`, `stream.ended` ou un type inconnu |

Conventions de l'ADR 0024 :

- requêtes strictes (`z.strictObject`) ; réponses et événements ouverts (`z.looseObject`), pour qu'un champ ajouté par `apps/video` ne casse pas un consommateur déjà déployé ;
- chaque événement porte `id` (UUID, pour l'idempotence), `type` et `occurredAt` (ISO 8601 avec fuseau) ;
- `VideoEvent` se termine par une variante de repli : un type inconnu se décode, s'il porte `id` et `occurredAt`. Un `stream.started` ou `stream.ended` mal formé est refusé, jamais pris pour un type inconnu.
