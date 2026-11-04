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
apps/ios/maestro/go-live.sh viewer_dev   # VIDEO_SERVICE_SECRET et DATABASE_URL_STREAM de .env ; rend le PID de ffmpeg
cd apps/ios && maestro test maestro/
```

`MOBILE_MIN_SUPPORTED_VERSION` ne doit pas dépasser la version de l'app (0.1.0), sinon l'app s'arrête sur l'écran de mise à jour.

## En CI

Le job `maestro` de `.github/workflows/ios.yml` monte PostgreSQL, Redis, l'API, le relais de l'outbox et le service vidéo sur le runner macOS (pas de Docker), met `viewer_dev` en direct et lance tous les flows sur un iPhone 16 Pro sous iOS 18.5, démarré et attendu (`simctl bootstatus`) avant Maestro.

Les flows passent par `ci-test.sh`. Quand le pilote XCTest de Maestro ne démarre pas (« iOS driver not ready in time »), aucun flow n'a tourné : le script redémarre le simulateur et relance Maestro, trois essais au plus. Un flow en échec n'est jamais relancé. `check-ci-test.sh` vérifie ce comportement dans le job `ios`.

Le job `maestro` ne tourne pas sur les PR : il tourne à chaque push sur `main` qui touche `apps/ios/`, chaque nuit à 3 h UTC (les flows dépendent aussi de l'API et du service vidéo), et à la main (`gh workflow run ios.yml --ref <branche>`) pour éprouver une branche avant son merge. Il reprend le DerivedData de l'app que le job `iOS` met en cache.

**Le job est non bloquant (`continue-on-error`) tant qu'il n'a pas réussi dix exécutions vertes d'affilée.** Les exécutions comptées sont celles de `main`, push et nuit ; un échec remet le compte à zéro. À la dixième, une PR retire `continue-on-error` et cette phrase.
