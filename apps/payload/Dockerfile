# Image de Payload (ADR 0028 §7). Deux cibles : `migrate`, le CLI de Payload et ses migrations
# (job payload-migrate), et `payload`, la seule sortie standalone de next build, sans migrations.
# next build ne joint aucune base : aucune variable n'est passée au build.
FROM node:24.21.0-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.2 prune @repo/payload --docker

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ .
RUN pnpm --filter @repo/payload build

FROM base AS migrate
ENV NODE_ENV=production
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=prune /repo/out/full/ .
WORKDIR /repo/apps/payload
USER node
CMD ["node", "node_modules/payload/bin.js", "migrate"]

FROM node:24.21.0-slim AS payload
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3200
WORKDIR /repo
COPY --from=build /repo/apps/payload/.next/standalone/ .
COPY --from=build /repo/apps/payload/.next/static/ apps/payload/.next/static/
USER node
EXPOSE 3200
CMD ["node", "apps/payload/server.js"]
