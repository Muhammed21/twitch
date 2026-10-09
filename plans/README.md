# Plans de travail

Un plan découpe une décision des ADR en PR livrables une par une, chacune en TDD et sous le plafond de revue. Il ne décide rien : en cas d'écart, l'ADR fait foi. Un plan est supprimé une fois livré ; la vérité vit alors dans le code, les ADR et les descriptions de PR.

## Les plans

| Plan                              | Composant                             | Tranche |
| --------------------------------- | ------------------------------------- | ------- |
| [Socle de la base](socle-db.md)   | `packages/db`, schémas, outbox        | T1      |
| [API](api.md)                     | `apps/api`, architecture et contextes | T1      |
| [Service vidéo](service-video.md) | `apps/video`                          | T1      |
| [Chat](chat.md)                   | `apps/chat`                           | T1      |
| [App iOS](ios.md)                 | `ios/`                                | T1      |
| [Back-office Payload](payload.md) | `apps/payload`                        | T2      |

## Ordre de la tranche 1

Objectif de la tranche 1 (ADR 0003) : un streamer lance un live depuis OBS, un viewer le regarde dans l'app iOS et chatte. Les flèches sont des dépendances entre PR ; tout ce qui n'est pas relié avance en parallèle.

```
socle-db 1-2 ──▶ api 1 ──▶ api 2-3 ──▶ api 4 ──▶ api 5-7 (identity) ──▶ api 8 (authz)
                   │          │                        │                    │
                   │          ├──▶ chat 1 ──▶ chat 2-3 ◀┘                    ▼
                   │          └──▶ ios 3                              api 9-13 (contextes)
socle-db 3-4 ──────┴─────────────────────────────────────────────────▶ api 9, chat 4-6
video 1-3 ──▶ video 4-5 (après socle-db 1-4) ──▶ api 11 (adapter)
video 6-12 (ingest, ffmpeg, HLS, LL-HLS) ─────▶ ios 6 (player)
ios 1-2 dès maintenant ──▶ ios 4 (après api 7) ──▶ ios 5-10 ──▶ ios 11 (Maestro)
```

Points de départ sans dépendance : socle-db PR 1, video PR 1 à 3, ios PR 1 et 2.

## Jalons de bout en bout

| Jalon | Jalons de plan atteints | Démonstration                                                                                |
| ----- | ----------------------- | -------------------------------------------------------------------------------------------- |
| T1-a  | A2, I1                  | L'app iOS se connecte à l'API                                                                |
| T1-b  | A3, J2, I2              | Un live OBS apparaît dans la liste et se lit dans l'app                                      |
| T1-c  | C2, J3, I3, A4          | Page de chaîne complète : live à moins de 3 s, chat, timeout appliqué en moins d'une seconde |

## Plans à écrire au début de la tranche 2

Ils ne sont pas écrits maintenant : leurs PR dépendent du code de la tranche 1, et un découpage écrit trop tôt serait faux au moment de l'exécuter.

| Plan                    | Contenu                                                                  | ADR                    |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------- |
| Follow et graphe social | Agrégat `Follow`, quatre projections, page « Suivis », cloche            | 0020                   |
| Modération complète     | Bans, mots interdits, signalements, blocages, modes de salon persistants | 0003, 0021, 0027, 0032 |
| Notifications           | Contexte `notification`, APNs, préférences par chaîne, fan-out par lots  | 0003, 0004, 0020       |
| Découverte              | Catégories, tags, miniatures, home curatée                               | 0021, 0007, 0031       |
| Analytics               | Taxonomie typée, `Core/Analytics`, capture serveur                       | 0012                   |

En tranche 3 : **monétisation** (RevenueCat, entitlements, bits, reversement Stripe, ADR 0013 à 0017), emotes et raids (ADR 0021). L'**hébergement** attend son propre ADR (ADR 0028, §11), au premier besoin d'un backend joignable hors de la machine.
