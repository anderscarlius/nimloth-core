# syntax=docker/dockerfile:1.7
# Samma monorepo-byggmönster som services/migration-gateway/Dockerfile,
# plus git installerat i runtime-steget eftersom servern shell:ar ut till
# git för intake-flödet (server/git.ts) -- ingen annan tjänst i detta
# repo behöver det.

FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml ./
COPY pnpm-lock.yaml* ./
COPY tools/smedjan-console ./tools/smedjan-console

RUN pnpm install --filter @nimloth-core/smedjan-console... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/smedjan-console build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
RUN apk add --no-cache git
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

WORKDIR /app/tools/smedjan-console
RUN chmod +x docker-entrypoint.sh

# Repo-klonen (SMEDJAN_REPO_ROOT) ska mountas som en volym, t.ex. /data/repo
# -- se deploy/core-slice/docker-compose.smedjan-console.yml. Katalogen
# måste vara skrivbar av nodeapp.
RUN mkdir -p /data/repo && chown nodeapp:nodeapp /data/repo

USER nodeapp
EXPOSE 11125
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -qO- http://127.0.0.1:11125/api/tree > /dev/null || exit 1

ENTRYPOINT ["./docker-entrypoint.sh"]
