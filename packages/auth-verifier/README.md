# @repo/auth-verifier

Vérification des jetons d'accès émis par l'API (ADR 0005, ADR 0026 §5, ADR 0033), partagée par l'API et le process chat.

`createAccessTokenVerifier({ jwksUrl, issuer, audience, revokedSessions, fetchJwks? })` rend `verify(token)`, qui renvoie un `Result` :

- `ok` : `{ userId, sid, scopes, authTime, amr, revocation }`. `authTime` et `amr` viennent de `twitch_auth_time` et `twitch_amr` ; `null` et `[]` quand le jeton ne les porte pas. Aucun rôle n'est lu dans le jeton : l'autorisation se décide côté serveur (ADR 0006).
- `err("invalid_token")` : signature, émetteur, audience, expiration, type `at+jwt`, algorithme `EdDSA` ou claims (`sub`, `sid`) invalides.
- `err("revoked")` : le `sid` est sur la liste de révocation (`RevokedSessions`).

Si la liste de révocation est injoignable, le jeton est accepté avec `revocation: "unavailable"` : un use-case sensible refuse sur cette valeur, le reste continue (ADR 0005, « Panne Redis »).

Le JWKS est gardé en cache 10 minutes ; un `kid` inconnu le recharge, au plus une fois par minute (`jose`). `fetchJwks` remplace `fetch`, par exemple pour lire le JWKS en interne.
