# syntax=docker/dockerfile:1.7
# Edge-nod Dockerfile — multi-arch med native deps för better-sqlite3.
# Build context = monorepo root.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
# python3/make/g++ behövs för better-sqlite3 native-kompilering.
RUN apk add --no-cache python3 make g++

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY services/edge ./services/edge

RUN pnpm install --filter @nimloth-core/edge... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/edge build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
RUN apk add --no-cache curl

# Vi tar med hela monorepo-lagret (inkl. node_modules som innehåller
# better-sqlite3's arch-kompilerade native-binär).
COPY --from=builder --chown=nodeapp:nodeapp /app ./
RUN mkdir -p /data && chown -R nodeapp:nodeapp /data

USER nodeapp
WORKDIR /app/services/edge

# SQLite data-volym
VOLUME /data
ENV FHIR_CACHE_DB=/data/fhir-cache.db

# Portar: 3003 (FHIR replica), 3004 (CDS), 3006 (status/metrics)
EXPOSE 3003 3004 3006
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:3006/health || exit 1

CMD ["node", "dist/index.js"]
