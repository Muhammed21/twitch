# 0039 — Les pages d'authentification sont servies par l'API, en HTML sans JavaScript

- Statut : Proposé
- Date : 2026-10-16
- Décideurs : Muhammed Cavus
- Amende : ADR 0035 (option B, plugin `username`, reprise ; §2, emplacement de la liste des mots réservés)

## Contexte et problématique

L'ADR 0005 impose la connexion iOS par OAuth 2.1 PKCE via `ASWebAuthenticationSession`, sans champ d'identifiants dans l'app, et l'ADR 0030 place la page de connexion dans l'API. L'API émet déjà des tokens (ADR 0026), mais aucune page n'existe : une autorisation sans session redirige vers `/login`, qui répond 404. Le client iOS n'est enregistré que dans les tests.

Les captures `docs/reference-ui/auth/` montrent des écrans natifs : connexion par nom d'utilisateur, inscription avec date de naissance et téléphone, code SMS, code 2FA. L'API ne connaît que l'e-mail, et l'ADR 0005 exclut le SMS.

Problématique : comment les écrans d'authentification des captures s'affichent-ils, et que demandent-ils à l'API ?

## Facteurs de décision

- **ADR 0005 et 0030** : identifiants saisis hors de l'app, dans une page servie par l'API.
- **Fidélité aux captures** (ADR 0036) : mêmes écrans, mêmes champs, mêmes valeurs visuelles.
- **Connexion par nom d'utilisateur** : les captures se connectent par nom d'utilisateur, pas par e-mail.
- **Testabilité** : chaque écran se teste en intégration, sans navigateur.
- **Robustesse dans la feuille système** : la page doit marcher dans `ASWebAuthenticationSession`.

## Options envisagées

### Option A — Formulaires natifs SwiftUI

- Avantages : fidélité totale aux captures.
- Inconvénients : contraire à l'ADR 0005 ; l'app voit le mot de passe ; la passkey se complique.
- **Écartée.**

### Option B — Petite application web (Vite, React)

- Avantages : écrans riches.
- Inconvénients : un client web de plus, ce que l'ADR 0030 évite ; un outillage et une CI de plus.
- **Écartée.**

### Option C — HTML rendu par l'API, formulaires sans JavaScript

- Avantages : conforme aux ADR 0005 et 0030 ; chaque écran se teste avec supertest ; rien ne dépend de JavaScript dans la feuille système.
- Inconvénients : la barre système de la feuille reste visible au-dessus des écrans ; l'API gagne une couche de présentation HTML.
- **Retenue.**

## Décision

### 1. Pages

L'API sert en HTML, sans JavaScript, les écrans des captures `auth/` : connexion, étape 2FA, inscription, code e-mail, « You're All Set! », et la réinitialisation du mot de passe. Chaque formulaire poste vers une route de l'API, qui appelle better-auth en interne, pose le cookie de session et reprend l'autorisation OAuth en cours. Les textes sont en anglais, comme les captures ; le CSS reprend les valeurs des design tokens (ADR 0019, ADR 0036).

### 2. Identifiant

Le plugin `username` de better-auth permet la connexion par nom d'utilisateur ou par e-mail. Un nom d'utilisateur suit `^[A-Za-z0-9_]{4,25}$`, unique sans tenir compte de la casse, et sert de nom affiché initial. Il refuse les mots réservés du slug de chaîne (ADR 0035, §2) : la liste quitte le domaine `channel` pour un module partagé par `identity` et `channel`, et un nom d'utilisateur donne son propre slug quand il est libre.

### 3. Inscription

L'inscription demande un nom d'utilisateur, un mot de passe de 8 à 128 caractères, une date de naissance et un e-mail. Elle refuse les moins de 13 ans et stocke la date de naissance. Un code à 6 chiffres envoyé par e-mail (plugin `emailOTP`) vérifie l'adresse avant « You're All Set! ». Pas de téléphone ni de SMS (ADR 0005). En local, les e-mails partent vers Mailpit.

### 4. Entrée dans le flux

L'app ouvre toujours l'autorisation PKCE ; `prompt=create` affiche l'inscription au lieu de la connexion. La session web est éphémère (`prefersEphemeralWebBrowserSession`) : aucun cookie n'est partagé avec Safari, et une déconnexion de l'app en est une vraie.

### 5. 2FA et réinitialisation

Si le compte a activé le TOTP, la connexion passe par l'étape « Welcome back » et son code. La réinitialisation du mot de passe passe par un code e-mail, dans le même écran que l'inscription.

### 6. Client iOS

Le client iOS est public, PKCE obligatoire, et redirige vers `twitch://oauth/callback`. En local, une commande de seed l'enregistre avec son lien vers la ressource `/v1`. Le client de production se décide avec l'hébergement.

## Conséquences

### Positives

- La connexion et l'inscription marchent de bout en bout, sans identifiant dans l'app.
- Chaque écran se teste en intégration, et le jalon I1 du plan iOS devient atteignable.

### Négatives

- La barre système de `ASWebAuthenticationSession` s'affiche au-dessus des écrans : écart avec les captures.
- L'API porte une couche HTML et du CSS à tenir alignés sur les tokens.
- Les écrans de réinitialisation n'ont pas de capture : ils suivent le style des autres.
- Le format `[A-Za-z0-9_]{4,25}` est tenu à deux endroits, le nom d'utilisateur dans `identity` et le slug dans `channel`. L'ADR 0035 avait écarté le plugin `username` pour cette raison ; il est repris parce que les captures se connectent par nom d'utilisateur.

### Risques et mitigations

- **CSS qui dérive des tokens.** Mitigation : le CSS est généré depuis les tokens (sortie CSS prévue par l'ADR 0019), jamais écrit en dur.
- **Formulaire rejoué ou forgé.** Mitigation : chaque `POST` vérifie l'origine et un jeton CSRF lié à la session d'autorisation.
- **Les deux formats divergent.** Mitigation : la liste des mots réservés est partagée, et un test de chaque côté fixe le même format.
- **Énumération des comptes.** Mitigation : la réinitialisation répond pareil que l'adresse existe ou non ; la connexion ne dit pas lequel des deux champs est faux.

## Liens

- [ADR 0005](0005-strategie-tokens-et-sessions.md) — PKCE via `ASWebAuthenticationSession`, aucun identifiant dans l'app, pas de SMS.
- [ADR 0026](0026-better-auth-oauth-provider-et-revocation-sur-reutilisation.md) — better-auth et le fournisseur OAuth que ces pages alimentent.
- [ADR 0030](0030-pas-de-client-web-app-ios-seul-client.md) — la page de connexion est servie par l'API.
- [ADR 0035](0035-slug-de-chaine-derive-du-nom-d-affichage-jamais-refuse.md) — slug de chaîne, dont la liste des mots réservés devient partagée.
- [ADR 0036](0036-valeurs-visuelles-relevees-sur-l-app-ios-twitch.md) — valeurs visuelles des captures.
