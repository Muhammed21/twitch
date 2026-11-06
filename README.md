# twitch

Clone de Twitch : une app iOS native (Swift / SwiftUI) et une API NestJS, avec un process de chat et un service vidéo séparés. L'app iOS est le seul client du produit (ADR 0030).

## Documentation

Décisions, spikes et où écrire : [`docs/README.md`](docs/README.md). Chaque page en une ligne : [`docs/CATALOG.md`](docs/CATALOG.md).

## Dépôt

Monorepo pnpm et Turborepo, en TypeScript 7.

| Chemin                       | Contenu                                                                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/`                      | Les applications : `api`, `video` (ADR 0031), `ios` (ADR 0038), `payload` (back-office, ADR 0007) ; `chat` arrive avec son premier use-case               |
| `packages/design-tokens`     | Tokens DTCG compilés en Swift et en CSS (ADR 0019)                                                                                                        |
| `packages/docs-catalog`      | Générateur de `docs/CATALOG.md`                                                                                                                           |
| `packages/ios-imports`       | Lint des `import` Swift de `apps/ios` (ADR 0010, règle 4 ; ADR 0019, règle 5 bis)                                                                         |
| `packages/reserved-names`    | Noms réservés aux routes de l'app, refusés comme slug de chaîne et comme nom d'utilisateur (ADR 0039, §2) ; sans dépendance, importable depuis un domaine |
| `packages/typescript-config` | Configuration TypeScript partagée                                                                                                                         |
| `docker/`, `compose.yaml`    | Environnement local : PostgreSQL, Redis, stockage S3, Mailpit (ADR 0028)                                                                                  |

## Commandes

Node est épinglé dans `.node-version`.

```sh
pnpm install
pnpm infra:up       # services locaux
docker compose --profile full up -d --build --wait api chat   # video, relais de l'outbox, API et chat en conteneurs, après migrate
pnpm lint           # oxlint typé (ADR 0029), puis lint des import Swift
pnpm check-types
pnpm test
pnpm generate       # artefacts générés : design tokens, catalogue de la documentation
```

## Démo du live (jalon J2)

```sh
pnpm infra:up
docker compose --profile full up -d --build --wait api   # migrate, puis video, outbox-relay et l'API
pnpm seed:dev                                            # clients, comptes et catégories de dev
```

- `api` dépend d'`outbox-relay` : le relais publie `identity.account.registered`, qui crée la chaîne puis son canal vidéo.
- `seed:dev` est à relancer quand `API_PORT` change : le client OAuth est lié à `BETTER_AUTH_URL`.
- Le canal vidéo se crée avec la chaîne, chez le fournisseur que l'API utilise à ce moment : un compte de démo s'enregistre une fois le profil `full` démarré (`VIDEO_PROVIDER=video`).
- Clé de stream : `GET /v1/channels/{id}/stream-key` avec le jeton du propriétaire. Publication, avec la clé rendue :

  ```sh
  ffmpeg -re -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine \
    -c:v libx264 -g 60 -c:a aac -f flv "rtmp://127.0.0.1:${VIDEO_RTMP_PORT:-1935}/live/<streamKey>"
  ```

- Lecture : `GET /v1/channels/{id}/playback` rend la playlist maître ; le statut du live arrive par `GET /v1/channels/{id}/live-status` (SSE). À l'arrêt de la publication, la playlist se clôt par `#EXT-X-ENDLIST`, puis répond 404.

## iOS

Xcode, et [Mint](https://github.com/yonaskolb/Mint) pour SwiftFormat et SwiftLint, dont les versions sont épinglées dans `apps/ios/Mintfile` (ADR 0018, §4) :

```sh
brew install mint
mint bootstrap --mintfile apps/ios/Mintfile   # une fois, puis à chaque changement du Mintfile
```

Le pre-commit formate les `*.swift` indexés sous `apps/ios/` avec SwiftFormat. Sans Mint, ou sans `mint bootstrap`, il refuse le commit.

```sh
cd apps/ios
mint run swiftformat --lint .
mint run swiftlint lint --strict
scripts/check-swiftlint-rules.sh   # les règles maison de SwiftLint contre leurs fixtures
cd Packages
xcodebuild test -scheme Packages-Package -destination 'id=<udid>'   # udid : xcrun simctl list devices available
cd .. && xcodebuild test -project App.xcodeproj -scheme App -destination 'id=<udid>'   # tests hébergés (Keychain, Info.plist)
scripts/chat-integration.sh 'id=<udid>'   # ChatTransport contre le vrai serveur de chat (ADR 0023)
```

La CI iOS (`.github/workflows/ios.yml`) se lance sur les diffs de `apps/ios/` (ADR 0018, §4 ; ADR 0038). Son job Maestro joue les flows de [`apps/ios/maestro/`](apps/ios/maestro/README.md), non bloquant jusqu'à dix exécutions vertes d'affilée.
