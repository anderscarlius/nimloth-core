# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY packages/lakehouse-pipeline ./packages/lakehouse-pipeline
COPY services/domain-event-lakehouse-stub ./services/domain-event-lakehouse-stub

RUN pnpm install --filter @nimloth-core/domain-event-lakehouse-stub... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/lakehouse-pipeline build
RUN pnpm --filter @nimloth-core/domain-event-lakehouse-stub build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/domain-event-lakehouse-stub
EXPOSE 3021
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3021/health || exit 1

CMD ["node", "dist/index.js"]
