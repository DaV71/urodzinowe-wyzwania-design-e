#!/usr/bin/env bash
# Kopia zapasowa produkcji (SPEC §10): baza (pg_dump -Fc) + wolumen zdjęć urodzinowe_uploads, pobrane przez SSH na ten komputer.
#
#   bash scripts/backup.sh                        # kopia do backups/ (ignorowany przez git)
#   bash scripts/backup.sh --dry-run              # wypisz skrypty zdalne i zakończ (bez połączenia z serwerem)
#   bash scripts/backup.sh --config <plik>        # alternatywny plik konfiguracji (domyślnie deploy.conf)
#   bash scripts/backup.sh --output-dir <katalog> # inny katalog docelowy
#
# Wynik: backups/db-YYYYMMDD-HHMMSS.dump i backups/uploads-YYYYMMDD-HHMMSS.tgz. Pliki powstają w katalogu
# tymczasowym i są przenoszone dopiero, gdy oba zrzuty się udały (brak pustych/uciętych kopii po błędzie).
#
# RESTORE (na serwerze, w ~/urodzinowe; `sudo docker`, jeśli użytkownik nie jest w grupie docker):
#   scp -P <port> backups/db-<ts>.dump backups/uploads-<ts>.tgz <user>@<host>:/tmp/
#   cd ~/urodzinowe
#   docker compose -f docker-compose.prod.yml stop app
#   docker compose -f docker-compose.prod.yml exec -T db \
#     sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' </tmp/db-<ts>.dump
#   docker run --rm -i -v urodzinowe_uploads:/data alpine:3 \
#     sh -c 'find /data -mindepth 1 -delete && tar xzf - -C /data && chown -R 1000:1000 /data' </tmp/uploads-<ts>.tgz
#   docker compose -f docker-compose.prod.yml start app
# (1000:1000 = użytkownik `node` z obrazu aplikacji. Zmienne $POSTGRES_* rozwija powłoka w kontenerze db.)
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
# shellcheck source=scripts/lib/deploy-lib.sh
source "$SCRIPT_DIR/lib/deploy-lib.sh"

UPLOADS_VOLUME=urodzinowe_uploads # nazwa projektu compose (`name: urodzinowe`) + wolumen `uploads`

usage() {
  sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

CONFIG="$ROOT/deploy.conf"
OUT_DIR="$ROOT/backups"
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --config)
      [ $# -ge 2 ] || die "--config wymaga ścieżki do pliku."
      CONFIG=$2
      shift
      ;;
    --output-dir)
      [ $# -ge 2 ] || die "--output-dir wymaga ścieżki do katalogu."
      OUT_DIR=$2
      shift
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

# --- Skrypty zdalne (wykonywane przez `bash -s`; stdout = wyłącznie dane binarne, komunikaty na stderr) ---

gen_backup_prelude() {
  cat <<'EOF'
#!/usr/bin/env bash
# Skrypt zdalny wygenerowany przez scripts/backup.sh — dane na stdout, komunikaty na stderr.
set -euo pipefail

main() {
EOF
  # shellcheck disable=SC2016 # $HOME rozwija się na serwerze
  printf '  cd "$HOME"/%q || { echo "BŁĄD: brak katalogu ~/%s — najpierw uruchom deploy." >&2; exit 1; }\n' \
    "$DEPLOY_DIR" "$DEPLOY_DIR"
  cat <<'EOF'
  if docker info >/dev/null 2>&1; then D=(docker); else D=(sudo -n docker); fi
EOF
}

# Zrzut bazy: POSTGRES_USER/POSTGRES_DB z środowiska kontenera db (compose bierze je z .env na serwerze).
gen_remote_db_dump_script() {
  gen_backup_prelude
  cat <<'EOF'
  "${D[@]}" compose -f docker-compose.prod.yml exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"'
}

main "$@" </dev/null
EOF
}

gen_remote_uploads_script() {
  gen_backup_prelude
  printf '  VOLUME=%q\n' "$UPLOADS_VOLUME"
  cat <<'EOF'
  "${D[@]}" volume inspect "$VOLUME" >/dev/null || { echo "BŁĄD: brak wolumenu $VOLUME." >&2; exit 1; }
  "${D[@]}" image inspect alpine:3 >/dev/null 2>&1 || "${D[@]}" pull -q alpine:3 >&2
  "${D[@]}" run --rm -v "$VOLUME":/data:ro alpine:3 tar czf - -C /data .
}

main "$@" </dev/null
EOF
}

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry-run: skrypty zdalne poniżej (nic nie zostało wysłane na serwer)."
  echo "# ===== 1/2: zrzut bazy → db-<ts>.dump ====="
  gen_remote_db_dump_script
  echo "# ===== 2/2: wolumen $UPLOADS_VOLUME → uploads-<ts>.tgz ====="
  gen_remote_uploads_script
  exit 0
fi

require_cmd ssh
build_ssh_cmd

TS=$(date +%Y%m%d-%H%M%S)
mkdir -p "$OUT_DIR"
WORK=$(mktemp -d "$OUT_DIR/.backup-$TS.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

log "Zrzut bazy z $SSH_USER@$SERVER_HOST (~/$DEPLOY_DIR)"
gen_remote_db_dump_script | "${SSH_CMD[@]}" 'bash -s' >"$WORK/db.dump" ||
  die "Zrzut bazy nie powiódł się (czy stack działa? $SSH_HINT 'cd ~/$DEPLOY_DIR && docker compose -f docker-compose.prod.yml ps')."
[ -s "$WORK/db.dump" ] || die "Zrzut bazy jest pusty — kopia przerwana."
[ "$(head -c 5 "$WORK/db.dump")" = PGDMP ] || die "Zrzut bazy nie wygląda na format pg_dump -Fc — kopia przerwana."

log "Archiwum zdjęć (wolumen $UPLOADS_VOLUME)"
gen_remote_uploads_script | "${SSH_CMD[@]}" 'bash -s' >"$WORK/uploads.tgz" ||
  die "Archiwizacja wolumenu $UPLOADS_VOLUME nie powiodła się."
[ -s "$WORK/uploads.tgz" ] || die "Archiwum zdjęć jest puste — kopia przerwana."
if command -v gzip >/dev/null 2>&1; then
  gzip -t "$WORK/uploads.tgz" 2>/dev/null || die "Archiwum zdjęć jest uszkodzone — kopia przerwana."
fi

db_file="$OUT_DIR/db-$TS.dump"
up_file="$OUT_DIR/uploads-$TS.tgz"
mv "$WORK/db.dump" "$db_file"
mv "$WORK/uploads.tgz" "$up_file"
ok "$db_file ($(wc -c <"$db_file" | tr -d ' ') B)"
ok "$up_file ($(wc -c <"$up_file" | tr -d ' ') B)"
log "Restore: patrz komentarz na górze scripts/backup.sh."
