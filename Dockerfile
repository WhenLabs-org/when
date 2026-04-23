FROM node:20-slim AS builder

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.0.0 --activate

WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ packages/

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @whenlabs/when... build
RUN pnpm --filter @whenlabs/when deploy --prod /deploy

FROM node:20-slim

WORKDIR /app

RUN useradd --system --no-create-home --home-dir /app appuser

COPY --from=builder --chown=appuser:appuser /deploy ./

USER appuser

ENTRYPOINT ["node", "dist/mcp.js"]
