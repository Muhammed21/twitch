# Spike — better-auth face à l'ADR 0005

- Date : 2026-09-24
- Origine : incertitude déclarée de l'ADR 0005 (« la maturité de better-auth sur les passkeys et la rotation de familles »)
- Durée : une session
- Code du spike : jetable, non versionné. Les extraits utiles sont reproduits ici.

## Question

Avec la version actuelle de better-auth, qu'est-ce qui est fourni tel quel, qu'est-ce qui se configure, et qu'est-ce qu'il faudra écrire nous-mêmes pour tenir chaque exigence de l'ADR 0005 ? Existe-t-il une exigence impossible à tenir sans contourner better-auth ?

## Réponse courte

**better-auth tient le cœur de l'ADR 0005, à condition d'utiliser le plugin `@better-auth/oauth-provider` et pas les sessions natives de better-auth.** JWT EdDSA vérifié via JWKS, rotation des clés avec chevauchement, client iOS public avec PKCE, refresh tokens hachés et rotatifs avec détection de réutilisation atomique, TOTP, passkeys : tout est là et a été testé sur un serveur réel.

Cinq écarts, dont aucun n'est bloquant :

1. **La réutilisation révoque tous les appareils** de l'utilisateur pour ce client, pas seulement la famille concernée. C'est plus strict que l'ADR, et ce n'est pas réglable.
2. **La réutilisation n'est pas observable** : même erreur qu'un token expiré, et aucun callback. Pour alimenter la liste de révocation Redis, l'audit et la notification, il faut l'écrire nous-mêmes.
3. **Pas de plafond absolu** de 180 jours : l'expiration glisse indéfiniment. À écrire.
4. **Pas de claim `amr`** dans le token d'accès. À écrire.
5. **Une passkey native** (`ASAuthorizationPlatformPublicKeyCredentialProvider`) ouvre une session better-auth, pas un couple de tokens OAuth. Elle ne se compose pas avec le flux PKCE de l'ADR.

Deux valeurs par défaut sont en dessous de l'ADR et doivent être configurées : l'entropie du refresh token (environ 182 bits au lieu de 256), et les codes de récupération, **stockés en clair** par défaut.

## Montage

- `better-auth` 1.7.5 (publié le 2026-09-14), `@better-auth/oauth-provider` 1.7.5, `@better-auth/passkey` 1.7.5, `jose`, `better-sqlite3` en mémoire, Node 22.
- Plugins : `jwt` (EdDSA / Ed25519, rotation courte pour le test), `oauthProvider` (access 900 s, refresh 60 jours, une ressource `https://api.example.test`), `twoFactor`, `passkey`.
- Serveur HTTP réel (`toNodeHandler`). Scénario : inscription par email ; création d'un client OAuth public natif (schéma d'URL personnalisé, sans secret) ; deux connexions PKCE S256 (« appareil A » et « appareil B ») ; vérification du JWT avec `jose.createRemoteJWKSet` ; refresh ; réutilisation du refresh consommé ; rotation des clés ; activation TOTP ; options d'enregistrement passkey.

## Tableau exigence par exigence

Légende : **fourni** = marche avec la configuration par défaut ; **configurable** = une option suffit ; **à écrire** = code à nous ; **impossible sans contourner** = il faudrait réécrire ou patcher un comportement interne.

| Exigence de l'ADR 0005 | Verdict | Constat (T = testé sur le serveur, L = lu dans le code) |
|---|---|---|
| better-auth dans NestJS sous `/auth/*` | configurable | Handler Node standard (`toNodeHandler`). Intégration NestJS non testée. L |
| Access token JWT signé EdDSA (Ed25519) | fourni | `alg: EdDSA` par défaut, en-tête `typ: at+jwt`. T |
| Durée de vie de 15 min | configurable | `accessTokenExpiresIn: 900` ; défaut 3600 s. T |
| Vérification locale via JWKS, sans I/O | fourni | Vérifié avec `jose.createRemoteJWKSet`. T |
| Claims `sub`, `sid`, `jti`, `iat`, `exp`, `aud`, `iss` | fourni, **sous condition** | Présents. Mais **le token n'est un JWT que si la requête porte le paramètre `resource`** ; sans lui, le token est opaque et exige une introspection. T + L |
| Claim `amr` | à écrire | Absent. Ajout via `customAccessTokenClaims`, mais la méthode utilisée à la connexion doit être tracée par nous. L |
| Aucun rôle ni permission dans le JWT | fourni | Le token OAuth ne porte que les claims ci-dessus. Attention : le endpoint `/token` du plugin `jwt` renvoie **l'objet utilisateur entier** par défaut ; il doit être désactivé (`disabledPaths`). T |
| Refresh token opaque, haché en SHA-256 | fourni | `storeTokens: "hashed"` (SHA-256, base64url) par défaut. L |
| Entropie de 256 bits | configurable | Par défaut 32 caractères `[A-Za-z]`, soit environ 182 bits. Surcharge par `generateRefreshToken`. L |
| Durée glissante de 60 jours | configurable | `refreshTokenExpiresIn` ; chaque rotation repart de maintenant. L |
| Plafond absolu de 180 jours | à écrire | Aucun plafond. Le `authTime` d'origine est conservé sur chaque refresh token ; un hook `before` sur `/oauth2/token` peut refuser au-delà. L |
| Rotation systématique | fourni | Nouveau refresh à chaque usage. T |
| Rotation atomique (pas de `SELECT` puis `UPDATE`) | fourni | Mise à jour conditionnelle `revoked IS NULL` ; sinon `invalid_grant`. C'est exactement la règle des notes d'implémentation. L |
| Réutilisation : révocation de la famille | fourni, **plus large** | Le descendant légitime est révoqué (T). Mais la « famille » est `(client, utilisateur)` : **l'appareil B, connecté séparément, est révoqué aussi** (T). Les lignes sont supprimées, pas marquées. Restreindre à la connexion d'origine : impossible sans contourner (`invalidateRefreshFamily` est interne). |
| Réutilisation : `sid` en liste de révocation Redis, notification du chat, audit, message à l'utilisateur | à écrire | Aucun callback, et même erreur qu'un token expiré (`invalid_grant`, « invalid refresh token »). Détection possible dans un hook `before` qui cherche le token par son hash et regarde `revoked`. En fournissant notre propre fonction de hachage (`storeTokens: { hash }`), on ne dépend d'aucun format interne. L |
| Réutilisation : la session web est coupée | à écrire | Après réutilisation, la session better-auth de même `sid` reste active (`/get-session` → 200). T |
| Access tokens déjà émis coupés avant expiration | à écrire | Le JWT émis avant la réutilisation reste vérifiable localement : c'est attendu, et c'est le rôle de la liste Redis de l'ADR. T |
| Faux positifs en mobilité dégradée | configurable (bonus) | `refreshTokenReuseInterval` : fenêtre pendant laquelle rejouer le même refresh renvoie **la même réponse** au lieu de révoquer. Défaut 0. L |
| OAuth 2.1 / PKCE S256, client public, iOS | fourni | `application_type: "native"`, `token_endpoint_auth_method: "none"`, redirection `com.example.app:/…`, sans secret. T |
| Keychain, refresh sérialisé par un acteur Swift | hors better-auth | Côté iOS. |
| Passkeys | configurable (web) / à écrire (natif) | Package séparé `@better-auth/passkey` 1.7.5, publié en même temps que le cœur, sur SimpleWebAuthn 13. Options d'enregistrement obtenues (algorithmes EdDSA, ES256, RS256) (T). Cérémonie complète non testée (il faut un authentificateur). **Une passkey native ouvre une session better-auth, pas des tokens OAuth** (L). Soit la passkey est utilisée dans la page de connexion web ouverte par `ASWebAuthenticationSession`, soit un échange de session contre des tokens est à écrire. |
| TOTP | fourni | Activation → `totpURI` et 10 codes de récupération. T |
| Codes de récupération à usage unique | configurable | **Stockés en clair par défaut** ; `storeBackupCodes: "encrypted"` à imposer. Le hachage n'est pas possible : la vérification déchiffre pour comparer. L |
| Pas de SMS | fourni | Le plugin OTP par SMS n'est pas activé. L |
| 2FA obligatoire pour les comptes streamer ou monétisés | à écrire | Règle métier du contexte `identity`. |
| Réauthentification récente (`auth_time` < 5 min) | à écrire | `auth_time` est dans l'id token et conservé sur le refresh, pas dans le token d'accès. Ajout via `customAccessTokenClaims`, puis contrôle dans les use-cases. L |
| Session durable avec appareil, IP, activité | configurable | La session better-auth porte IP et user-agent. Le modèle d'appareil et le pays sont à ajouter (`additionalFields`). L |
| JWKS sur `/.well-known/jwks.json` | configurable | `jwksPath`, **relatif au préfixe de better-auth** (`/auth/...`) ; un chemin racine suppose une route de proxy. L |
| `kid` dans chaque JWT | fourni | T |
| Rotation tous les 90 jours, chevauchement de 24 h | configurable | `rotationInterval` et `gracePeriod` (**défaut 30 jours**). Nouvelle clé publiée, ancienne encore vérifiable pendant la grâce, puis retirée. T. La rotation est **paresseuse** : la nouvelle clé est créée par la première signature après expiration ; plusieurs instances peuvent en créer deux au même moment, ce qui est sans gravité (les deux sont publiées). L |
| Consommateurs : cache de 10 min et rechargement sur `kid` inconnu, anti-martèlement | fourni (`jose`) | `createRemoteJWKSet` : cache de 10 min et rechargement sur `kid` inconnu par défaut, délai minimal de 30 s entre deux rechargements (l'ADR dit 1 min : configurable). L |
| Rotation d'urgence sans chevauchement | à écrire | `gracePeriod` est global : on ne peut pas retirer une seule clé par configuration. Procédure : supprimer la ligne dans la table `jwks`. |
| Clé privée hors du dépôt, dans le gestionnaire de secrets | configurable, **modèle différent** | La clé privée est **stockée en base** (table `jwks`), chiffrée avec le secret better-auth. Le secret est dans le gestionnaire de secrets, pas la clé. Alternative : signature externe (KMS) via `jwt.sign` + `jwks.remoteUrl`, à écrire. L |
| Tables dans le schéma `identity` | configurable | 14 tables créées (`user`, `session`, `jwks`, `oauthRefreshToken`, `twoFactor`, `passkey`…). Adapter Prisma et `multiSchema` non testés. T |

## Ce que le spike n'a pas vérifié

- La cérémonie passkey complète, et le parcours dans `ASWebAuthenticationSession` sur un iPhone réel.
- L'adapter Prisma avec `multiSchema` (ADR 0008) et un vrai PostgreSQL.
- L'intégration NestJS.
- Les métadonnées OIDC (`/.well-known/openid-configuration`), servies à la racine de l'émetteur et non sous le préfixe de better-auth : non joignables dans ce montage.
- La charge.

## Recommandation

1. **Garder better-auth**, avec `@better-auth/oauth-provider` comme serveur d'autorisation pour l'app iOS, et **figer les trois packages sur la même version**. Ils sont publiés ensemble, et souvent.
2. **Configuration obligatoire**, à tester : `accessTokenExpiresIn: 900`, `generateRefreshToken` à 256 bits, `storeBackupCodes: "encrypted"`, `gracePeriod: 86400`, `rotationInterval: 7776000`, endpoint `/token` du plugin `jwt` désactivé, paramètre `resource` toujours envoyé par le client iOS.
3. **À écrire, derrière `AuthenticationPort`** (ADR 0005) : hook de détection de réutilisation (liste Redis, Pub/Sub, audit, notification, révocation de la session web) avec notre propre fonction de hachage ; plafond absolu de 180 jours ; claims `amr` et `auth_time` ; politique de 2FA obligatoire ; procédure de rotation d'urgence.
4. **Décider** si la révocation de tous les appareils sur réutilisation est acceptable (voir amendements), et si les passkeys passent par la page web.

## Amendements d'ADR proposés

- **0005 — périmètre de la révocation sur réutilisation** : accepter que la famille soit `(client, utilisateur)` (tous les appareils sont déconnectés), plus strict que l'ADR, avec `refreshTokenReuseInterval` d'environ 30 s pour contenir les faux positifs mobiles, dont l'impact devient plus large.
- **0005 — passkeys** : sur iOS, passkey dans la page de connexion ouverte par `ASWebAuthenticationSession` (Associated Domains `webcredentials:`), et non via `ASAuthorizationPlatformPublicKeyCredentialProvider` en natif, sauf à écrire un échange de session contre des tokens.
- **0005 — stockage de la clé de signature** : clé en base, chiffrée par un secret venant du gestionnaire de secrets ; ou signature externe par KMS si l'on veut que la clé ne soit jamais en base.
- **0005 — chemin du JWKS** : sous le préfixe `/auth`, ou exposé à la racine par une route de proxy.
- **0005 — notes d'implémentation** : le token d'accès n'est un JWT que si le paramètre `resource` est présent ; liste des options de configuration obligatoires ; tests de caractérisation à écrire en premier sur la rotation, la réutilisation (y compris la révocation de l'appareil B) et le rejeu dans la fenêtre de `refreshTokenReuseInterval`.
