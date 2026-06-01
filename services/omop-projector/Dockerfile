# syntax=docker/dockerfile:1.7
# KU Deploy — omop-projector är en CLI (engångskörning per re-projektering),
# inte en HTTP-tjänst. Imagen distribueras så NAS:en kan köra
#   docker-compose run --rm omop-projector --patient ingrid-andersson-syn-001 --no-migrate
# utan att kräva Mac-anslutning för rutinarbete.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages ./packages
COPY services/omop-projector ./services/omop-projector

RUN pnpm install --filter @nimloth-core/omop-projector... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/omop-projector build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/omop-projector

# Default-entrypoint: visa hjälpen. Avsedd användning:
#   docker-compose run --rm omop-projector --patient <id> [--reset] [--no-migrate]
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
