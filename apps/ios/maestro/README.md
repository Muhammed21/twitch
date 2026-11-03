# Flows Maestro

Parcours de bout en bout de l'app iOS, sur simulateur, par la CLI Maestro gratuite (ADR 0030, §4).

| Flow           | Parcours                                                                           |
| -------------- | ---------------------------------------------------------------------------------- |
| `sign-in.yaml` | Connexion de `viewer@twitch.local` par la page de l'API, puis la fiche du compte   |
| `channel.yaml` | Page d'une chaîne en direct ouverte depuis l'accueil : en-tête, badge LIVE, player |
| `live.yaml`    | Lecture d'un live : le player atteint l'état de lecture                            |

Les flows visent des `.accessibilityIdentifier` (`welcome.logIn`, `root.account`, `home.live.<slug>`, `channel.header`, `player.playing`…) et attendent un élément, jamais un délai fixe. La page de connexion est servie en HTML par l'API (ADR 0039) : elle se vise par ses libellés.

## Lancer en local

Une API et un service vidéo joignables depuis l'app, puis :

```sh
pnpm seed:dev                                   # client OAuth et compte viewer_dev
VIDEO_SERVICE_SECRET=… apps/ios/maestro/go-live.sh viewer_dev   # mire ffmpeg en direct, rend le PID
cd apps/ios && maestro test maestro/
```

`MOBILE_MIN_SUPPORTED_VERSION` ne doit pas dépasser la version de l'app (0.1.0), sinon l'app s'arrête sur l'écran de mise à jour.

## En CI

Le job `maestro` de `.github/workflows/ios.yml` monte PostgreSQL, Redis, l'API, le relais de l'outbox et le service vidéo sur le runner macOS (pas de Docker), met `viewer_dev` en direct et lance tous les flows.

**Le job est non bloquant (`continue-on-error`) tant qu'il n'a pas réussi dix exécutions vertes d'affilée.** Un échec remet le compte à zéro. À la dixième, une PR retire `continue-on-error` et cette phrase.
