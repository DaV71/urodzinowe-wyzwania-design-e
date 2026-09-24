#!/bin/sh
# Start kontenera app: migracje (idempotentne) → seed (idempotentny UPSERT) → serwer Next.
# NODE_PATH tylko dla narzędzi: prisma.config.ts (import "dotenv/config", "prisma/config") i seed.cjs (pg)
# rozwiązują moduły z /app/tools/node_modules — standalone Next ich nie zawiera. Serwer startuje bez NODE_PATH.
set -eu
TOOLS=/app/tools/node_modules
[ -w "$UPLOAD_DIR" ] || { echo "Katalog $UPLOAD_DIR nie jest zapisywalny" >&2; exit 1; }
echo "Migracje…"; NODE_PATH=$TOOLS node "$TOOLS/prisma/build/index.js" migrate deploy
echo "Seed…";     NODE_PATH=$TOOLS node prisma/seed.cjs
echo "Start…";    exec node server.js
