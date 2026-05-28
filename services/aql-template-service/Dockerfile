# syntax=docker/dockerfile:1.7
# Co-location (Fas 3 AC1): körs på cf4 bredvid ehrbase-core så service→EHRbase
# blir loopback (docker-nät 'core'), inte ett LAN-hopp. Intern co-location —
# ingen publik tunnel (mock-auth-skulden gatar fortfarande publik exponering).
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY services/aql-template-service ./services/aql-template-service

RUN pnpm install --filter @nimloth-core/aql-template-service... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/aql-template-service build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -S nodeapp && adduser -S -G nodeapp nodeapp
COPY --from=builder --chown=nodeapp:nodeapp /app ./

USER nodeapp
WORKDIR /app/services/aql-template-service
EXPOSE 3010
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=10 \
  CMD wget -q --spider http://localhost:3010/health || exit 1

CMD ["node", "dist/index.js"]
