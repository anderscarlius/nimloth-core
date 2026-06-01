# syntax=docker/dockerfile:1.7
# KU Deploy — cohort-service körs co-locerat på CarliusFyra med core-db
# (nimloth-core docker-nät) och anropar aql-template-service via container-namn.
# Path A-konsekvens: tjänsten är fortfarande mockad i Atlas-fixturer, men
# deployen ger en sann backend att rikta XHR mot när Atlas väljer att gå live.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages ./packages
COPY services/cohort-service ./services/cohort-service

RUN pnpm install --filter @nimloth-core/cohort-service... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/cohort-service build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/cohort-service
EXPOSE 3020
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -q --spider http://localhost:3020/healthz || exit 1

CMD ["node", "dist/index.js"]
