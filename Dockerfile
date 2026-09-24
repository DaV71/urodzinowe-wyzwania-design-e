# Obraz produkcyjny: base → deps → build → prisma-cli → runtime (wzorzec z demo-deploy.md, SPEC §10).
# Migracje + seed + start serwera robi docker/entrypoint.sh przy starcie kontenera.

FROM node:24-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# --- zależności (bez postinstall: `prisma generate` robimy jawnie w stage build) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund

# --- build Next.js (output: standalone) ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Atrapy WYŁĄCZNIE na czas builda: prisma.config.ts (env("DATABASE_URL")) i src/lib/env.ts
# (getEnv() przy imporcie src/lib/db.ts) wymagają kompletu 7 zmiennych w „Collecting page data”.
# Ustawione inline w RUN (nie przez ENV) — nie zostają w konfiguracji żadnego obrazu, nie trafiają do runtime.
# `mkdir -p public` — repo nie ma katalogu public/, a runtime go kopiuje.
RUN export DATABASE_URL=postgresql://build:build@localhost:5432/build \
      AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
      CODES_SECRET=xxxxxxxxxxxxxxxx \
      PLAYER_TOKEN=xxxxxxxxxxxxxxxx \
      ADMIN_PASSWORD=xxxxxxxxxxxxxxxx \
      APP_URL=http://localhost:3000 \
      UPLOAD_DIR=/tmp/uploads \
 && npx prisma generate \
 && npm run build \
 && mkdir -p public

# --- samodzielne CLI Prisma (+ pg dla seeda, dotenv dla prisma.config.ts) w wersjach z package-lock.json ---
FROM base AS prisma-cli
WORKDIR /tools
COPY package-lock.json /tmp/package-lock.json
RUN v() { node -p "require('/tmp/package-lock.json').packages['node_modules/$1'].version"; } \
 && npm init -y >/dev/null \
 && npm install --omit=dev --no-audit --no-fund "prisma@$(v prisma)" "dotenv@$(v dotenv)" "pg@$(v pg)"

# --- runtime ---
FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/data/uploads
# --chown zamiast `chown -R /app` po fakcie (to duplikowało całą warstwę i trwało ~70 s).
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/.next/standalone ./
COPY --chown=node:node --from=build /app/.next/static ./.next/static
COPY --chown=node:node --from=build /app/prisma ./prisma
COPY --chown=node:node --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --chown=node:node --from=prisma-cli /tools/node_modules ./tools/node_modules
COPY --chown=node:node docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh \
 && mkdir -p /data/uploads \
 && chown -R node:node /data \
 && chown node:node /app
USER node
EXPOSE 3000
CMD ["./entrypoint.sh"]
