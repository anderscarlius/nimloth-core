# syntax=docker/dockerfile:1.7
# B7 — samma monorepo-mönster som cohort-service/Dockerfile. migration-
# gateway har inga interna @nimloth-core/*-paketberoenden (bara externa
# npm-paket, se package.json) — packages/ kopieras ändå in för
# konsekvens med systerbyggena och för att inte bryta om ett internt
# beroende läggs till senare.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages ./packages
COPY services/migration-gateway ./services/migration-gateway

RUN pnpm install --filter @nimloth-core/migration-gateway... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/migration-gateway build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/migration-gateway
EXPOSE 11113
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -q --spider http://127.0.0.1:11113/healthz || exit 1

CMD ["node", "dist/index.js"]
