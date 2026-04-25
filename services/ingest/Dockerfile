# syntax=docker/dockerfile:1.7
# Multi-arch build: linux/amd64 + linux/arm64
# Build context = monorepo root.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

# Root workspace-manifest
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./

# Dependencies — både @nimloth-core/shared (workspace) och @nimloth-core/ingest
COPY packages/shared ./packages/shared
COPY services/ingest ./services/ingest

# Installera hela beroendeträdet för ingest (inklusive workspace-deps)
RUN pnpm install --filter @nimloth-core/ingest... --frozen-lockfile=false

# Bygg shared först (ingest depends on it), sedan ingest
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/ingest build

# --- Runtime ---
FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp

# Kopiera allt (node_modules + workspace-struktur + byggda filer).
# pnpm:s symlinks kräver att hela trädstrukturen bevaras.
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/ingest
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
