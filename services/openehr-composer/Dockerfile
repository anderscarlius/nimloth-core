# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared ./packages/shared
COPY services/openehr-composer ./services/openehr-composer

RUN pnpm install --filter @nimloth-core/openehr-composer... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/shared build
RUN pnpm --filter @nimloth-core/openehr-composer build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/openehr-composer
EXPOSE 3015
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -q --spider http://localhost:3015/composer/health || exit 1

CMD ["node", "dist/index.js"]
