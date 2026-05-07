# syntax=docker/dockerfile:1.7
# composition-mapper — runtime FHIR R4 → openEHR composition.
# better-sqlite3 är native, kräver build-tools på Alpine.
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && apk add --no-cache python3 make g++

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY packages/model-router ./packages/model-router
COPY services/composition-mapper ./services/composition-mapper

RUN pnpm install --filter @nimloth-core/composition-mapper... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/model-router build
RUN pnpm --filter @nimloth-core/composition-mapper build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache python3

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp \
 && mkdir -p /data && chown -R nodeapp:nodeapp /data
COPY --from=builder --chown=nodeapp:nodeapp /app ./

# Kopiera model-routing-config till en känd path.
COPY --chown=nodeapp:nodeapp config /app/config

USER nodeapp
WORKDIR /app/services/composition-mapper
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
