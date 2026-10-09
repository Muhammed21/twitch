# @repo/db

Accès à PostgreSQL par contexte : un client Prisma par contexte, sur le rôle `app_<contexte>` (ADR 0025).

```ts
import { createContextClient } from "@repo/db";

const db = createContextClient({ context: "video" });
```

| Variable                       | Rôle                                             |
| ------------------------------ | ------------------------------------------------ |
| `DATABASE_URL_<CONTEXTE>`      | URL `postgresql://` du rôle du contexte, requise |
| `DATABASE_POOL_MAX_<CONTEXTE>` | Taille du pool, entier positif, 5 par défaut     |

La liste des contextes vit dans `src/contexts.ts` ; la modifier passe en revue `critical`.

Le client est généré dans `src/generated/` par `pnpm generate`, que `check-types` et `test` lancent d'abord. Schéma multi-fichiers dans `prisma/schema/`.
