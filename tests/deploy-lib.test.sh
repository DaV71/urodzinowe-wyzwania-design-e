#!/usr/bin/env bash
# Testy scripts/lib/deploy-lib.sh i `scripts/deploy.sh --dry-run`: bash tests/deploy-lib.test.sh
# Bez serwera i bez sieci: generatory skryptu zdalnego sprawdzamy jako tekst (+ `bash -n`),
# a fragment `.env` uruchamiamy lokalnie w katalogu tymczasowym. Działa w Git Bash (Windows) i w Linuxie.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT=$(pwd)
LIB="$ROOT/scripts/lib/deploy-lib.sh"
FIXTURE="tests/fixtures/deploy.conf"

PASSED=0
FAILED=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass() { PASSED=$((PASSED + 1)); echo "  ok   $1"; }
fail() { FAILED=$((FAILED + 1)); echo "  FAIL $1" >&2; }

# assert_contains OPIS TEKST WZORZEC — dosłowne (nie regex) wyszukiwanie podciągu.
assert_contains() {
  if [[ "$2" == *"$3"* ]]; then pass "$1"; else fail "$1 — brak: $3"; fi
}
assert_not_contains() {
  if [[ "$2" != *"$3"* ]]; then pass "$1"; else fail "$1 — nie powinno zawierać: $3"; fi
}
assert_eq() {
  if [ "$2" == "$3" ]; then pass "$1"; else fail "$1 — oczekiwano '$3', jest '$2'"; fi
}
assert_ne() {
  if [ "$2" != "$3" ]; then pass "$1"; else fail "$1 — wartości nie powinny być równe ('$2')"; fi
}
# assert_fails OPIS KOMENDA… — komenda (w podpowłoce) musi zakończyć się kodem != 0.
assert_fails() {
  local desc=$1
  shift
  if ("$@") >/dev/null 2>&1; then fail "$desc — komenda nie zawiodła"; else pass "$desc"; fi
}
# assert_bash_syntax OPIS TEKST — tekst musi być poprawnym skryptem bash (`bash -n`).
assert_bash_syntax() {
  local f="$TMP/syntax.sh" out
  printf '%s\n' "$2" >"$f"
  if out=$(bash -n "$f" 2>&1); then pass "$1"; else fail "$1 — bash -n: $out"; fi
}
env_value() { grep "^$2=" "$1" | head -n 1 | cut -d= -f2-; }

if [ ! -f "$LIB" ]; then
  echo "BŁĄD: brak $LIB" >&2
  exit 1
fi
# shellcheck source=scripts/lib/deploy-lib.sh
source "$LIB"

# Kompletna konfiguracja testowa (każdy test w podpowłoce może ją nadpisać).
# shellcheck disable=SC2034 # zmienne czytane przez funkcje biblioteki
set_test_config() {
  SERVER_HOST=203.0.113.10
  SSH_USER=deploy
  SSH_PORT=
  SSH_KEY=
  APP_DOMAIN=app.example.pl
  REPO_URL=https://github.com/przyklad/urodzinowe.git
  REPO_BRANCH=
  DEPLOY_DIR=
  GIT_TOKEN=
  HEALTH_TIMEOUT=
}

echo "1. load_config / validate_config"
assert_fails "validate_config bez SERVER_HOST → die" bash -c "
  source '$LIB'
  SSH_USER=deploy APP_DOMAIN=app.example.pl REPO_URL=https://github.com/x/y.git
  SERVER_HOST=
  validate_config"
out=$(set_test_config && validate_config && echo "$SSH_PORT|$REPO_BRANCH|$DEPLOY_DIR|$HEALTH_TIMEOUT")
assert_eq "komplet → domyślne SSH_PORT/REPO_BRANCH/DEPLOY_DIR/HEALTH_TIMEOUT" "$out" "22|main|urodzinowe|180"
assert_fails "validate_config odrzuca DEPLOY_DIR ze ścieżką" bash -c "
  source '$LIB'
  SERVER_HOST=h SSH_USER=u APP_DOMAIN=app.example.pl REPO_URL=https://x/y.git DEPLOY_DIR=../etc
  validate_config"
assert_fails "validate_config odrzuca APP_DOMAIN ze znakami specjalnymi" bash -c "
  source '$LIB'
  SERVER_HOST=h SSH_USER=u APP_DOMAIN='app.example.pl; rm -rf /' REPO_URL=https://x/y.git
  validate_config"
out=$(load_config "$FIXTURE" && echo "$SERVER_HOST|$SSH_PORT|$SSH_KEY|$APP_DOMAIN|$GIT_TOKEN")
assert_eq "load_config czyta fixture (komentarze w linii, puste wartości)" "$out" \
  "203.0.113.10|2222||app.example.pl|token-testowy"
assert_fails "load_config bez pliku → die" bash -c "source '$LIB'; load_config '$TMP/brak.conf'"

echo "2. inject_git_token / gen_remote_code_script"
out=$(inject_git_token "https://github.com/przyklad/urodzinowe.git" "tok123")
assert_contains "inject_git_token wstawia token do URL" "$out" "tok123@github.com/przyklad/urodzinowe.git"
assert_eq "inject_git_token bez tokenu zwraca URL bez zmian" \
  "$(inject_git_token "https://github.com/przyklad/urodzinowe.git" "")" "https://github.com/przyklad/urodzinowe.git"
code=$(set_test_config && GIT_TOKEN=tok123 && validate_config && gen_remote_code_script)
seturl=$(grep 'git remote set-url origin' <<<"$code" || true)
assert_contains "gen_remote_code_script ustawia origin" "$seturl" "git remote set-url origin"
assert_contains "origin wskazuje na REPO_URL" "$seturl" "https://github.com/przyklad/urodzinowe.git"
assert_not_contains "origin bez tokenu" "$seturl" "tok123"
assert_contains "kod: git clone --depth 1 --branch" "$code" "git clone --depth 1 --branch"
assert_contains "kod: reset do FETCH_HEAD" "$code" "git reset --hard FETCH_HEAD"

echo "3. gen_remote_env_script"
env_script=$(gen_remote_env_script app.example.pl)
assert_contains "env: chmod 600 .env" "$env_script" "chmod 600 .env"
assert_contains "env: env_set APP_DOMAIN" "$env_script" "env_set APP_DOMAIN"
for key in POSTGRES_PASSWORD AUTH_SECRET CODES_SECRET PLAYER_TOKEN ADMIN_PASSWORD; do
  assert_contains "env: env_set_if_missing $key" "$env_script" "env_set_if_missing $key"
done
assert_contains "env: wypisuje jak odczytać ADMIN_PASSWORD i PLAYER_TOKEN" "$env_script" \
  "grep -E '^(ADMIN_PASSWORD|PLAYER_TOKEN)=' ~/urodzinowe/.env"
rot=$(export ADMIN_PASSWORD=sekret-testowy && gen_remote_env_script app.example.pl ADMIN_PASSWORD=__PLACEHOLDER__)
assert_contains "set-secret: env_set ADMIN_PASSWORD \"__PLACEHOLDER__\"" "$rot" 'env_set ADMIN_PASSWORD "__PLACEHOLDER__"'
assert_not_contains "set-secret: nie czyta wartości z lokalnego env" "$rot" "sekret-testowy"
assert_not_contains "set-secret: rotowany klucz nie jest losowany" "$rot" "env_set_if_missing ADMIN_PASSWORD"
assert_fails "gen_remote_env_script odrzuca POSTGRES_PASSWORD=…" bash -c "
  source '$LIB'; gen_remote_env_script app.example.pl POSTGRES_PASSWORD=abc"
assert_fails "gen_remote_env_script odrzuca wartość z cudzysłowem/\$" bash -c "
  source '$LIB'; gen_remote_env_script app.example.pl 'ADMIN_PASSWORD=a\"\$(id)'"
assert_bash_syntax "env: bash -n" "$env_script"

echo "3a. gen_secret"
for len in 20 32 48; do
  s=$(gen_secret "$len")
  assert_eq "gen_secret $len — długość" "${#s}" "$len"
  if [[ $s =~ ^[A-Za-z0-9]+$ ]]; then pass "gen_secret $len — tylko [A-Za-z0-9]"; else fail "gen_secret $len — znaki spoza [A-Za-z0-9]: $s"; fi
done
assert_ne "gen_secret daje różne wartości" "$(gen_secret 32)" "$(gen_secret 32)"

echo "3b. skrypt .env uruchomiony lokalnie (dwukrotnie)"
work="$TMP/serwer"
mkdir -p "$work"
(cd "$work" && gen_remote_env_script app.example.pl | bash >/dev/null)
first=$(cat "$work/.env")
assert_eq "APP_DOMAIN zapisany" "$(env_value "$work/.env" APP_DOMAIN)" "app.example.pl"
for key in POSTGRES_PASSWORD:32 AUTH_SECRET:48 CODES_SECRET:32 PLAYER_TOKEN:32 ADMIN_PASSWORD:20; do
  v=$(env_value "$work/.env" "${key%%:*}")
  assert_eq "${key%%:*} wygenerowany (długość ${key##*:})" "${#v}" "${key##*:}"
done
case "$(uname -s)" in
  MINGW* | MSYS* | CYGWIN*) echo "  pomijam sprawdzanie trybu 600 (Windows)" ;;
  *)
    mode=$(stat -c '%a' "$work/.env" 2>/dev/null || stat -f '%Lp' "$work/.env")
    assert_eq ".env ma tryb 600" "$mode" "600"
    ;;
esac
(cd "$work" && gen_remote_env_script nowa.example.pl | bash >/dev/null)
assert_eq "redeploy: APP_DOMAIN nadpisany z configu" "$(env_value "$work/.env" APP_DOMAIN)" "nowa.example.pl"
assert_eq "redeploy: sekrety zachowane" "$(grep -v '^APP_DOMAIN=' "$work/.env")" "$(grep -v '^APP_DOMAIN=' <<<"$first")"
assert_eq "redeploy: brak zdublowanych kluczy" "$(cut -d= -f1 "$work/.env" | sort | uniq -d)" ""
old_pg=$(env_value "$work/.env" POSTGRES_PASSWORD)
(cd "$work" && gen_remote_env_script nowa.example.pl ADMIN_PASSWORD=NoweHaslo123 | bash >/dev/null)
assert_eq "set-secret: ADMIN_PASSWORD zmieniony" "$(env_value "$work/.env" ADMIN_PASSWORD)" "NoweHaslo123"
assert_eq "set-secret: POSTGRES_PASSWORD bez zmian" "$(env_value "$work/.env" POSTGRES_PASSWORD)" "$old_pg"
assert_eq "set-secret: brak plików tymczasowych" "$(find "$work" -name '.env.*' | wc -l | tr -d ' ')" "0"

echo "4. gen_remote_bootstrap_script"
# shellcheck disable=SC2119 # bez rotacji sekretów — celowo bez argumentów
boot=$(set_test_config && validate_config && gen_remote_bootstrap_script)
assert_bash_syntax "bootstrap: bash -n" "$boot"
assert_contains "bootstrap: set -euo pipefail" "$boot" "set -euo pipefail"
assert_contains "bootstrap: docker network create web" "$boot" "docker network create web"
assert_contains "bootstrap: up -d --build" "$boot" "up -d --build"
assert_contains "bootstrap: compose produkcyjny" "$boot" "docker-compose.prod.yml"
assert_not_contains "bootstrap: bez prisma migrate" "$boot" "prisma migrate"
assert_not_contains "bootstrap: bez seeda z hosta" "$boot" "prisma db seed"

echo "5. deploy.sh --dry-run"
if dry=$(bash scripts/deploy.sh --dry-run --config "$FIXTURE" 2>&1); then pass "dry-run: exit 0"; else fail "dry-run: exit != 0: $dry"; fi
assert_contains "dry-run: set -euo pipefail" "$dry" "set -euo pipefail"
assert_contains "dry-run: app.example.pl" "$dry" "app.example.pl"
assert_not_contains "dry-run: bez ssh" "$dry" "ssh "
assert_not_contains "dry-run: bez prawdziwego GIT_TOKEN" "$dry" "token-testowy"
assert_contains "dry-run: placeholder GIT_TOKEN" "$dry" "__GIT_TOKEN__"
assert_bash_syntax "dry-run: skrypt zdalny przechodzi bash -n" "$(bash scripts/deploy.sh --dry-run --config "$FIXTURE" 2>/dev/null)"
dry_rot=$(ADMIN_PASSWORD=sekret-testowy bash scripts/deploy.sh --dry-run --config "$FIXTURE" --set-secret ADMIN_PASSWORD </dev/null 2>&1) || true
assert_contains "dry-run --set-secret: placeholder" "$dry_rot" 'env_set ADMIN_PASSWORD "__ADMIN_PASSWORD__"'
assert_not_contains "dry-run --set-secret: bez prawdziwej wartości" "$dry_rot" "sekret-testowy"
assert_fails "--set-secret POSTGRES_PASSWORD odrzucony" bash scripts/deploy.sh --dry-run --config "$FIXTURE" --set-secret POSTGRES_PASSWORD
pg_msg=$(bash scripts/deploy.sh --dry-run --config "$FIXTURE" --set-secret POSTGRES_PASSWORD 2>&1 || true)
assert_contains "--set-secret POSTGRES_PASSWORD: komunikat o ALTER USER" "$pg_msg" "ALTER USER"
assert_fails "--set-secret nieznanego klucza odrzucony" bash scripts/deploy.sh --dry-run --config "$FIXTURE" --set-secret FOO
assert_fails "nieznana opcja odrzucona" bash scripts/deploy.sh --dry-run --config "$FIXTURE" --bzdura
assert_fails "brak pliku configu → błąd" bash scripts/deploy.sh --dry-run --config "$TMP/brak.conf"

echo "6. gen_remote_secret_probe_script"
probe=$(set_test_config && validate_config && gen_remote_secret_probe_script ADMIN_PASSWORD PLAYER_TOKEN)
assert_contains "probe: ADMIN_PASSWORD" "$probe" "grep -q '^ADMIN_PASSWORD=' .env || echo ADMIN_PASSWORD"
assert_contains "probe: PLAYER_TOKEN" "$probe" "grep -q '^PLAYER_TOKEN=' .env || echo PLAYER_TOKEN"
assert_bash_syntax "probe: bash -n" "$probe"

echo "7. wait_for_url"
if command -v curl >/dev/null; then
  assert_fails "wait_for_url na zamkniętym porcie → timeout" wait_for_url "http://127.0.0.1:9/" 1 1
else
  echo "  pomijam (brak curl)"
fi

echo
echo "Wynik: $PASSED ok, $FAILED błędów"
[ "$FAILED" -eq 0 ]
