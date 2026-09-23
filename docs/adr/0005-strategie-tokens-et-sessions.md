# 0005 — Stratégie de tokens et de sessions (better-auth)

- Statut : Accepté
- Date : 2026-09-22
- Décideurs : Muhammed Cavus

## Contexte et problématique

La plateforme expose trois surfaces d'accès : une app iOS native (Swift/SwiftUI), une API NestJS et un back-office Payload. Chacune a besoin d'une identité vérifiée, mais avec des durées de vie et des risques très différents : une session mobile dure des semaines, une connexion WebSocket de chat dure des heures, une session d'admin doit pouvoir être coupée en quelques secondes.

Trois contraintes structurent la décision :

1. **Développeur solo.** Toute brique d'authentification auto-construite (hachage, rotation, MFA, passkeys) est une dette de sécurité permanente. On veut une bibliothèque qui couvre le périmètre, pas un framework à opérer.
2. **Comptes monétisés.** Les streamers reçoivent de l'argent via Stripe Connect (contexte `monetization`, ADR 0003 ; modèle de reversement, ADR 0017). Un compte streamer compromis est un vol d'argent, pas une nuisance.
3. **Règles App Store.** Apple refuse la saisie de credentials tiers dans une WebView embarquée. Le flux d'authentification iOS n'est donc pas un choix esthétique, c'est une contrainte de publication.

Le problème : quel format de token, quelle durée de vie, quel stockage, et que se passe-t-il exactement quand un refresh token fuit ?

## Facteurs de décision

- Surface d'attaque minimale côté client mobile (pas de secret long-lived exploitable hors appareil).
- Révocation effective en secondes, pas en minutes, pour les comptes monétisés.
- Aucun appel réseau supplémentaire pour valider un access token sur le chemin chaud (chat, lecture de stream).
- Compatibilité avec un process chat séparé (ADR 0004) qui ne partage pas le cycle de requête HTTP de NestJS.
- Coût opérationnel : un seul déploiement à surveiller, pas un service d'identité tiers facturé à l'utilisateur actif.

## Options envisagées

**Option A — Fournisseur d'identité managé (Auth0, Clerk, Cognito).** Sécurité déléguée, MFA et passkeys prêts à l'emploi. Mais : facturation au MAU, ce qui est hostile à un produit dont le modèle est le volume d'audience gratuite ; identité utilisateur hébergée hors de notre PostgreSQL, ce qui oblige à synchroniser un miroir local pour toute jointure métier (un `channel` appartient à un `user`) ; et personnalisation du flux de connexion limitée.

**Option B — Sessions opaques côté serveur uniquement (cookie ou bearer, lookup à chaque requête).** Révocation instantanée par nature, modèle mental simple. Mais : un lookup Redis/PostgreSQL sur chaque requête API et chaque message de chat, alors que le chat est précisément le chemin le plus chaud du produit. Couplage fort entre le process chat et le store de sessions.

**Option C — better-auth hébergé dans l'application NestJS, JWT court + refresh opaque rotatif.** Aucun coût par utilisateur, identité dans notre base donc jointures naturelles, validation d'access token locale et sans I/O, révocation réelle portée par le refresh token et par une liste de révocation à durée bornée. Coût : c'est nous qui opérons la rotation de clés et le stockage sécurisé.

**Option D — Service Node dédié `apps/auth` embarquant better-auth, partageant la base PostgreSQL.** Identique à C fonctionnellement, mais isole le déploiement de l'auth de celui de l'API.

## Décision

On retient **l'option C**, avec l'option D comme évolution prévue et sans rupture de contrat.

**better-auth est hébergé dans l'application NestJS**, exposé sous `/auth/*`, et il écrit dans le schéma PostgreSQL du contexte `identity` (ADR 0008). Il n'est ni un service tiers, ni une base séparée. Le contexte `identity` est le seul propriétaire des tables d'authentification ; les autres contextes ne voient qu'un `UserId`.

Le passage à un service Node dédié (option D) devient nécessaire uniquement si le temps de démarrage de l'API ou son rythme de déploiement gênent l'auth. Comme better-auth est monté derrière un préfixe de route stable et que sa vérité est en base, ce déplacement ne change aucun contrat client — c'est une décision de déploiement, pas d'architecture.

### Tokens

- **Access token : JWT signé EdDSA (Ed25519), durée de vie 15 minutes.** Vérifié localement par l'API et par le process chat via JWKS, sans aucun I/O sur le chemin chaud. Claims minimaux : `sub`, `sid` (identifiant de session), `jti`, `iat`, `exp`, `aud`, `iss`, `amr` (méthodes d'authentification effectivement utilisées : `pwd`, `otp`, `passkey`). **Aucun rôle, aucune permission dans le JWT** — l'autorisation est traitée par l'ADR 0006, et mettre un rôle dans un token de 15 minutes signifierait qu'un bannissement met 15 minutes à s'appliquer.
- **Refresh token : opaque, 256 bits d'entropie CSPRNG, stocké haché (SHA-256) en base.** Durée de vie glissante de 60 jours, plafond absolu de 180 jours après quoi une réauthentification complète est exigée.
- **Rotation systématique.** Chaque usage d'un refresh token le consomme et en émet un nouveau. Un refresh token n'est jamais réutilisable.

### Détection de réutilisation

Les refresh tokens d'une même session forment une **famille** (`familyId`, constant depuis la connexion initiale). La présentation d'un refresh token **déjà consommé** est traitée comme une compromission, sans nuance :

1. Toute la famille est révoquée immédiatement — le token courant comme tous ses descendants.
2. Le `sid` correspondant est ajouté à une liste de révocation Redis avec un TTL de 15 minutes (la durée de vie d'un access token), ce qui coupe aussi les access tokens encore valides sans attendre leur expiration.
3. Le process chat est notifié par Redis Pub/Sub et ferme les sockets portant ce `sid`. Pub/Sub n'est ici que le **chemin rapide** : la garantie est portée par la liste de révocation Redis, consultée à chaque revalidation de socket (5 min, ADR 0004). Contrairement aux sanctions de modération — qui transitent par Redis Streams, ADR 0006 §6 — une révocation de session dispose donc déjà d'un état durable à vérifier, et n'a pas besoin d'un canal durable de plus.
4. Un événement `identity.session.revoked` est écrit dans l'audit log (ADR 0006) et une notification est envoyée à l'utilisateur.

On accepte explicitement les **faux positifs** : un réseau mobile qui perd la réponse d'un refresh provoquera une reconnexion. Une reconnexion est un coût acceptable ; un compte streamer volé ne l'est pas.

### iOS

- **OAuth 2.1 / OIDC avec PKCE (S256) via `ASWebAuthenticationSession`**, y compris pour la connexion par email et mot de passe. Jamais de `WKWebView`, jamais de champ de credentials tiers dans l'UI de l'app. Client public, donc aucun client secret embarqué dans le binaire.
- **Stockage Keychain**, attribut `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. `ThisDeviceOnly` interdit la propagation du refresh token vers le trousseau iCloud et vers une restauration de sauvegarde sur un autre appareil. `AfterFirstUnlock` permet le rafraîchissement en tâche de fond, ce que `WhenUnlocked` empêcherait. **`UserDefaults` est interdit pour toute donnée d'authentification** — y compris « temporairement ».
- Le refresh est **sérialisé par un acteur Swift unique** : plusieurs requêtes qui reçoivent un 401 en parallèle doivent attendre un seul rafraîchissement en vol, sinon on déclenche notre propre détection de réutilisation.

### Passkeys et 2FA

- Passkeys via `ASAuthorizationPlatformPublicKeyCredentialProvider`, avec Associated Domains (`webcredentials:`). Méthode de connexion proposée par défaut aux nouveaux comptes.
- **2FA obligatoire, non désactivable, pour tout compte streamer ou monétisé** : dès qu'un compte active la monétisation ou publie un live, l'activation d'un second facteur (passkey ou TOTP) devient bloquante. SMS non proposé (SIM swap). Codes de récupération à usage unique, générés une fois, affichés une fois.
- Les opérations sensibles (changement d'email, ajout d'un compte Stripe Connect, retrait de fonds) exigent une **réauthentification récente** : `auth_time` de moins de 5 minutes, sinon step-up.

### Sessions WebSocket

Le chat (ADR 0004) authentifie **à la poignée de main** : l'access token est présenté en paramètre du protocole `Sec-WebSocket-Protocol` (jamais en query string, qui finit dans les logs d'accès). La signature est vérifiée localement via JWKS mis en cache.

Ensuite, **revalidation toutes les 5 minutes** sur le socket ouvert : le client doit avoir présenté un access token non expiré. Une socket dont le `sid` apparaît dans la liste de révocation Redis est fermée avec le code `4401` sans attendre la revalidation. Le client iOS traite `4401` comme « rafraîchis puis reconnecte », et `4403` comme « n'essaie plus ».

### Multi-appareils et révocation à distance

Une **session** est une ligne durable identifiée par `sid` : `userId`, `familyId`, appareil (modèle, version OS), première/dernière activité, IP et pays approximatif de la dernière activité, `amr`. L'écran « Appareils connectés » de l'app liste ces sessions et permet de révoquer une session précise ou toutes les autres. Une révocation suit exactement le même chemin qu'une détection de réutilisation (étapes 1 à 4 ci-dessus), ce qui garantit qu'il n'existe qu'**un seul code de révocation** à auditer.

### Rotation des clés de signature (JWKS)

- Clés Ed25519, exposées sur `/.well-known/jwks.json`, chaque JWT portant un `kid`.
- **Rotation tous les 90 jours**, avec chevauchement : la nouvelle clé est publiée et devient active pour la signature, l'ancienne reste dans le JWKS pendant 24 h (bien au-delà des 15 minutes de vie d'un access token) puis est retirée.
- Les consommateurs (API, process chat) cachent le JWKS 10 minutes et le rechargent **à la demande** sur `kid` inconnu, avec un garde-fou anti-martèlement (un seul rechargement par minute). Sans ce rechargement à la demande, une rotation provoquerait jusqu'à 10 minutes de 401 généralisés.
- En cas de compromission suspectée d'une clé privée : rotation immédiate, retrait de l'ancienne clé sans chevauchement, ce qui invalide tous les access tokens en vol. Les refresh tokens survivent, donc les clients se reconnectent seuls.

## Conséquences

### Positives

- Validation d'access token sans I/O : le chat et les endpoints de lecture supportent la charge sans dépendre de la disponibilité du store de sessions.
- Un refresh token volé a une fenêtre d'exploitation courte et **s'auto-dénonce** : dès que le propriétaire légitime rafraîchit, la famille saute et il est prévenu.
- L'identité vit dans notre PostgreSQL : `userId` est un identifiant que nous maîtrisons, pas un identifiant externe dont il faudrait maintenir un miroir local synchronisé pour chaque jointure métier. Il reste une **référence nue**, jamais une clé étrangère traversant un contexte — les ADR 0003 et 0008 l'interdisent, et cette interdiction est ce qui rend la séparation future possible.
- Aucun coût par utilisateur actif, ce qui est décisif pour un produit d'audience.
- `ThisDeviceOnly` rend la restauration d'une sauvegarde iCloud sur un appareil neuf inoffensive.
- Un seul chemin de révocation, donc une seule chose à tester correctement.

### Négatives

- Fenêtre de révocation d'access token de 15 minutes dans le cas général — comblée par la liste Redis, qui devient donc un composant dont la panne dégrade la sécurité.
- La rotation de clés JWKS est un mécanisme qu'il faut opérer et surveiller ; mal fait, il provoque une panne d'authentification totale.
- Le client iOS doit implémenter une sérialisation du refresh correcte, ce qui est une source classique de bugs de concurrence.
- La 2FA obligatoire pour les streamers ajoutera de la friction à l'onboarding et générera du support (comptes perdus) qu'un développeur solo devra absorber.
- better-auth dans le process API couple le redéploiement de l'auth à celui de l'API.

### Risques et mitigations

- **Incertitude réelle : la maturité de better-auth sur les passkeys et la rotation de familles.** L'écosystème évolue vite et l'implémentation précise de la détection de réutilisation devra être vérifiée dans la version installée — voire complétée par notre propre couche. Mitigation : encapsuler better-auth derrière un port `AuthenticationPort` du contexte `identity` (ADR 0002), écrire des tests de caractérisation sur la rotation et la détection de réutilisation **avant** de dépendre du comportement, et figer la version.
- **Perte de la clé privée de signature** (pas de rotation possible, panne totale). Mitigation : clés dans le gestionnaire de secrets de la plateforme, jamais dans le dépôt, avec une procédure de rotation d'urgence documentée et testée une fois.
- **Panne Redis = plus de révocation immédiate.** Mitigation assumée : en cas d'indisponibilité de Redis, on ne dégrade pas silencieusement — l'API refuse les opérations sensibles (retraits, changements de credentials) et journalise, le reste continue de fonctionner sur les 15 minutes de JWT.
- **Faux positifs de détection de réutilisation en mobilité dégradée**, qui pourraient devenir un irritant mesurable. Mitigation : instrumenter le taux de révocation par réutilisation dans PostHog dès le premier jour et se donner un seuil (au-delà de ~0,5 % des sessions par semaine, revoir la tolérance côté client, pas la règle serveur).
- **Chevauchement JWKS de 24 h trop long en cas de compromission.** Accepté : la procédure d'urgence prévoit explicitement un retrait sans chevauchement.

## Notes d'implémentation

- Les tables `session`, `refresh_token` (haché), `passkey`, `two_factor`, `recovery_code` vivent dans le schéma `identity`. Aucun autre contexte ne les lit.
- Le refresh est **atomique** : `UPDATE refresh_token SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL RETURNING family_id` — si zéro ligne revient alors que le hash existe, c'est une réutilisation. Ne jamais faire un `SELECT` puis un `UPDATE`.
- Le port du domaine reste minimal et testable sans HTTP :

```ts
type AuthenticatedPrincipal = {
  readonly userId: UserId;
  readonly sessionId: SessionId;
  readonly authenticatedAt: Date;
  readonly methods: readonly AuthMethod[];
};

interface AccessTokenVerifier {
  verify(token: string): Promise<Result<AuthenticatedPrincipal, AuthError>>;
}
```

- Le process chat consomme le même `AccessTokenVerifier` depuis un `packages/` partagé : une seule implémentation de vérification pour les deux process.
- Tests à écrire en premier (TDD) : rotation nominale, réutilisation d'un token consommé, révocation en cascade d'une famille de profondeur 3, expiration du plafond absolu, `kid` inconnu déclenchant un rechargement JWKS unique, fermeture d'une socket sur `sid` révoqué.
- Ne jamais logguer un refresh token, même haché, même en `debug`.
