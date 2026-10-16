# Plan — authentification de bout en bout

Décisions de référence : [ADR 0005](../docs/adr/0005-strategie-tokens-et-sessions.md) (PKCE via `ASWebAuthenticationSession`, Keychain, refresh sérialisé, pas de SMS), [ADR 0026](../docs/adr/0026-better-auth-oauth-provider-et-revocation-sur-reutilisation.md) (better-auth, réutilisation, `invalid_grant`), [ADR 0030](../docs/adr/0030-pas-de-client-web-app-ios-seul-client.md) (page de connexion servie par l'API), [ADR 0039](../docs/adr/0039-pages-d-authentification-servies-par-l-api-en-html-sans-javascript.md) (pages HTML sans JavaScript, `username`, inscription par e-mail avec code, `prompt=create`), [ADR 0036](../docs/adr/0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) (fidélité aux captures `docs/reference-ui/auth/`).

Chaque PR suit le TDD, reste sous le plafond de revue et liste ses tests à écrire en premier. Côté iOS, ce plan détaille la PR 4 de [`ios.md`](ios.md) et y ajoute sa PR 3.

## Jalon

Depuis le simulateur, avec l'API locale : « Sign Up » crée un compte (code reçu dans Mailpit), « Log In » connecte un compte existant (avec le code TOTP s'il est actif), l'écran connecté affiche `GET /v1/me`, et « Log Out » révoque la session. C'est le jalon I1 de [`ios.md`](ios.md) et le jalon A2 de [`api.md`](api.md).

## Ordre

```
api A1 (ADR) ──▶ api A2 (seed) ──▶ api A3a-c (identité) ──▶ api A4 (pages) ──▶ api A5 (réinitialisation)
                                                                      │
api A6 (révocation) ──────────────────────────────────────────────────┤
ios I1 (OAuth, Keychain, refresh) ──▶ ios I2 (client généré, /v1/me) ─┴──▶ ios I3 (feature Auth)
```

A6, I1 et I2 n'attendent rien : ils avancent en parallèle de A2 à A5.

## Côté API

### A1 — ADR 0039 et ce plan

Tests d'abord : sans objet (documentation).

### A2 — Seed de dev

`pnpm seed:dev` enregistre le client iOS public `twitch-ios-dev` (PKCE obligatoire, `token_endpoint_auth_method: none`, consentement sauté, redirection `twitch://oauth/callback`, scopes `openid profile email offline_access`), son lien vers la ressource `/v1`, et un compte de test. Idempotent ; refuse de tourner hors du développement.
_Tests d'abord_ : un second lancement ne crée rien ; une autorisation PKCE avec ce client et `resource` émet un token `/v1` ; le seed refuse `NODE_ENV=production`.

### A3a — Nom d'utilisateur

Plugin `username` (`^[A-Za-z0-9_]{4,25}$`, unicité sans casse) ; les mots réservés quittent le domaine `channel` pour `@repo/reserved-names` (`RESERVED_NAMES`, sans dépendance), partagés par `identity` et `channel` (ADR 0039, §2). Le compte du seed porte le nom `viewer_dev`.
_Tests d'abord_ : nom trop court, trop long, à caractère interdit ou réservé (toute casse) refusé sans compte créé ; 4 et 25 caractères acceptés ; doublon à la casse près refusé ; connexion par nom d'utilisateur, quelle que soit la casse, et toujours par e-mail.

### A3b — Date de naissance

Date de naissance stockée, moins de 13 ans refusés.
_Tests d'abord_ : 12 ans et 364 jours refusé, 13 ans pile accepté, date absente ou dans le futur refusée.

### A3c — Code e-mail

Plugin `emailOTP` (code à 6 chiffres) ; envoi SMTP configurable, Mailpit en local.
_Tests d'abord_ : un code est envoyé à Mailpit et l'adresse est vérifiée après sa saisie ; code faux refusé.

### A4 — Pages de connexion et d'inscription

Routes HTML `GET`/`POST` : connexion (`auth/connexion--*`), étape 2FA si le TOTP est actif (`auth/connexion-code-2fa--*`), inscription (`auth/inscription--*`, variante e-mail), code (`auth/inscription-code-telephone--*`, appliqué à l'e-mail), « You're All Set! » (`auth/inscription-terminee--defaut`). `prompt=create` ouvre l'inscription. Chaque `POST` vérifie l'origine et un jeton CSRF ; après connexion ou inscription, l'autorisation OAuth reprend et redirige vers `twitch://oauth/callback`. CSS depuis les tokens.
_Tests d'abord_ : une autorisation sans session affiche la connexion ; identifiants faux ⇒ même message quel que soit le champ ; bonne connexion ⇒ redirection vers le callback avec `code` et `state` ; compte TOTP ⇒ étape code, puis callback ; `prompt=create` ⇒ inscription ; inscription ⇒ code ⇒ « You're All Set! » ⇒ callback ; `POST` sans jeton CSRF refusé.

### A5 — Réinitialisation du mot de passe

« Trouble logging in? » : saisie de l'e-mail, code e-mail, nouveau mot de passe. Même réponse que l'adresse existe ou non.
_Tests d'abord_ : adresse inconnue et adresse connue donnent la même page ; code faux refusé ; après réinitialisation, l'ancien mot de passe est refusé et le nouveau accepté.

### A6 — Révocation pour la déconnexion

_Tests d'abord_ : un refresh token révoqué par `/auth/oauth2/revoke` donne ensuite `invalid_grant` ; la révocation d'un token inconnu répond 200 (RFC 7009).

## Côté iOS

### I1 — OAuth, Keychain et refresh

`Core/Networking` : PKCE S256, URL d'autorisation (`resource`, `state`, `prompt=create`), validation du callback, échange de code, refresh, révocation. Tokens dans le Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). Acteur de session : un seul refresh pour N appels concurrents, `invalid_grant` ⇒ déconnecté, déconnexion ⇒ révocation puis Keychain vidé même en cas d'échec. `API_BASE_URL` dans l'`Info.plist` (`http://127.0.0.1:3000` en Debug, `NSAllowsLocalNetworking`), schéma `twitch`.
_Tests d'abord_ : vecteur de la RFC 7636 ; l'URL porte `code_challenge_method=S256` et `resource` ; `state` différent refusé ; dix 401 simultanés ⇒ un seul refresh ; attribut Keychain vérifié ; `invalid_grant` ⇒ état déconnecté.

### I2 — Client généré et `/v1/me` (PR 3 de `ios.md`)

`swift-openapi-generator` sur `apps/api/openapi.json`, mapper de `Me` vers `Domain`, en-tête `Authorization` fourni par l'acteur de session.
_Tests d'abord_ : décodage d'une réponse `Me` réelle ; champ ajouté toléré ; 401 ⇒ un refresh puis une seconde tentative.

### I3 — Feature Auth

`SessionStore` (`@Observable`) ; `ASWebAuthenticationSession` éphémère branchée sur `WelcomeIntent.logIn` et `.signUp` ; écran connecté provisoire qui affiche `GET /v1/me` et « Log Out », avec la modale `parametres/menu-parametres--modale-deconnexion` ; retour à l'accueil après déconnexion ou `invalid_grant`. Remplacé par l'accueil connecté (PR 5 de `ios.md`).
_Tests d'abord_ : Log In ouvre l'autorisation sans `prompt`, Sign Up avec `prompt=create` ; annulation de la feuille ⇒ reste sur l'accueil ; callback valide ⇒ connecté ; Log Out confirmé ⇒ révocation puis accueil.
_Vérification au jalon_ : parcours complet sur simulateur contre l'API locale, captures comparées aux références.

## Hors de ce plan

Passkeys (avec l'hébergement), activation de la 2FA et écrans Paramètres, appareils connectés, `GET /v1/mobile/bootstrap` (PR 12 de [`api.md`](api.md)), client OAuth de production.
