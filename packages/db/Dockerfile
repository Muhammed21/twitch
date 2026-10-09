# Job de migration (ADR 0028 §5 et §7) : CLI Prisma et dossier des migrations, aucune application.
FROM node:24.21.0-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.2 prune @repo/db --docker

FROM base AS migrate
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
WORKDIR /repo/packages/db
USER node
CMD ["pnpm", "migrate"]
