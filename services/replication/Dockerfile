# syntax=docker/dockerfile:1.7
# Replication-tjänst — aggregator edge → central + shared-data-distributor.
# Multi-arch (linux/amd64 + linux/arm64).
# Build context = monorepo root.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY services/replication ./services/replication

RUN pnpm install --filter @nimloth-core/replication... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/replication build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
RUN apk add --no-cache curl

COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/replication

EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3007/health || exit 1

CMD ["node", "dist/index.js"]
