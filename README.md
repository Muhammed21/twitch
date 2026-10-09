# twitch

Clone de Twitch : une app iOS native (Swift / SwiftUI) et une API NestJS, avec un process de chat et un service vidéo séparés. L'app iOS est le seul client du produit (ADR 0030).

## Documentation

Décisions, spikes et où écrire : [`docs/README.md`](docs/README.md). Chaque page en une ligne : [`docs/CATALOG.md`](docs/CATALOG.md).

## Dépôt

Monorepo pnpm et Turborepo, en TypeScript 7.

| Chemin                       | Contenu                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `apps/`                      | Les applications. `api`, `chat` et `video` arrivent avec leur premier use-case |
| `packages/design-tokens`     | Tokens DTCG compilés en Swift et en CSS (ADR 0019)                             |
| `packages/docs-catalog`      | Générateur de `docs/CATALOG.md`                                                |
| `packages/typescript-config` | Configuration TypeScript partagée                                              |
| `docker/`, `compose.yaml`    | Environnement local : PostgreSQL, Redis, stockage S3, Mailpit (ADR 0028)       |

## Commandes

Node est épinglé dans `.node-version`.

```sh
pnpm install
pnpm infra:up       # services locaux
pnpm lint           # oxlint typé (ADR 0029)
pnpm check-types
pnpm test
pnpm generate       # artefacts générés : design tokens, catalogue de la documentation
```
