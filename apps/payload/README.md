# @repo/payload

Back-office Payload 3 (Next.js) : l'éditorial et, par l'API, les actions d'administration (ADR 0007). Plan : [`plans/payload.md`](../../plans/payload.md).

- Base `payload`, rôle `payload`, sans aucun droit sur la base `app` (ADR 0028 §3, §4). `apps/payload` n'importe jamais `@repo/db` : `no-restricted-imports` le refuse (ADR 0018).
- Migrations par `payload migrate` uniquement, dans `src/migrations/` : `prodMigrations` est absent et `push` désactivé, même en développement.
- `next build` ne joint aucune base : routes dynamiques, aucune variable `NEXT_PUBLIC_*` (ADR 0028 §7). `PAYLOAD_DATABASE_URL` et `PAYLOAD_SECRET` sont lues à l'exécution et validées par `src/instrumentation.ts` : invalides, le serveur répond 500 à toute requête.
- La feuille de l'admin, `src/app/(payload)/custom.scss`, lit les variables CSS des design tokens (ADR 0019 §7).

```sh
pnpm --filter @repo/payload migrate                    # applique les migrations sur la base payload
pnpm --filter @repo/payload migrate:create <nom>       # après un changement de collection
pnpm --filter @repo/payload generate:importmap         # après un composant d'admin ajouté
pnpm --filter @repo/payload dev                        # http://127.0.0.1:3200/admin
```

Les scripts lisent le `.env` de la racine. `src/migrations/`, `src/app/(payload)/admin/importMap.js` et `src/payload-types.ts` sont générés par Payload : ni lintés, ni formatés.
