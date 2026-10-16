# Plan — authentification de bout en bout

Décisions de référence : [ADR 0005](../docs/adr/0005-strategie-tokens-et-sessions.md) (PKCE via `ASWebAuthenticationSession`, Keychain, refresh sérialisé, pas de SMS), [ADR 0026](../docs/adr/0026-better-auth-oauth-provider-et-revocation-sur-reutilisation.md) (better-auth, réutilisation, `invalid_grant`), [ADR 0030](../docs/adr/0030-pas-de-client-web-app-ios-seul-client.md) (page de connexion servie par l'API), [ADR 0039](../docs/adr/0039-pages-d-authentification-servies-par-l-api-en-html-sans-javascript.md) (pages HTML sans JavaScript, `username`, inscription par e-mail avec code, `prompt=create`), [ADR 0036](../docs/adr/0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) (fidélité aux captures `docs/reference-ui/auth/`).

Chaque PR suit le TDD, reste sous le plafond de revue et liste ses tests à écrire en premier. Côté iOS, ce plan détaille la PR 4 de [`ios.md`](ios.md) et y ajoute sa PR 3.

## Jalon

Depuis le simulateur, avec l'API locale : « Sign Up » crée un compte (code reçu dans Mailpit), « Log In » connecte un compte existant (avec le code TOTP s'il est actif), l'écran connecté affiche `GET /v1/me`, et « Log Out » révoque la session. C'est le jalon I1 de [`ios.md`](ios.md) et le jalon A2 de [`api.md`](api.md).

## Ordre

```
api A1 (ADR) ──▶ api A2 (seed) ──▶ api A3a-c (identité) ──▶ api A4a-c (pages) ──▶ api A5 (réinitialisation)
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

`birthDate` (`AAAA-MM-JJ`, colonne `date`) exigée à l'inscription par un garde sur `/auth/sign-up/email` ; moins de 13 ans refusés (le 29 février fête ses 13 ans le 1er mars), codes `BIRTH_DATE_MISSING`, `_MALFORMED`, `_FUTURE`, `_TOO_YOUNG` en 400. Elle ne se modifie plus ensuite : `/auth/update-user` la refuse (`BIRTH_DATE_IMMUTABLE`).
_Tests d'abord_ : 12 ans et 364 jours refusé, 13 ans pile accepté, date absente, mal formée ou dans le futur refusée, sans compte créé ; la réponse d'inscription ne renvoie jamais le mot de passe.

### A3c — Code e-mail

Plugin `emailOTP` : code à 6 chiffres valable 5 minutes, envoyé à l'inscription, stocké haché ; la connexion par code e-mail (`/sign-in/email-otp`) est fermée, elle contournerait le mot de passe et la 2FA ; la réinitialisation par code (`/email-otp/request-password-reset`, `/forget-password/email-otp`, `/email-otp/reset-password`) est fermée jusqu'à A5. Envoi SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`), Mailpit en local.
_Tests d'abord_ : un code est envoyé à Mailpit et l'adresse est vérifiée après sa saisie ; code faux refusé ; code jamais stocké en clair ; `/sign-in/email-otp` et les routes de réinitialisation répondent 404.

### A4a — Socle des pages et connexion

`GET`/`POST /login` (capture `auth/connexion--rempli`) : formulaire HTML sans JavaScript, rendu par un gabarit qui échappe chaque valeur, feuille `/login/styles.css` = sortie CSS des tokens (`packages/design-tokens/platforms/css/tokens.css`, polices système de Safari pour les styles de texte iOS) + règles des pages. Connexion par nom d'utilisateur ou e-mail ; la requête OAuth signée par better-auth (`oauth_query`) est relayée au gestionnaire HTTP de better-auth, qui reprend l'autorisation jusqu'au callback. Chaque `POST` vérifie l'`Origin` (= `BETTER_AUTH_URL`) et un jeton CSRF en double soumission (cookie `twitch_csrf` `HttpOnly`, `SameSite=Strict`). Même message quel que soit le champ faux ; requête OAuth modifiée refusée.
_Tests d'abord_ : une autorisation sans session affiche la connexion, avec la requête signée et un jeton CSRF ; connexion par nom ou e-mail ⇒ callback avec `code` et `state`, échangeable contre un token `/v1` ; mauvais mot de passe et compte inconnu ⇒ même réponse ; identifiant échappé ; formulaire sans CSRF, à CSRF différent, sans cookie, à CSRF vide ou d'une autre origine ⇒ 403 ; requête OAuth modifiée ⇒ 400 ; feuille de style servie.

### A4b — Étape 2FA

Compte TOTP : le `POST /login` répond par la page « Welcome back » (`auth/connexion-code-2fa--rempli`) en relayant le cookie 2FA de better-auth ; `POST /login/two-factor` vérifie le code (`/two-factor/verify-totp`, avec `oauth_query`) et reprend l'autorisation. Mêmes contrôles d'`Origin` et de CSRF. Tokens `titleText` (title2 gras) et `supportingText` (body) relevés sur la capture. « Resend code » (SMS) n'a pas lieu d'être avec le TOTP ; « Need help? » (codes de secours) arrive avec les écrans de sécurité.
_Tests d'abord_ : compte TOTP ⇒ étape code sans session ouverte ; bon code ⇒ callback et token `/v1` à `twitch_amr` `pwd otp mfa` ; code faux ⇒ 401 sur la même étape ; sans cookie 2FA ⇒ 400 ; sans CSRF ou d'une autre origine ⇒ 403.

### A4c — Inscription

`prompt=create` ouvre l'inscription (`auth/inscription--*`, variante e-mail), puis le code (`auth/inscription-code-telephone--*`, appliqué à l'e-mail) et « You're All Set! » (`auth/inscription-terminee--defaut`) ; l'autorisation reprend par `/oauth2/continue`, après la vérification de l'adresse.
_Tests d'abord_ : `prompt=create` ⇒ inscription ; inscription ⇒ code ⇒ « You're All Set! » ⇒ callback ; aucune session OAuth avant le code.

### A5 — Réinitialisation du mot de passe

« Trouble logging in? » : saisie de l'e-mail, code e-mail, nouveau mot de passe. Même réponse que l'adresse existe ou non.
Rouvre les routes de réinitialisation du plugin `emailOTP`, fermées en A3c, et révoque toutes les sessions et refresh tokens du compte après une réinitialisation.
_Tests d'abord_ : adresse inconnue et adresse connue donnent la même page ; code faux refusé ; après réinitialisation, l'ancien mot de passe est refusé et le nouveau accepté.

### A6 — Révocation pour la déconnexion

_Tests d'abord_ : un refresh token révoqué par `/auth/oauth2/revoke` donne ensuite `invalid_grant` ; la révocation d'un token inconnu répond 200 (RFC 7009).

## Côté iOS

### I1 — OAuth, Keychain et refresh

`Core/Networking` : PKCE S256, URL d'autorisation (`resource`, `state`, `prompt=create`), validation du callback, échange de code, refresh, révocation. Tokens dans le Keychain (`kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`). Acteur de session : un seul refresh pour N appels concurrents, `invalid_grant` ⇒ déconnecté, déconnexion ⇒ révocation puis Keychain vidé même en cas d'échec. `API_BASE_URL` dans l'`Info.plist` (`http://127.0.0.1:3000` en Debug, `NSAllowsLocalNetworking`), schéma `twitch`.
_Tests d'abord_ : vecteur de la RFC 7636 ; l'URL porte `code_challenge_method=S256` et `resource` ; `state` différent refusé ; dix 401 simultanés ⇒ un seul refresh ; attribut Keychain vérifié ; `invalid_grant` ⇒ état déconnecté.

### I2 — Client généré et `/v1/me` (PR 3 de `ios.md`)

`swift-openapi-generator` en build plugin sur une copie d'`apps/api/openapi.json` synchronisée par `pnpm generate` ; `Account` et `AccountRepository` dans `Domain` ; `AccountClient` sur le client généré, avec un middleware qui pose `Authorization: Bearer` depuis l'acteur de session et réessaie une fois après un `401` ; transport `URLSessionHTTPTransport`.
_Tests d'abord_ : décodage d'une réponse `Me` réelle ; champ ajouté toléré ; 401 ⇒ un rejet signalé à l'acteur de session (qui rafraîchit) puis une seconde tentative ; deux 401 ⇒ erreur de session.

### I3 — Feature Auth

`SessionStore` (`@Observable`) ; `ASWebAuthenticationSession` éphémère branchée sur `WelcomeIntent.logIn` et `.signUp` ; écran connecté provisoire qui affiche `GET /v1/me` et « Log Out », avec la modale `parametres/menu-parametres--modale-deconnexion` ; retour à l'accueil après déconnexion ou `invalid_grant`. Remplacé par l'accueil connecté (PR 5 de `ios.md`).
_Tests d'abord_ : Log In ouvre l'autorisation sans `prompt`, Sign Up avec `prompt=create` ; annulation de la feuille ⇒ reste sur l'accueil ; callback valide ⇒ connecté ; Log Out confirmé ⇒ révocation puis accueil.
_Vérification au jalon_ : parcours complet sur simulateur contre l'API locale, captures comparées aux références.

## Hors de ce plan

Passkeys (avec l'hébergement), activation de la 2FA et écrans Paramètres, appareils connectés, `GET /v1/mobile/bootstrap` (PR 12 de [`api.md`](api.md)), client OAuth de production.
