# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/pdl-policy ./packages/pdl-policy
COPY services/consent ./services/consent

RUN pnpm install --filter @nimloth-core/consent... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/pdl-policy build
RUN pnpm --filter @nimloth-core/consent build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/consent
EXPOSE 11106
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:11106/health || exit 1

CMD ["node", "dist/index.js"]
