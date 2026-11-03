# Image du service vidéo (ADR 0028 §7, ADR 0031) : un ffmpeg par session de publication.
# Les packages @repo/* sont exécutés depuis leurs sources TypeScript : l'étape finale garde
# les sources élaguées, les fichiers générés et les seules dépendances de production.
# Ni migrations ni CLI Prisma : le job migrate de Compose migre avant le démarrage (ADR 0008).
FROM node:24.21.0-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.2 prune @repo/video --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm exec turbo run build --filter=@repo/video

FROM base AS video
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=prune /repo/out/full/ .
COPY --from=build /repo/packages/db/src/generated/ packages/db/src/generated/
COPY --from=build /repo/apps/video/dist/ apps/video/dist/
RUN rm -rf packages/db/prisma/migrations node_modules/.pnpm/prisma@*
USER node
EXPOSE 1935 3002
CMD ["node", "apps/video/dist/main.js"]
