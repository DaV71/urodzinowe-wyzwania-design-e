#!/usr/bin/env bash
# Bezobsługowy, idempotentny deploy na wspólny serwer (demo-deploy.md §4, SPEC §10).
#
#   bash scripts/deploy.sh                          # pełny deploy z deploy.conf
#   bash scripts/deploy.sh --dry-run                # wypisz skrypt zdalny i zakończ (bez połączenia z serwerem)
#   bash scripts/deploy.sh --config <plik>          # alternatywny plik konfiguracji
#   bash scripts/deploy.sh --set-secret PLAYER_TOKEN   # rotacja sekretu (wartość z env lub wpisana ukryta)
#   bash scripts/deploy.sh --no-wait                # nie czekaj na https://$APP_DOMAIN/api/health
#
# Sekrety (POSTGRES_PASSWORD, AUTH_SECRET, CODES_SECRET, PLAYER_TOKEN, ADMIN_PASSWORD) losuje skrypt zdalny
# na serwerze i zachowuje przy kolejnych deployach. Zwykły deploy o nic nie pyta.
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=scripts/lib/deploy-lib.sh
source "$SCRIPT_DIR/lib/deploy-lib.sh"

usage() {
  sed -n '2,11p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

CONFIG="$ROOT/deploy.conf"
DRY_RUN=0
NO_WAIT=0
SECRET_KEYS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --no-wait) NO_WAIT=1 ;;
    --config)
      [ $# -ge 2 ] || die "--config wymaga ścieżki do pliku."
      CONFIG=$2
      shift
      ;;
    --set-secret)
      [ $# -ge 2 ] || die "--set-secret wymaga nazwy klucza (dozwolone: $DEPLOY_ROTATABLE)."
      key=$2
      shift
      if [ "$key" = POSTGRES_PASSWORD ]; then
        die "POSTGRES_PASSWORD nie da się zmienić przez deploy: baza już istnieje z dotychczasowym hasłem, zmiana wymaga ALTER USER w Postgresie (poza zakresem skryptu)."
      fi
      [[ " $DEPLOY_ROTATABLE " == *" $key "* ]] || die "Nieobsługiwany sekret: $key (dozwolone: $DEPLOY_ROTATABLE)."
      [[ " ${SECRET_KEYS[*]-} " == *" $key "* ]] || SECRET_KEYS+=("$key")
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *) die "Nieznana opcja: $1 (zobacz --help)." ;;
  esac
  shift
done

load_config "$CONFIG"
validate_config

# --- Dry-run: skrypt zdalny na stdout, placeholdery zamiast sekretów, bez połączenia z serwerem ---
if [ "$DRY_RUN" -eq 1 ]; then
  [ -z "$GIT_TOKEN" ] || GIT_TOKEN=__GIT_TOKEN__
  pairs=()
  for key in ${SECRET_KEYS[@]+"${SECRET_KEYS[@]}"}; do
    pairs+=("$key=__${key}__")
  done
  log "Dry-run: skrypt zdalny poniżej (nic nie zostało wysłane na serwer)."
  gen_remote_bootstrap_script ${pairs[@]+"${pairs[@]}"}
  exit 0
fi

require_cmd ssh curl

build_ssh_cmd

# --- --set-secret: wartość z lokalnego env (np. PLAYER_TOKEN=… bash scripts/deploy.sh …) albo wpisana ukryta ---
pairs=()
for key in ${SECRET_KEYS[@]+"${SECRET_KEYS[@]}"}; do
  value=${!key:-}
  if [ -z "$value" ]; then
    [ -t 0 ] || die "Brak wartości $key: ustaw zmienną środowiskową $key albo uruchom w terminalu."
    read -rs -p "Nowa wartość $key (nie będzie widoczna): " value
    echo >&2
  fi
  case "$key" in
    AUTH_SECRET) min=32 ;;
    ADMIN_PASSWORD) min=16 ;;
    *) min=16 ;;
  esac
  [ "${#value}" -ge "$min" ] || die "$key musi mieć co najmniej $min znaków."
  validate_secret_value "$key" "$value"
  pairs+=("$key=$value")
done

if [ "${#pairs[@]}" -gt 0 ]; then
  log "Sprawdzam, które sekrety już istnieją na serwerze"
  missing=$(gen_remote_secret_probe_script "${SECRET_KEYS[@]}" | "${SSH_CMD[@]}" 'bash -s') ||
    die "Nie udało się połączyć z $SSH_USER@$SERVER_HOST."
  for key in "${SECRET_KEYS[@]}"; do
    if grep -qx "$key" <<<"$missing"; then
      log "$key: brak w .env na serwerze — zostanie ustawiony."
    else
      warn "$key: rotacja — dotychczasowa wartość zostanie nadpisana."
      case "$key" in
        AUTH_SECRET) warn "Zmiana AUTH_SECRET wyloguje wszystkie sesje (admin i jubilat)." ;;
        CODES_SECRET) warn "Zmiana CODES_SECRET unieważni wydrukowane kody — wydrukuj je ponownie z panelu." ;;
        PLAYER_TOKEN) warn "Stary link startowy przestanie działać — nowy jest w panelu admina." ;;
      esac
    fi
  done
fi

# --- Deploy ---
log "Deploy na $SSH_USER@$SERVER_HOST (katalog ~/$DEPLOY_DIR, gałąź $REPO_BRANCH)"
gen_remote_bootstrap_script ${pairs[@]+"${pairs[@]}"} | "${SSH_CMD[@]}" 'bash -s' ||
  die "Skrypt zdalny zakończył się błędem (szczegóły powyżej)."
ok "Skrypt zdalny wykonany."

if [ "$NO_WAIT" -eq 0 ]; then
  url="https://$APP_DOMAIN/api/health"
  log "Czekam aż $url odpowie (maks. ${HEALTH_TIMEOUT}s — migracje i seed w kontenerze)"
  if ! wait_for_url "$url" "$HEALTH_TIMEOUT" 5; then
    echo >&2
    warn "$url nie odpowiada po ${HEALTH_TIMEOUT}s. Diagnostyka:"
    if command -v getent >/dev/null 2>&1; then
      getent hosts "$APP_DOMAIN" >&2 || warn "DNS: $APP_DOMAIN się nie rozwiązuje — sprawdź rekord A/CNAME na $SERVER_HOST."
    elif command -v nslookup >/dev/null 2>&1; then
      nslookup "$APP_DOMAIN" >&2 2>&1 || warn "DNS: $APP_DOMAIN się nie rozwiązuje — sprawdź rekord A/CNAME na $SERVER_HOST."
    fi
    log "Stan i ostatnie logi kontenera urodzinowe:"
    # shellcheck disable=SC2016 # $D rozwija się na serwerze
    "${SSH_CMD[@]}" 'D=docker; docker info >/dev/null 2>&1 || D="sudo docker"; $D ps -a --filter name=urodzinowe; $D logs --tail 60 urodzinowe' >&2 ||
      warn "Nie udało się pobrać logów kontenera."
    warn "Sprawdź też wspólny proxy (sieć web): $SSH_HINT 'docker ps --filter network=web' i logi kontenera proxy."
    warn "Certyfikat: APP_DOMAIN musi być objęty wildcardem wgranym do proxy."
    exit 1
  fi
  echo >&2
  ok "Aplikacja odpowiada: $url"
fi

cat >&2 <<EOF

Gotowe.
  Panel admina:      https://$APP_DOMAIN/admin
  Link startowy:     https://$APP_DOMAIN/start/<PLAYER_TOKEN>  (pełny link jest też w panelu admina)
  Odczyt ADMIN_PASSWORD i PLAYER_TOKEN (sekrety nie są wypisywane przez deploy):
    $SSH_HINT "grep -E '^(ADMIN_PASSWORD|PLAYER_TOKEN)=' ~/$DEPLOY_DIR/.env"
EOF
