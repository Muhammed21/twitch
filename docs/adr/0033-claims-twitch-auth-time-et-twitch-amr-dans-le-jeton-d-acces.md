# 0033 — Claims `twitch_auth_time` et `twitch_amr` dans le jeton d'accès, à la place d'`auth_time` et `amr`

- Statut : Accepté
- Date : 2026-10-12
- Décideurs : Muhammed Cavus
- Amende : ADR 0026 (§4, claims `amr` et `auth_time` du jeton d'accès)

## Contexte et problématique

L'ADR 0026 §4 prévoit d'ajouter les claims `amr` et `auth_time` au jeton d'accès par `customAccessTokenClaims`. La réauthentification récente (`auth_time` de moins de 5 minutes) et l'exigence d'un second facteur se lisent ensuite dans le jeton, sans I/O, comme le veut l'ADR 0005.

Le spike de la PR 6c, sur `@better-auth/oauth-provider` 1.7.7, montre que c'est impossible :

- `auth_time`, `amr` et `acr` font partie des noms réservés du jeton d'accès (`RESERVED_ACCESS_TOKEN_CLAIMS`). better-auth les retire de toutes les sources de claims : `customAccessTokenClaims`, les extensions (`oauthProvider({ extensions })`) et les claims par ressource. Il journalise un avertissement (« The AS owns these claim values »).
- better-auth n'émet pas lui-même ces claims dans le jeton d'accès, seulement `auth_time` dans l'ID token.
- `customAccessTokenClaims` ne reçoit ni la session ni l'heure d'authentification. Une extension de claims reçoit en revanche `sessionId` et le contexte de la requête.
- better-auth calcule l'heure d'authentification à partir de `session.createdAt`. Rien ne trace la méthode d'authentification.

Problématique : comment porter l'heure et les méthodes d'authentification dans le jeton d'accès, quand better-auth réserve `auth_time` et `amr` sans les émettre ?

## Facteurs de décision

- Vérification du jeton locale et sans I/O (ADR 0005).
- Aucune cryptographie écrite par nous (ADR 0026).
- Ne pas modifier le code de better-auth, épinglé en version exacte (ADR 0026 §1).
- Un manque d'information doit se lire comme « pas d'authentification récente », jamais l'inverse.

## Options envisagées

### Option A — Claims sous des noms à nous, par une extension de claims

Une extension `claims.accessToken` lit la session par `sessionId` et ajoute `twitch_auth_time` et `twitch_amr`. La méthode d'authentification est enregistrée sur la session à sa création.

- Avantages : la vérification reste locale ; tout passe par une API publique de better-auth ; aucune signature écrite par nous.
- Inconvénients : noms non standards ; les claims disparaissent si la session est supprimée alors que le refresh token survit.
- **Retenue.**

### Option B — Rien dans le jeton, lecture par `sid`

Le vérificateur retrouve l'heure et les méthodes d'authentification par le `sid`, dans Redis ou en base, au moment d'un use-case sensible.

- Avantages : aucun nom inventé.
- Inconvénients : une lecture de plus sur chaque use-case sensible ; l'information sort du jeton, contrairement à l'ADR 0005.
- **Écartée** : elle déplace l'information hors du jeton pour un gain de nommage seulement.

### Option C — Signer le jeton nous-mêmes

Fournir `jwt.sign` au plugin `jwt` pour signer le jeton nous-mêmes et y injecter `auth_time` et `amr`.

- Avantages : noms standards.
- Inconvénients : la signature, et donc la gestion des clés, devient notre code.
- **Écartée** : contraire à l'ADR 0026 (« aucune cryptographie ni logique de rotation écrite par nous »).

## Décision

### 1. Deux claims à nous

Le jeton d'accès porte :

- `twitch_auth_time` : l'heure d'authentification, en secondes depuis l'epoch (NumericDate), égale à `createdAt` de la session ;
- `twitch_amr` : les méthodes d'authentification, en valeurs de la RFC 8176.

Ils remplacent `auth_time` et `amr` partout où l'ADR 0026 §4 les cite, réauthentification récente comprise.

### 2. La méthode d'authentification est enregistrée sur la session

Un hook `databaseHooks.session.create.before` écrit `amr` sur la session, d'après l'endpoint qui la crée :

| Endpoint                                                    | `amr`                   |
| ----------------------------------------------------------- | ----------------------- |
| `/sign-up/email`, `/sign-in/email`                          | `["pwd"]`               |
| `/two-factor/verify-totp`, `/two-factor/verify-backup-code` | `["pwd", "otp", "mfa"]` |
| tout autre endpoint                                         | `[]`                    |

Une liste vide signifie « méthode inconnue ». Un nouveau mode de connexion (passkey) ajoute sa ligne.

### 3. Pas de session, pas de claims

Si la session du `sid` n'existe plus, le jeton ne porte ni `twitch_auth_time` ni `twitch_amr`. Un use-case qui exige une authentification récente ou un second facteur refuse alors, comme pour une authentification trop ancienne.

## Conséquences

### Positives

- La vérification reste locale et sans I/O.
- Le jeton dit comment l'utilisateur s'est authentifié : la 2FA obligatoire et la réauthentification récente se contrôlent sur le jeton.
- Aucune modification de better-auth.

### Négatives

- Des noms de claims à nous : un consommateur standard ne les reconnaît pas.
- Une déconnexion web, qui supprime la session, retire ces claims des jetons rafraîchis ensuite : l'utilisateur doit se réauthentifier pour une action sensible.
- `amr` dépend des chemins des endpoints de better-auth, qui peuvent changer avec une montée de version.

### Risques et mitigations

- **Risque : une montée de version renomme un endpoint de connexion.** La session reçoit alors `[]`. Mitigation : tests d'intégration sur chaque ligne du tableau du §2, rejoués à chaque montée (ADR 0026, notes d'implémentation).
- **Risque : better-auth finit par émettre `auth_time` et `amr` dans le jeton d'accès.** Mitigation : un nouvel ADR passera aux noms standards, et les consommateurs liront les deux noms pendant la transition.

## Notes d'implémentation

- Champ `amr` (`String[]`) sur `IdentitySession`, déclaré dans `session.additionalFields` (`type: "string[]"`, `input: false`).
- Extension : `oauthProvider({ extensions: [{ claims: { accessToken } }] })`, avec une session lue par `sessionId`.
- Le vérificateur de la PR 7 (`packages/auth-verifier`) lit `twitch_auth_time` et `twitch_amr`.

## Liens

- [0005](0005-strategie-tokens-et-sessions.md) : vérification locale du jeton, 2FA obligatoire.
- [0026](0026-better-auth-oauth-provider-et-revocation-sur-reutilisation.md) : §4, dont ce document remplace la partie « claims `amr` et `auth_time` ».
