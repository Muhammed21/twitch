# 0030 — Pas de client web : l'app iOS est le seul client du produit

- Statut : Proposé
- Date : 2026-10-09
- Décideurs : Muhammed Cavus
- Amende : ADR 0009 (compositions du web), ADR 0014 (achats web via Stripe), ADR 0015 (chemin d'achat web)

## Contexte et problématique

Le projet est un clone de Twitch réalisé dans le cadre d'un cours. Twitch est d'abord un site, et le dépôt contient deux applications Next.js issues du gabarit Turborepo, `apps/web` et `apps/docs`, ainsi que `packages/ui`, une bibliothèque React d'exemple qu'elles seules consomment.

Aucun ADR ne décide pourtant d'un client web. Les ADR 0009 à 0011 décrivent un seul client, l'app iOS native. Le web n'apparaît qu'en creux :

- l'ADR 0009 réserve `/v1/mobile/*` à l'app iOS, et ajoute que « Payload et le web ont leurs propres compositions » ;
- les ADR 0014 et 0015 prévoient des achats web par Stripe « plus tard », et l'ADR 0015 en fait la condition de viabilité économique ;
- l'ADR 0017 reste `Proposé` parce que l'ouverture de ce canal web dépend d'un cadre fiscal.

Un lecteur qui trouve `apps/web` dans le dépôt et ces mentions dans les ADR peut en conclure qu'un site est prévu. Ce n'est pas le cas.

Les coûts du programme Apple Developer et de RevenueCat sont assumés pour le cours : ils restent modestes, et ce sont eux qui rendent possibles les notifications APNs, TestFlight, App Attest et les achats intégrés des ADR 0013 à 0016.

Problématique : le produit a-t-il un client web, et que deviennent les décisions qui en supposaient un ?

## Facteurs de décision

- **Capacité d'un développeur seul** : deux clients au même niveau de fonctionnalités, c'est deux fois l'interface à construire et à tester.
- **Objet du cours** : l'app iOS native et l'API NestJS sont les deux livrables.
- **Honnêteté du dépôt** : du code de gabarit sans rôle trompe le lecteur, comme un ADR qui décrit un canal que personne ne construira.

## Options envisagées

### Option A — Un client web Next.js en plus de l'app iOS

Plus fidèle à Twitch, et démontrable sans installer d'app. Mais il double l'interface, et il impose au chat un second support de token : un navigateur ne peut pas poser d'en-tête `Authorization` sur un upgrade WebSocket (ADR 0022), il faudrait un cookie et un contrôle d'`Origin`. **Écartée.**

### Option B (retenue) — L'app iOS seule, servie par l'API NestJS

Un seul client, celui que les ADR 0009 à 0011 décrivent déjà. Le gabarit web est retiré. **Retenue.**

## Décision

### 1. Les clients du produit

| Surface                   | Rôle                                                       | ADR              |
| ------------------------- | ---------------------------------------------------------- | ---------------- |
| App iOS (Swift / SwiftUI) | **Seul client** des viewers et des streamers               | 0009, 0010, 0011 |
| API NestJS                | Backend unique de l'app                                    | 0002, 0003       |
| Process de chat           | Temps réel de l'app                                        | 0004, 0022       |
| Payload                   | Back-office des administrateurs, pas un client du produit  | 0007             |
| Page de connexion OAuth   | Ouverte par `ASWebAuthenticationSession`, servie par l'API | 0005, 0026       |

La page de connexion et l'interface de Payload sont des pages web, mais aucune n'est un client du produit : la première est une étape du flux OAuth de l'app, la seconde est réservée aux administrateurs.

Le streamer diffuse depuis OBS (ADR 0031) et gère sa chaîne depuis l'app iOS : clé de stream, titre, catégorie, modération. Il n'y a pas de tableau de bord web.

### 2. Le gabarit web est retiré

`apps/web`, `apps/docs` et `packages/ui` sont supprimés. La sortie CSS des design tokens est conservée : son consommateur est Payload (ADR 0019, §7).

### 3. Conséquences sur les ADR

- **0009** : `/v1/mobile/*` est le seul BFF. La mention « le web a ses propres compositions » ne correspond à aucun client ; Payload garde les siennes.
- **0014, 0015** : il n'y a pas de canal d'achat web. Les abonnements et les bits passent uniquement par l'App Store, via RevenueCat. L'architecture multi-adapter de l'ADR 0014 est conservée : elle ne coûte rien et garde la porte ouverte.
- **0017** : la condition qui le maintient `Proposé`, l'ouverture d'un canal web, disparaît. Les questions fiscales sur le reversement lui-même (statut du streamer, obligations déclaratives de plateforme) demeurent ; c'est à elles seules que tient désormais son passage à `Accepté`.

## Conséquences

### Positives

- Un seul client à construire, à tester et à démontrer.
- Le chat garde un seul support de token, l'en-tête `Authorization` (ADR 0022, 0023).
- Le dépôt ne contient plus de code de gabarit sans rôle.

### Négatives

- Le clone s'écarte de Twitch sur sa surface principale : pas de site pour regarder un live.
- La démonstration exige un appareil iOS ou le simulateur ; un enseignant ne peut pas ouvrir un lien.
- Tout achat passe par l'App Store, avec sa commission (ADR 0015).

### Risques et mitigations

- **Risque : un client web revient par une PR « juste pour tester ».** Mitigation : la règle de l'ADR 0021 (§10) s'applique : une surface hors scope revient par un ADR, qui devra traiter l'authentification du chat dans un navigateur.
- **Risque : démonstration impossible le jour J.** Mitigation : TestFlight, ouvert par le compte Apple Developer, distribue l'app aux enseignants ; le simulateur reste le repli.

## Notes d'implémentation

- Une PR `chore` supprime `apps/web`, `apps/docs` et `packages/ui`, et retire leurs références : `pnpm-workspace.yaml`, `turbo.json`, workflows de CI, `README.md` racine, `.github/labeler.yml`.
- Le package `e2e/` (Playwright) cible `apps/web` sur le port 3000 : il est retiré avec lui, ainsi que `.github/workflows/e2e-web.yml` et le job `e2e-web` de `ci.yml`. Les tests de bout en bout de l'API passent par Vitest contre Compose, et ceux de l'app par XCUITest.

## Liens

- ADR 0009, 0010, 0011 — Contrat API et app iOS : le seul client
- ADR 0014, 0015, 0017 — Monétisation : plus de canal d'achat web
- ADR 0019 — Design tokens : la sortie CSS reste, pour Payload
- ADR 0022 — Transport du chat : un seul support de token
- ADR 0031 — Service vidéo maison : diffusion depuis OBS
