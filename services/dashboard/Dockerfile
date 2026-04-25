# syntax=docker/dockerfile:1.7
# Vite dev-server för demo. För prod-deploy bygg med `pnpm build` och servera via nginx.
FROM --platform=$BUILDPLATFORM node:20-alpine AS runtime
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY services/dashboard ./services/dashboard

# Dashboard har inga workspace-deps (använder egna types.ts, inte @nimloth-core/shared).
RUN pnpm install --filter @nimloth-core/dashboard --frozen-lockfile=false

WORKDIR /app/services/dashboard
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["pnpm", "dev"]
