# 0026 — better-auth en serveur OAuth, et révocation de tous les appareils sur réutilisation

- Statut : Accepté
- Date : 2026-09-24
- Décideurs : Muhammed Cavus
- Amende : ADR 0005 (détection de réutilisation, passkeys, stockage de la clé de signature, chemin du JWKS, notes d'implémentation)
- Source : [spike du 2026-09-24 sur better-auth](../spikes/2026-09-24-better-auth.md)

## Contexte et problématique

L'ADR 0005 retient better-auth, hébergé dans l'API, pour émettre des access tokens JWT courts et des refresh tokens opaques et rotatifs, avec une détection de réutilisation par famille. Il déclarait une incertitude : « la maturité de better-auth sur les passkeys et la rotation de familles ».

Le spike a testé better-auth 1.7.5 sur un vrai serveur, avec un client iOS simulé qui se connecte en PKCE. Constats :

- **Le cœur de l'ADR 0005 est fourni, mais seulement par le plugin `@better-auth/oauth-provider`.** Les sessions natives de better-auth ne produisent ni JWT d'accès ni refresh token pour un client natif. Avec le plugin : JWT EdDSA vérifiable via JWKS avec `jose`, rotation des clés avec chevauchement, client public PKCE S256, refresh token haché et rotatif, rotation atomique, TOTP.
- **La famille révoquée sur réutilisation est plus large que celle de l'ADR 0005.** better-auth révoque tous les refresh tokens du couple (client, utilisateur) : **tous les appareils** de l'utilisateur sont déconnectés, pas seulement la session concernée. C'est interne (`invalidateRefreshFamily`), et non réglable.
- **La réutilisation n'est pas observable** : même erreur qu'un token expiré, et aucun callback. Les étapes 2 à 4 de la détection de l'ADR 0005 (liste de révocation Redis, notification du chat, audit, message à l'utilisateur) n'ont aucun point d'accroche. La session web de même `sid` survit, elle aussi.
- **Manquent** : le plafond absolu de 180 jours, les claims `amr` et `auth_time` dans le token d'accès, la 2FA obligatoire pour les comptes streamer, la procédure de rotation d'urgence.
- **Une passkey native** (`ASAuthorizationPlatformPublicKeyCredentialProvider`) ouvre une session better-auth, pas un couple de tokens OAuth : elle ne se compose pas avec le flux PKCE de l'ADR 0005.
- **Deux valeurs par défaut sont en dessous de l'ADR** : refresh token à environ 182 bits au lieu de 256, et codes de récupération stockés en clair.
- **La clé privée de signature est stockée en base** (table `jwks`), chiffrée par le secret de better-auth. L'ADR 0005 la voulait dans le gestionnaire de secrets.
- **Le chemin du JWKS est relatif au préfixe de better-auth** (`/auth/...`), pas `/.well-known/jwks.json` à la racine.

## Facteurs de décision

- **Ne pas contourner better-auth sur la cryptographie et la rotation** : c'est la raison même de l'ADR 0005 (« toute brique d'authentification auto-construite est une dette de sécurité permanente »).
- **Garder toutes les garanties de sécurité de l'ADR 0005**, quitte à les obtenir autrement.
- **Écrire le moins possible, et derrière `AuthenticationPort`** (ADR 0005).

## Options envisagées

### Périmètre de la révocation sur réutilisation

**Option A — Accepter la révocation de tous les appareils.** Plus strict que l'ADR 0005, donc plus sûr : un vol de refresh token sur un appareil coupe aussi les autres. Coût : l'utilisateur doit se reconnecter partout, et un faux positif mobile a le même effet. **Retenu, sur décision du 2026-09-24.**

**Option B — Restreindre à la famille de connexion.** Impossible sans réécrire ou patcher la logique interne de better-auth. Écarté.

### Passkeys sur iOS

**Option C — Passkey native, puis échange de la session better-auth contre des tokens OAuth.** Expérience plus fluide, mais un échange de jetons à écrire nous-mêmes, sur le chemin le plus sensible. Écarté.

**Option D — Passkey dans la page de connexion web**, ouverte par `ASWebAuthenticationSession`, avec Associated Domains (`webcredentials:`). Le flux PKCE reste le seul chemin d'émission des tokens. **Retenu.**

## Décision

### 1. better-auth avec `@better-auth/oauth-provider`

- Le serveur d'autorisation de l'app iOS est le plugin `@better-auth/oauth-provider`. Le client iOS est enregistré comme client public natif (`token_endpoint_auth_method: "none"`, redirection par schéma d'URL), sans secret.
- `better-auth`, `@better-auth/oauth-provider` et `@better-auth/passkey` sont épinglés sur la **même version exacte** : ils sont publiés ensemble, et souvent.
- **Le client iOS envoie toujours le paramètre `resource`.** Sans lui, le token d'accès est opaque et exige une introspection, ce qui casse la vérification locale sans I/O de l'ADR 0005.

### 2. Configuration obligatoire

Testée par des tests de caractérisation (§6), et jamais laissée aux valeurs par défaut :

| Réglage | Valeur | Défaut constaté |
|---|---|---|
| `accessTokenExpiresIn` | 900 s | 3 600 s |
| `generateRefreshToken` | 256 bits CSPRNG | environ 182 bits |
| `refreshTokenExpiresIn` | 60 jours, glissant | — |
| `refreshTokenReuseInterval` | 30 s | 0 |
| `storeTokens` | fonction de hachage fournie par nous (SHA-256) | hachage interne |
| `storeBackupCodes` | `"encrypted"` | en clair |
| `jwt.rotationInterval` | 90 jours | — |
| `jwt.gracePeriod` | 24 h | 30 jours |
| Endpoint `/token` du plugin `jwt` | désactivé (`disabledPaths`) | actif, et renvoie l'objet utilisateur entier |

`refreshTokenReuseInterval` est nécessaire parce que la révocation touche désormais tous les appareils (§3) : pendant 30 s, rejouer le même refresh token renvoie la même réponse au lieu d'être traité comme un vol. Cela contient les faux positifs mobiles, où la réponse d'un refresh se perd sur le réseau. Le refresh reste sérialisé côté iOS (ADR 0005).

### 3. Réutilisation : tous les appareils, et une réaction que nous écrivons

- **Remplace l'étape 1 de la détection de l'ADR 0005** : la présentation d'un refresh token déjà consommé révoque **tous les refresh tokens de l'utilisateur pour ce client**, donc tous ses appareils.
- **Les étapes 2 à 4 de l'ADR 0005 sont conservées**, mais c'est nous qui les déclenchons. Un hook `before` sur `/oauth2/token` cherche le refresh token présenté par son hash. Il utilise notre propre fonction de hachage (§2), pour ne dépendre d'aucun format interne. Si le token est déjà révoqué, le hook :
  1. ajoute **tous les `sid` de l'utilisateur** à la liste de révocation Redis, avec un TTL de 15 minutes ;
  2. publie l'invalidation sur Redis Pub/Sub, pour que le chat ferme les sockets (ADR 0022, `session:revoked`) ;
  3. révoque les sessions web better-auth de l'utilisateur, qui survivent sinon ;
  4. écrit `identity.session.revoked` dans l'audit (ADR 0006) et notifie l'utilisateur.
- Le hook laisse ensuite better-auth répondre `invalid_grant`, comme pour un token expiré. Le client iOS ne distingue pas les deux cas, et n'a pas à le faire : il renvoie l'utilisateur à la connexion.

### 4. À écrire derrière `AuthenticationPort`

- **Plafond absolu de 180 jours** : hook `before` sur `/oauth2/token`, qui refuse un refresh dont l'`authTime` d'origine (conservé par better-auth sur chaque refresh token) dépasse 180 jours.
- **Claims `amr` et `auth_time`** dans le token d'accès, via `customAccessTokenClaims`. La méthode d'authentification utilisée à la connexion (mot de passe, passkey, TOTP) est tracée par nous.
- **2FA obligatoire** pour les comptes streamer et monétisés : règle du contexte `identity`, évaluée à la connexion et à l'activation de la monétisation.
- **Réauthentification récente** (`auth_time` de moins de 5 minutes) : contrôlée dans les use-cases sensibles, à partir du claim.
- **Rotation d'urgence** : procédure écrite et répétée, qui supprime la ligne de la clé compromise dans la table `jwks`. `gracePeriod` étant global, on ne peut pas retirer une seule clé par configuration.

### 5. Clé de signature et JWKS

- **La clé privée vit en base**, dans la table `jwks` du schéma `identity`, chiffrée par le secret de better-auth, qui vient du gestionnaire de secrets. Ce paragraphe remplace l'exigence de l'ADR 0005 d'une clé hors de la base. La signature par KMS (`jwt.sign` et `jwks.remoteUrl`) reste une évolution possible, à écrire, si l'on veut qu'aucune clé ne soit jamais en base.
- **Le JWKS est exposé à la racine** (`/.well-known/jwks.json`) par une route de l'API qui relaie celui de better-auth (`/auth/jwks`). Les consommateurs (API, process chat) gardent la configuration de l'ADR 0005 : cache de 10 minutes et rechargement sur `kid` inconnu, fournis par `jose`. Le délai minimal entre deux rechargements est réglé à 60 s, comme dans l'ADR 0005 (30 s par défaut dans `jose`).
- La rotation est paresseuse : la nouvelle clé est créée par la première signature après expiration. Deux instances peuvent en créer deux au même moment ; c'est sans gravité, puisque les deux sont publiées.

### 6. Passkeys par la page web

Sur iOS, la passkey est utilisée dans la page de connexion ouverte par `ASWebAuthenticationSession`, avec Associated Domains (`webcredentials:`). Ce paragraphe remplace, dans l'ADR 0005, `ASAuthorizationPlatformPublicKeyCredentialProvider` en natif. Le flux OAuth PKCE reste l'unique chemin d'émission des tokens de l'app.

## Conséquences

### Positives

- Aucune cryptographie ni logique de rotation écrite par nous : ce que better-auth fait, il le fait correctement (rotation atomique, hachage, PKCE, EdDSA).
- La réponse à un vol de refresh token est plus sévère qu'avant, et entièrement observable (Redis, chat, audit, notification).
- Chaque écart entre better-auth et l'ADR 0005 est soit configuré, soit écrit derrière `AuthenticationPort`, soit accepté explicitement.

### Négatives

- Un vol de token, ou un faux positif mobile au-delà de 30 s, déconnecte l'utilisateur de tous ses appareils.
- Quatre hooks et une procédure d'urgence à écrire et à tester, sur le chemin le plus sensible du produit.
- Une passkey passe par une page web plutôt que par une interface native : un écran de plus.
- La clé privée est en base, chiffrée, plutôt que dans le gestionnaire de secrets.

### Risques et mitigations

- **Risque : une montée de version de better-auth change la rotation ou la révocation.** Mitigation : versions exactes épinglées (§1), et tests de caractérisation (notes d'implémentation) rejoués à chaque montée.
- **Risque : le hook de détection rate une réutilisation.** Il dépend de sa capacité à retrouver le token par son hash. Mitigation : notre propre fonction de hachage, et un test qui rejoue un token consommé et vérifie les quatre effets du §3.
- **Non vérifié : la cérémonie passkey complète** dans `ASWebAuthenticationSession`, sur un iPhone réel.
- **Non vérifié : l'adapter Prisma de better-auth avec `multiSchema`** (ADR 0008, ADR 0025) et l'intégration NestJS. À faire au premier sprint du contexte `identity`, avant toute autre fonctionnalité d'authentification.
- **Non vérifié : les métadonnées OIDC** (`/.well-known/openid-configuration`), servies à la racine de l'émetteur et non sous le préfixe de better-auth. Même solution que le JWKS s'il le faut : une route de relais.

## Notes d'implémentation

- Tests de caractérisation à écrire en premier, contre le vrai better-auth : rotation nominale ; réutilisation d'un token consommé qui révoque **aussi un second appareil connecté séparément** ; rejeu dans la fenêtre de 30 s qui renvoie la même réponse sans révoquer ; token d'accès opaque si `resource` est absent ; plafond de 180 jours ; codes de récupération chiffrés en base.
- Les tables de better-auth (`user`, `session`, `jwks`, `oauthRefreshToken`, `twoFactor`, `passkey`…) vivent dans le schéma `identity`. Elles sont accédées uniquement par le client du contexte `identity` (ADR 0025).
- Ne jamais journaliser un refresh token, même haché (ADR 0005, inchangé).
