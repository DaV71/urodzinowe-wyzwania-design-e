#!/usr/bin/env bash
# Biblioteka deployu (demo-deploy.md §4, SPEC §10). Sourcowana przez scripts/deploy.sh i tests/deploy-lib.test.sh.
# Sourcowanie nie ma efektów ubocznych poza definicją funkcji (i opcjami powłoki, które oba wywołujące i tak ustawiają).
# Generatory gen_remote_* wypisują na stdout fragmenty skryptu zdalnego wykonywanego na serwerze przez `bash -s`.
# Wartości z configu są walidowane (validate_config) i dodatkowo cytowane przez printf %q.
set -euo pipefail

# Sekrety losowane na serwerze i zachowywane między deployami: KLUCZ:długość.
# Tylko [A-Za-z0-9] — POSTGRES_PASSWORD trafia niekodowane do DATABASE_URL, PLAYER_TOKEN do ścieżki URL.
DEPLOY_SECRETS=(POSTGRES_PASSWORD:32 AUTH_SECRET:48 CODES_SECRET:32 PLAYER_TOKEN:32 ADMIN_PASSWORD:20)
# Sekrety, które można rotować przez `deploy.sh --set-secret KLUCZ`.
# POSTGRES_PASSWORD celowo poza listą: zmiana hasła istniejącej bazy wymaga ALTER USER.
DEPLOY_ROTATABLE="AUTH_SECRET CODES_SECRET PLAYER_TOKEN ADMIN_PASSWORD"
DEPLOY_CONFIG_KEYS="SERVER_HOST SSH_USER SSH_PORT SSH_KEY APP_DOMAIN REPO_URL REPO_BRANCH DEPLOY_DIR GIT_TOKEN HEALTH_TIMEOUT"

# --- Logowanie (stderr, żeby stdout --dry-run był czystym skryptem) ---
log() { printf '==> %s\n' "$*" >&2; }
ok() { printf 'OK: %s\n' "$*" >&2; }
warn() { printf 'UWAGA: %s\n' "$*" >&2; }
die() {
  printf 'BŁĄD: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "Brak polecenia '$cmd' — zainstaluj je i spróbuj ponownie."
  done
}

# --- Konfiguracja ---

# load_config FILE — czyta KLUCZ=wartość (bez wykonywania pliku jako kodu).
# Obsługuje komentarze (#), komentarze w linii po spacji, wartości w cudzysłowach i końce linii CRLF.
load_config() {
  local file=$1 line key val n=0
  local re_line='^[[:space:]]*(export[[:space:]]+)?([A-Z_][A-Z0-9_]*)=(.*)$'
  local re_dq='^"([^"]*)"[[:space:]]*(#.*)?$'
  local re_sq="^'([^']*)'[[:space:]]*(#.*)?\$"
  [ -f "$file" ] || die "Brak pliku konfiguracji: $file (skopiuj deploy.conf.example do deploy.conf i uzupełnij)."
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    line=${line%$'\r'}
    [[ $line =~ ^[[:space:]]*(#|$) ]] && continue
    [[ $line =~ $re_line ]] || die "$file:$n: niepoprawna linia (oczekiwano KLUCZ=wartość)."
    key=${BASH_REMATCH[2]}
    val=${BASH_REMATCH[3]}
    if [[ $val =~ $re_dq ]] || [[ $val =~ $re_sq ]]; then
      val=${BASH_REMATCH[1]}
    else
      [[ $val == \#* ]] && val=''
      val=${val%%[[:space:]]#*}
      val=${val#"${val%%[![:space:]]*}"}
      val=${val%"${val##*[![:space:]]}"}
    fi
    if [[ " $DEPLOY_CONFIG_KEYS " == *" $key "* ]]; then
      printf -v "$key" '%s' "$val"
    else
      warn "$file:$n: nieznany klucz $key — pomijam."
    fi
  done <"$file"
}

# validate_config — sprawdza wymagane klucze i format wartości, ustawia domyślne.
validate_config() {
  local key
  for key in SERVER_HOST SSH_USER APP_DOMAIN REPO_URL; do
    [ -n "${!key:-}" ] || die "Brak $key w konfiguracji (patrz deploy.conf.example)."
  done
  SSH_PORT=${SSH_PORT:-22}
  SSH_KEY=${SSH_KEY:-}
  REPO_BRANCH=${REPO_BRANCH:-main}
  DEPLOY_DIR=${DEPLOY_DIR:-urodzinowe}
  GIT_TOKEN=${GIT_TOKEN:-}
  HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-180}

  [[ $SERVER_HOST =~ ^[A-Za-z0-9.:-]+$ ]] || die "SERVER_HOST ma niedozwolone znaki: $SERVER_HOST"
  [[ $SSH_USER =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || die "SSH_USER ma niedozwolone znaki: $SSH_USER"
  if ! [[ $SSH_PORT =~ ^[0-9]+$ ]] || ((SSH_PORT < 1 || SSH_PORT > 65535)); then
    die "SSH_PORT musi być liczbą 1–65535: $SSH_PORT"
  fi
  [[ $APP_DOMAIN =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] ||
    die "APP_DOMAIN musi być nazwą domeny (np. urodziny.twojadomena.pl): $APP_DOMAIN"
  [[ $REPO_URL =~ ^(https://|ssh://|git@)[A-Za-z0-9@:/._~%+-]+$ ]] ||
    die "REPO_URL musi zaczynać się od https://, ssh:// lub git@ i nie zawierać znaków specjalnych: $REPO_URL"
  [[ -z ${GIT_TOKEN:-} || $REPO_URL == https://* ]] || die "GIT_TOKEN działa tylko z REPO_URL w postaci https://…"
  [[ $REPO_BRANCH =~ ^[A-Za-z0-9._/-]+$ && $REPO_BRANCH != -* ]] || die "REPO_BRANCH ma niedozwolone znaki: $REPO_BRANCH"
  [[ $DEPLOY_DIR =~ ^[A-Za-z0-9._-]+$ && $DEPLOY_DIR != . && $DEPLOY_DIR != .. ]] ||
    die "DEPLOY_DIR to nazwa katalogu względem \$HOME (bez '/' i '..'): $DEPLOY_DIR"
  [[ -z $GIT_TOKEN || $GIT_TOKEN =~ ^[A-Za-z0-9._~-]+$ ]] || die "GIT_TOKEN ma niedozwolone znaki."
  [[ $HEALTH_TIMEOUT =~ ^[0-9]+$ ]] || die "HEALTH_TIMEOUT musi być liczbą sekund: $HEALTH_TIMEOUT"
}

# inject_git_token URL TOKEN — URL https z tokenem. Skrypt zdalny go już nie używa (token idzie nagłówkiem
# http.extraHeader przez GIT_CONFIG_*, więc nie ma go w URL, argv ani .git/config); zostaje jako funkcja interfejsu.
inject_git_token() {
  local url=$1 token=${2:-}
  if [ -z "$token" ]; then
    printf '%s\n' "$url"
    return 0
  fi
  [[ $url == https://* ]] || die "GIT_TOKEN działa tylko z REPO_URL w postaci https://…"
  printf 'https://x-access-token:%s@%s\n' "$token" "${url#https://}"
}

# --- Sekrety i .env (funkcje wykonywane NA SERWERZE — wklejane do skryptu zdalnego przez `declare -f`) ---

# gen_secret DŁUGOŚĆ — losowy ciąg [A-Za-z0-9] z /dev/urandom (bez `head` na końcu potoku → bez SIGPIPE przy pipefail).
gen_secret() {
  local len=${1:-40} s=''
  while [ "${#s}" -lt "$len" ]; do
    s+=$(head -c $((len * 2)) /dev/urandom | base64 | LC_ALL=C tr -dc 'A-Za-z0-9')
  done
  printf '%s' "${s:0:len}"
}

# env_set KLUCZ WARTOŚĆ — ustawia/nadpisuje klucz w ./.env (awk → plik tymczasowy → mv, tryb 600).
env_set() {
  local tmp
  tmp=$(mktemp .env.XXXXXX)
  if ! ENV_KEY="$1" ENV_VAL="$2" awk '
      BEGIN { k = ENVIRON["ENV_KEY"]; v = ENVIRON["ENV_VAL"]; done = 0 }
      index($0, k "=") == 1 { if (!done) { print k "=" v; done = 1 }; next }
      { print }
      END { if (!done) print k "=" v }
    ' .env >"$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  chmod 600 "$tmp"
  mv -f "$tmp" .env
}

# env_set_if_missing KLUCZ DŁUGOŚĆ — losuje sekret tylko, gdy brak go w ./.env (redeploy nie zmienia sekretów).
env_set_if_missing() {
  if grep -q "^$1=." .env; then
    echo "  zachowano $1"
  else
    env_set "$1" "$(gen_secret "$2")"
    echo "  wygenerowano $1"
  fi
}

# --- Generatory skryptu zdalnego ---

# Nagłówek: opcje powłoki i helpery używane przez pozostałe fragmenty.
gen_remote_header() {
  cat <<'EOF'
#!/usr/bin/env bash
# Skrypt zdalny wygenerowany przez scripts/deploy.sh — wykonywany na serwerze przez `bash -s`.
# Idempotentny: kolejne uruchomienie aktualizuje kod i restartuje stack, zachowując .env i dane.
set -euo pipefail

rlog() { printf '\n==> %s\n' "$*"; }
rdie() {
  printf 'BŁĄD: %s\n' "$*" >&2
  exit 1
}
if [ "$(id -u)" -eq 0 ]; then
  as_root() { "$@"; }
else
  command -v sudo >/dev/null 2>&1 || rdie "Użytkownik nie jest rootem, a brak sudo."
  as_root() { sudo "$@"; }
fi
EOF
}

gen_remote_prereqs_script() {
  cat <<'EOF'

# --- 1. Prereqs: git, curl, Docker + plugin compose ---
rlog "Sprawdzam pakiety systemowe"
missing=()
for pkg in git curl; do
  command -v "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
done
if [ "${#missing[@]}" -gt 0 ]; then
  command -v apt-get >/dev/null 2>&1 || rdie "Brak: ${missing[*]} — zainstaluj ręcznie (brak apt-get)."
  as_root apt-get update -qq
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}"
fi
if ! command -v docker >/dev/null 2>&1; then
  rlog "Instaluję Dockera (oficjalny instalator get.docker.com)"
  curl -fsSL https://get.docker.com | as_root sh
fi
if ! docker info >/dev/null 2>&1; then
  if [ "$(id -u)" -ne 0 ]; then
    # Użytkownik spoza grupy docker — wołamy dockera przez sudo (sudo uruchamia binarkę, nie tę funkcję).
    # shellcheck disable=SC2032,SC2033
    docker() { sudo docker "$@"; }
  fi
  if ! docker info >/dev/null 2>&1 && command -v systemctl >/dev/null 2>&1; then
    as_root systemctl enable --now docker >/dev/null 2>&1 || true
  fi
fi
docker info >/dev/null 2>&1 || rdie "Docker nie odpowiada (sprawdź: systemctl status docker)."
docker compose version >/dev/null 2>&1 || rdie "Brak pluginu 'docker compose' (pakiet docker-compose-plugin)."
EOF
}

gen_remote_network_script() {
  cat <<'EOF'

# --- 2. Wspólna sieć `web` (proxy caddy-docker-proxy) ---
rlog "Sieć web"
docker network inspect web >/dev/null 2>&1 || docker network create web >/dev/null
EOF
}

# Używa REPO_URL, REPO_BRANCH, DEPLOY_DIR, GIT_TOKEN (po validate_config).
gen_remote_code_script() {
  cat <<'EOF'

# --- 3. Kod: clone przy pierwszym deployu, potem fetch + reset do gałęzi ---
rlog "Kod aplikacji"
export GIT_TERMINAL_PROMPT=0
EOF
  # shellcheck disable=SC2016 # $HOME rozwija się na serwerze
  printf 'APP_DIR="$HOME"/%q\n' "$DEPLOY_DIR"
  printf 'BRANCH=%q\n' "$REPO_BRANCH"
  printf 'REPO_URL=%q\n' "$REPO_URL"
  if [ -n "${GIT_TOKEN:-}" ]; then
    # Token tylko w środowisku procesu git (GIT_CONFIG_*, git >= 2.31): nie ma go w URL, argv ani .git/config.
    printf 'GIT_TOKEN=%q\n' "$GIT_TOKEN"
    cat <<'EOF'
read -r git_major git_minor < <(git version | sed -E 's/^git version ([0-9]+)\.([0-9]+).*/\1 \2/')
if [ "$git_major" -lt 2 ] || { [ "$git_major" -eq 2 ] && [ "$git_minor" -lt 31 ]; }; then
  rdie "GIT_TOKEN wymaga git >= 2.31 na serwerze (jest: $(git version))."
fi
git_remote() {
  local auth
  auth=$(printf 'x-access-token:%s' "$GIT_TOKEN" | base64 | tr -d '\n')
  GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic $auth" git "$@"
}
EOF
  else
    # shellcheck disable=SC2016 # rozwija się na serwerze
    echo 'git_remote() { git "$@"; }'
  fi
  cat <<'EOF'
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git_remote fetch --depth 1 -- "$REPO_URL" "$BRANCH"
  git reset --hard FETCH_HEAD
elif [ -e "$APP_DIR" ]; then
  rdie "$APP_DIR istnieje, ale nie jest repozytorium git — przenieś go i uruchom deploy ponownie."
else
  git_remote clone --depth 1 --branch "$BRANCH" -- "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi
unset GIT_TOKEN
EOF
  # origin zawsze bez tokenu — token nie zostaje w .git/config.
  printf 'git remote set-url origin %q\n' "$REPO_URL"
  # shellcheck disable=SC2016 # rozwija się na serwerze
  echo 'echo "Wersja: $(git log -1 --format="%h %s")"'
}

# validate_secret_value KLUCZ WARTOŚĆ — czy sekret może być ustawiony przez --set-secret (klucz i zestaw znaków).
# Używane w deploy.sh (przed połączeniem z serwerem) i w gen_remote_env_script.
validate_secret_value() {
  local key=$1 val=$2
  [ "$key" != POSTGRES_PASSWORD ] ||
    die "POSTGRES_PASSWORD nie może być zmieniony przez deploy — hasło istniejącej bazy wymaga ALTER USER."
  [[ " $DEPLOY_ROTATABLE " == *" $key "* ]] || die "Nieobsługiwany sekret: $key (dozwolone: $DEPLOY_ROTATABLE)."
  # Zestaw znaków bezpieczny w "…" basha i w .env docker compose (bez $, #, cudzysłowów, spacji).
  [[ $val =~ ^[A-Za-z0-9._~@%+=:,!^*-]+$ ]] ||
    die "Wartość $key zawiera niedozwolone znaki (dozwolone: A-Z a-z 0-9 . _ ~ @ % + = : , ! ^ * -)."
  if [ "$key" = PLAYER_TOKEN ]; then
    [[ $val =~ ^[A-Za-z0-9_-]+$ ]] || die "PLAYER_TOKEN trafia do linku — dozwolone tylko A-Z a-z 0-9 _ -."
  fi
}

# gen_remote_env_script APP_DOMAIN [KLUCZ=WARTOŚĆ…] — generuje/aktualizuje ./.env na serwerze.
# APP_DOMAIN zawsze z configu; sekrety losowane tylko, gdy ich brak. KLUCZ=WARTOŚĆ = rotacja (--set-secret).
gen_remote_env_script() {
  local domain=$1 pair key val entry
  shift
  local -a set_keys=() set_vals=()
  for pair in "$@"; do
    [[ $pair == *=* ]] || die "Oczekiwano KLUCZ=WARTOŚĆ: $pair"
    key=${pair%%=*}
    val=${pair#*=}
    validate_secret_value "$key" "$val"
    set_keys+=("$key")
    set_vals+=("$val")
  done

  cat <<'EOF'

# --- 4. .env: APP_DOMAIN z configu, sekrety losowane raz i zachowywane między deployami ---
echo "==> Plik .env"
EOF
  declare -f gen_secret env_set env_set_if_missing
  cat <<'EOF'
(umask 077 && touch .env)
chmod 600 .env
EOF
  printf 'env_set APP_DOMAIN "%s"\n' "$domain"
  for entry in "${DEPLOY_SECRETS[@]}"; do
    key=${entry%%:*}
    [[ " ${set_keys[*]-} " == *" $key "* ]] && continue
    printf 'env_set_if_missing %s %s\n' "$key" "${entry##*:}"
  done
  local i
  for ((i = 0; i < ${#set_keys[@]}; i++)); do
    printf 'env_set %s "%s"\n' "${set_keys[$i]}" "${set_vals[$i]}"
    printf 'echo "  ustawiono %s (--set-secret)"\n' "${set_keys[$i]}"
  done
  cat <<'EOF'
chmod 600 .env
EOF
  printf "echo \"ADMIN_PASSWORD i PLAYER_TOKEN: grep -E '^(ADMIN_PASSWORD|PLAYER_TOKEN)=' ~/%s/.env\"\n" "${DEPLOY_DIR:-urodzinowe}"
}

# gen_remote_secret_probe_script KLUCZ… — wypisuje (na serwerze) klucze, których brak w .env.
gen_remote_secret_probe_script() {
  local key
  echo 'set -euo pipefail'
  # shellcheck disable=SC2016 # $HOME rozwija się na serwerze
  printf 'if ! cd "$HOME"/%q 2>/dev/null || [ ! -f .env ]; then\n' "${DEPLOY_DIR:-urodzinowe}"
  for key in "$@"; do
    printf '  echo %s\n' "$key"
  done
  printf '  exit 0\nfi\n'
  for key in "$@"; do
    printf "grep -q '^%s=.' .env || echo %s\n" "$key" "$key"
  done
}

gen_remote_up_script() {
  cat <<'EOF'

# --- 5. Start: migracje i seed wykona CMD kontenera app (docker/entrypoint.sh), nie deploy ---
rlog "docker compose up"
[ -f docker-compose.prod.yml ] || rdie "Brak docker-compose.prod.yml w $(pwd)."
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
rlog "Stack uruchomiony"
EOF
}

# gen_remote_bootstrap_script [KLUCZ=WARTOŚĆ…] — kompletny skrypt zdalny (używa zmiennych configu).
# Całość w funkcji main + stdin z /dev/null: polecenia (apt, instalator Dockera) nie „zjedzą” reszty skryptu z `bash -s`.
gen_remote_bootstrap_script() {
  local env_part
  env_part=$(gen_remote_env_script "$APP_DOMAIN" "$@") || return 1
  gen_remote_header
  echo
  echo 'main() {'
  gen_remote_prereqs_script
  gen_remote_network_script
  gen_remote_code_script
  printf '%s\n' "$env_part"
  gen_remote_up_script
  echo '}'
  echo
  echo 'main "$@" </dev/null'
}

# wait_for_url URL DEADLINE_S INTERVAL_S — 0 gdy URL odpowie 2xx/3xx przed upływem DEADLINE_S sekund.
wait_for_url() {
  local url=$1 deadline=$2 interval=$3 end
  end=$((SECONDS + deadline))
  while :; do
    if curl -fsS -o /dev/null --max-time 10 "$url" 2>/dev/null; then
      return 0
    fi
    ((SECONDS < end)) || return 1
    printf '.' >&2
    sleep "$interval"
  done
}
