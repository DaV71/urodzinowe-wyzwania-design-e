#!/usr/bin/env bash
# Smoke test obrazu i compose produkcyjnego: bash tests/docker-smoke.sh
# 1) asercje statyczne docker-compose.prod.yml (bez ports:, db tylko w internal),
# 2) build + start stacku z losowym .env w katalogu tymczasowym (lokalny .env projektu nietknięty),
# 3) czekanie na `healthy`, żądania z wnętrza kontenera, logi entrypointu, restart (idempotencja migracji/seeda),
# 4) sprzątanie przez trap: down -v + obraz testowy; sieć `web` usuwana tylko, jeśli test ją utworzył.
# Osobny projekt compose (-p) i nazwa kontenera — test nie rusza produkcyjnego stacku `urodzinowe`.
set -euo pipefail

cd "$(dirname "$0")/.."

PROJECT=urodzinowe-smoke
CONTAINER=urodzinowe-smoke
PROD=docker-compose.prod.yml
TIMEOUT="${SMOKE_TIMEOUT:-90}"

# Git Bash na Windows przepisuje argumenty wyglądające jak ścieżki — wyłączamy to tylko dla docker exec
# (globalnie zepsułoby ścieżkę --env-file do katalogu tymczasowego).
dexec() { MSYS_NO_PATHCONV=1 docker exec "$@"; }

fail() { echo "BŁĄD: $*" >&2; exit 1; }
ok() { echo "OK: $*"; }

# --- 1. Asercje statyczne ---
grep -Eq '^[[:space:]]*ports:' "$PROD" && fail "$PROD zawiera ports: — ruch ma iść wyłącznie przez proxy"
db_block=$(awk '/^  db:/{f=1; next} f && /^  [^ #]/{f=0} f' "$PROD")
[ -n "$db_block" ] || fail "nie znaleziono usługi db w $PROD"
grep -q 'web' <<<"$db_block" && fail "usługa db jest podłączona do sieci web"
grep -q 'networks: \[internal\]' <<<"$db_block" || fail "usługa db musi być tylko w sieci internal"
ok "asercje statyczne $PROD"

# --- 2. Środowisko testowe ---
command -v docker >/dev/null || fail "brak dockera"
TMP=$(mktemp -d)
created_web=0
COMPOSE=(docker compose -p "$PROJECT" --env-file "$TMP/.env" -f "$PROD" -f tests/compose.smoke.yml)

cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ -f "$TMP/.env" ]; then
    echo "--- logi app (ostatnie 80 linii) ---" >&2
    "${COMPOSE[@]}" logs --no-color --tail 80 app >&2 || true
  fi
  if [ -f "$TMP/.env" ]; then "${COMPOSE[@]}" down -v --rmi local --remove-orphans >/dev/null 2>&1 || true; fi
  if [ "$created_web" -eq 1 ]; then docker network rm web >/dev/null 2>&1 || true; fi
  rm -rf "$TMP"
  exit "$status"
}
trap cleanup EXIT

if ! docker network inspect web >/dev/null 2>&1; then
  docker network create web >/dev/null
  created_web=1
fi

rnd() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
cat >"$TMP/.env" <<EOF
APP_DOMAIN=smoke.localhost
POSTGRES_PASSWORD=$(rnd 16)
AUTH_SECRET=$(rnd 32)
CODES_SECRET=$(rnd 16)
PLAYER_TOKEN=$(rnd 16)
ADMIN_PASSWORD=$(rnd 8)
EOF

# --- 3. Build + start ---
"${COMPOSE[@]}" up -d --build

wait_healthy() {
  local deadline=$((SECONDS + TIMEOUT)) status
  while :; do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null || echo brak)
    [ "$status" = healthy ] && return 0
    [ "$status" = unhealthy ] && fail "kontener $CONTAINER jest unhealthy"
    [ "$SECONDS" -ge "$deadline" ] && fail "kontener $CONTAINER nie jest healthy po ${TIMEOUT} s (status: $status)"
    sleep 3
  done
}
wait_healthy
ok "kontener $CONTAINER healthy"

http_status() {
  dexec "$CONTAINER" node -e \
    "fetch('http://localhost:3000$1',{redirect:'manual'}).then(r=>console.log(r.status)).catch(e=>{console.error(e);process.exit(1)})"
}
for path in /api/health /; do
  code=$(http_status "$path")
  [ "$code" = 200 ] || fail "GET $path zwrócił $code (oczekiwano 200)"
  ok "GET $path → 200"
done

logs=$(docker logs "$CONTAINER" 2>&1)
grep -q 'Migracje' <<<"$logs" || fail "brak kroku migracji w logach"
grep -Eq 'migrations? (have been successfully applied|found in prisma/migrations)|No pending migrations' <<<"$logs" \
  || fail "migracje nie zakończyły się sukcesem"
grep -q 'Seed: 28 zadań' <<<"$logs" || fail "seed nie zakończył się sukcesem"
grep -q 'Start' <<<"$logs" || fail "serwer nie wystartował"
ok "logi entrypointu: migracje + seed + start"
echo "--- logi entrypointu ---"; sed 's/^/  | /' <<<"$logs" | head -20

dexec "$CONTAINER" sh -c 'touch "$UPLOAD_DIR/.smoke" && rm "$UPLOAD_DIR/.smoke"' || fail "UPLOAD_DIR niezapisywalny"
ok "UPLOAD_DIR zapisywalny dla użytkownika $(dexec "$CONTAINER" id -un)"

# --- 4. Restart: migracje i seed muszą być idempotentne ---
docker restart "$CONTAINER" >/dev/null
sleep 2
wait_healthy
[ "$(docker logs "$CONTAINER" 2>&1 | grep -c 'Seed: 28 zadań')" -ge 2 ] || fail "seed nie przeszedł ponownie po restarcie"
ok "restart: ponowne migracje + seed bez błędów"

echo "SMOKE TEST OK"
