# syntax=docker/dockerfile:1.7
# better-sqlite3 är en native node-modul — vi behöver build-tools på Alpine.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && apk add --no-cache python3 make g++

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY services/care-unit-edge ./services/care-unit-edge

RUN pnpm install --filter @nimloth-core/care-unit-edge... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/care-unit-edge build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# better-sqlite3 levererar prebuilt binär, men vi ärvar build-deps
# minimalt här ändå för säkerhets skull (några images kräver fallback).
RUN apk add --no-cache python3

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp \
 && mkdir -p /data && chown -R nodeapp:nodeapp /data
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/care-unit-edge
EXPOSE 3003 3004 3006
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3006/health || exit 1

CMD ["node", "dist/index.js"]
