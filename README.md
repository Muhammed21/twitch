# twitch

Clone de Twitch : une app iOS native (Swift / SwiftUI) et une API NestJS, avec un process de chat et un service vidéo séparés. L'app iOS est le seul client du produit (ADR 0030).

## Documentation

Décisions, spikes et où écrire : [`docs/README.md`](docs/README.md). Chaque page en une ligne : [`docs/CATALOG.md`](docs/CATALOG.md).

## Dépôt

Monorepo pnpm et Turborepo, en TypeScript 7.

| Chemin                       | Contenu                                                                                                  |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| `apps/`                      | Les applications : `api`, `video` (ADR 0031), `ios` (ADR 0038) ; `chat` arrive avec son premier use-case |
| `packages/design-tokens`     | Tokens DTCG compilés en Swift et en CSS (ADR 0019)                                                       |
| `packages/docs-catalog`      | Générateur de `docs/CATALOG.md`                                                                          |
| `packages/ios-imports`       | Lint des `import` Swift de `apps/ios` (ADR 0010, règle 4 ; ADR 0019, règle 5 bis)                        |
| `packages/typescript-config` | Configuration TypeScript partagée                                                                        |
| `docker/`, `compose.yaml`    | Environnement local : PostgreSQL, Redis, stockage S3, Mailpit (ADR 0028)                                 |

## Commandes

Node est épinglé dans `.node-version`.

```sh
pnpm install
pnpm infra:up       # services locaux
pnpm lint           # oxlint typé (ADR 0029), puis lint des import Swift
pnpm check-types
pnpm test
pnpm generate       # artefacts générés : design tokens, catalogue de la documentation
```

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
xcodebuild test -scheme Packages -destination 'id=<udid>'   # udid : xcrun simctl list devices available
```

La CI iOS (`.github/workflows/ios.yml`) se lance à la main (ADR 0018, §4).
