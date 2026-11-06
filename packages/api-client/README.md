# @repo/api-client

Client TypeScript de l'API pour le back-office Payload, sa seule dépendance vers le monorepo (ADR 0007). Les réponses sont lues par les schémas de `@repo/contracts` (ADR 0009).

```ts
const client = createApiClient({
  baseUrl, // origine de l'API, sans /v1
  serviceSecret, // PAYLOAD_SERVICE_SECRET de l'API
  actingUserPrivateKey: await importActingUserPrivateKey(privateJwk), // JWK Ed25519
});

await client.admin.categories.create({ actingUserId, slug, name });
```

Chaque appel porte `Authorization: Service <serviceSecret>` et un `X-Acting-User` signé à l'heure de l'appel pour `actingUserId`, l'identifiant du compte de l'humain dans l'API (`@repo/auth-verifier`).

`admin.categories` : `create`, `merge`, `retire`, `changeImage`, `changeTags`. Chaque méthode rend un `Result` :

- `ok(category)` : la réponse lue par `responses.Category` ;
- `err({ kind: "problem", problem })` : un refus de l'API, lu par `responses.Problem` ;
- `err({ kind: "unreadable_response", status })` : une réponse que les schémas ne lisent pas ;
- `err({ kind: "unreachable" })` : l'API ne répond pas.

`admin-categories.api-client.test.ts`, dans `apps/api`, fait tourner le client contre les vraies routes.
