# @repo/payload

Back-office Payload 3 (Next.js) : l'éditorial et, par l'API, les actions d'administration (ADR 0007). Plan : [`plans/payload.md`](../../plans/payload.md).

- Base `payload`, rôle `payload`, sans aucun droit sur la base `app` (ADR 0028 §3, §4). `apps/payload` n'importe jamais `@repo/db` : `no-restricted-imports` le refuse (ADR 0018).
- Migrations par `payload migrate` uniquement, dans `src/migrations/` : `prodMigrations` est absent et `push` désactivé, même en développement.
- `next build` ne joint aucune base : routes dynamiques, aucune variable `NEXT_PUBLIC_*` (ADR 0028 §7). `PAYLOAD_DATABASE_URL` et `PAYLOAD_SECRET` sont lues à l'exécution et validées par `src/instrumentation.ts` : invalides, le serveur répond 500 à toute requête.
- Les actions d'administration métier passent par `@repo/api-client`, sa seule dépendance vers le monorepo, et n'écrivent rien dans la base `payload` (`guardrails.test.ts`). `POST /api/actions/ban-user` (`src/actions/ban-user.ts`) lit `{ channelId, targetId, durationMinutes, reason }` (`durationMinutes` à `null` : définitif), les transmet tels quels à `POST /v1/admin/channels/{id}/bans` au nom de l'admin connecté, et rend `{ ok: true, ban }` ou `{ ok: false, problem }` avec le statut de l'API ; 401 sans session, 403 pour un admin sans `actingUserId`, 400 pour un corps invalide, 502 pour une API injoignable ou illisible, 503 sans API configurée (`PAYLOAD_API_BASE_URL`, `PAYLOAD_SERVICE_SECRET`, `PAYLOAD_ACTING_USER_PRIVATE_KEY`). Dans le profil `full` de Compose, le service `payload` reçoit `PAYLOAD_API_BASE_URL=http://api:3000` et la paire de clés de `.env`, et `api` la clé publique correspondante ; `docker/tests/infra.test.sh` vérifie depuis le conteneur qu'un appel signé passe le garde de l'API.
- L'écran `/admin/ban-user` (`src/views/`) : chaîne, utilisateur, durée (1 h, 24 h, 7 j, 30 j, définitif), motif, puis une confirmation qui récapitule la demande. Le résultat affiché vient de la réponse : un succès seulement pour un `ban` lisible avec un statut 2xx, sinon un échec.
- Un admin agit au nom du compte API `actingUserId` de son utilisateur Payload, posé à la création de l'utilisateur et non modifiable ensuite.
- La feuille de l'admin, `src/app/(payload)/custom.scss`, lit les variables CSS des design tokens (ADR 0019 §7).

```sh
pnpm --filter @repo/payload migrate                    # applique les migrations sur la base payload
pnpm --filter @repo/payload migrate:create <nom>       # après un changement de collection
pnpm --filter @repo/payload generate:importmap         # après un composant d'admin ajouté
pnpm --filter @repo/payload dev                        # http://127.0.0.1:3200/admin
```

Les scripts lisent le `.env` de la racine. `src/migrations/`, `src/app/(payload)/admin/importMap.js` et `src/payload-types.ts` sont générés par Payload : ni lintés, ni formatés.
