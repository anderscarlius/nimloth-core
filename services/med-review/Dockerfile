# syntax=docker/dockerfile:1.7
# Co-location (Fas 3): körs på cf4 bredvid aql-template-service + ehrbase så
# agent→aql→EHRbase blir loopback (docker-nät 'core'). LLM-syntesen anropar
# Anthropic över internet (kräver ANTHROPIC_API_KEY i env).
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY services/med-review ./services/med-review

RUN pnpm install --filter @nimloth-core/med-review... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/med-review build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/med-review
EXPOSE 3011
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -q --spider http://localhost:3011/health || exit 1

CMD ["node", "dist/index.js"]
