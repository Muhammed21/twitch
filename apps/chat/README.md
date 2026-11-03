# @repo/chat

Service de chat temps réel, process Node séparé (ADR 0004, ADR 0022). Découpage : [plan du chat](../../plans/chat.md).

| Commande             | Effet                     |
| -------------------- | ------------------------- |
| `pnpm test`          | Tests unitaires           |
| `pnpm test:coverage` | Tests et couverture 100 % |
| `pnpm mutation`      | Stryker sur `src/`        |

## Domaine

`decide({ chatter, room, message, bucket, now })` décide d'un message, sans I/O :

- chatter sanctionné sur le salon → refus `timed_out`, ou `banned` pour un ban sans échéance ;
- rate limit global, propriétaire compris : seau de 5 jetons, un jeton rendu par seconde (ADR 0004, §6). L'état du seau est une entrée ; sa lecture et son écriture dans Redis arrivent avec les handlers ;
- sinon le message est accepté, horodaté à `now`, rattaché à la session du live en cours s'il y en a une (ADR 0032), et le seau débité est rendu.

Le `ChatterContext` vient de `@repo/authorization`, partagé avec l'API.
