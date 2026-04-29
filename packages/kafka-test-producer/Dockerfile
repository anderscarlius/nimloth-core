# syntax=docker/dockerfile:1.7
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/kafka-test-producer ./packages/kafka-test-producer

RUN pnpm install --filter @nimloth-core/kafka-test-producer... --frozen-lockfile=false
RUN pnpm --filter @nimloth-core/kafka-test-producer build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=builder /app ./
WORKDIR /app/packages/kafka-test-producer

ENTRYPOINT ["node", "dist/index.js"]
CMD ["fru-andersson"]
