# Image de l'API (ADR 0028 §7). outbox-relay réutilise cette image avec une autre commande.
# Les packages @repo/* sont exécutés depuis leurs sources TypeScript : l'étape finale garde
# les sources élaguées, les fichiers générés et les seules dépendances de production.
# Ni migrations ni CLI Prisma (pair de @prisma/client, installé d'office par pnpm) : l'API ne
# peut pas migrer au démarrage (ADR 0008).
FROM node:24.21.0-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.2 prune @repo/api --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm exec turbo run build --filter=@repo/api

FROM base AS api
ENV NODE_ENV=production
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=prune /repo/out/full/ .
COPY --from=build /repo/packages/db/src/generated/ packages/db/src/generated/
COPY --from=build /repo/apps/api/dist/ apps/api/dist/
RUN rm -rf packages/db/prisma/migrations node_modules/.pnpm/prisma@*
USER node
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
