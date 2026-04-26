# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY services/terminology ./services/terminology

RUN pnpm install --filter @nimloth-core/terminology... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/terminology build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/terminology
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3008/health || exit 1

CMD ["node", "dist/index.js"]
