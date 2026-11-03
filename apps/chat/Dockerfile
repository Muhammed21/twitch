# Image du chat (ADR 0028 §7, ADR 0004) : le chat et les packages @repo/* sont exécutés
# depuis leurs sources TypeScript, sans étape de build ; l'image garde les sources élaguées
# et les seules dépendances de production.
FROM node:24.21.0-slim AS base
RUN corepack enable
WORKDIR /repo

FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.2 prune @repo/chat --docker

FROM base AS chat
ENV NODE_ENV=production
COPY --from=prune /repo/out/json/ .
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=prune /repo/out/full/ .
USER node
EXPOSE 3001
CMD ["node", "apps/chat/src/main.ts"]
