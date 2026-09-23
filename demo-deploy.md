# Wytyczne deployu — kolejna apka na wspólnym serwerze

> **Dla agenta:** ten plik opisuje konwencje deployu, które już działają na serwerze.
> Twoje zadanie: przygotować dla TEGO projektu komplet plików deployu **zgodny z poniższym**.
> Nie wymyślaj własnej architektury — wpasuj się w istniejącą. Czytaj sekcję
> „Czego NIE robić”. Komentarze i komunikaty pisz po polsku (jak w pozostałych projektach).

## Model: jeden serwer, wiele apek, wspólny proxy

Na serwerze (VPS) działa **jeden współdzielony reverse proxy** (`caddy-docker-proxy`),
który trzyma porty `80/443` i certyfikaty TLS. Każda apka to osobny, samowystarczalny
stack `docker compose` (app + własna baza), który **nie publikuje portów na host** —
podłącza się do zewnętrznej sieci `web` i ogłasza swoją trasę **etykietami `caddy.*`**.
Proxy czyta te etykiety przez docker socket i sam konfiguruje trasowanie + TLS.

```
            Internet :443
                │
        ┌───────▼────────┐   sieć "web" (external)
        │  wspólny proxy │◄──────────────┬───────────────┐
        │  (caddy)       │               │               │
        └────────────────┘         ┌─────▼─────┐   ┌──────▼─────┐
        certy wildcard TLS         │  app A    │   │  app B     │  (Twoja apka)
        porty 80/443               │ +  db A   │   │ +  db B    │
                                   └───────────┘   └────────────┘
                                   sieć "internal" (prywatna, per-apka)
```

**Konsekwencja dla Ciebie:** proxy i certy TLS **już są** — NIE stawiasz Caddy/Nginx,
NIE zarządzasz certami, NIE otwierasz portów. Dodanie apki = odpalenie jej kontenera
z właściwymi etykietami w sieci `web`. Zero edycji proxy.

## Co projekt musi dostarczyć

Skopiuj wzorce 1:1 i dostosuj nazwy. Pełne, działające przykłady są w repozytorium
`kurs` (pliki: `Dockerfile`, `docker-compose.prod.yml`, `deploy.conf.example`,
`scripts/deploy.sh`, `scripts/lib/deploy-lib.sh`, `proxy/`).

### 1. `Dockerfile` — obraz produkcyjny apki

Konwencje (dla Next.js; analogicznie dla innego frameworka):

- **Multi-stage**: `base` → `deps` → `build` → `runtime`. Obraz runtime ma być chudy.
- Next: `next.config` ustawia `output: "standalone"`; do runtime kopiujesz
  `.next/standalone`, `.next/static`, `public` — **nie** całe `node_modules`.
- `EXPOSE` portu apki (np. `3000`) — informacyjnie; portu NIE publikujemy na host.
- **Migracje i seed bazy wykonuje `CMD` przy starcie kontenera**, nie host i nie deploy.
  Wzorzec łańcucha: `migrate deploy` → idempotentny `seed` → `start serwera`.
  Migracje muszą być **idempotentne** (kolejny deploy może je odpalić ponownie).
- Jeśli framework binduje się do `$HOSTNAME` (Next standalone tak robi), wymuś
  `ENV HOSTNAME=0.0.0.0` — inaczej proxy w sieci `web` dostanie `502 connection refused`.
- Sekrety/konfiguracja idą przez zmienne środowiskowe z `.env` (patrz niżej), nie zaszywaj.

### 2. `docker-compose.prod.yml` — stack apki (app + baza)

To jest plik uruchamiany na serwerze. Twardy wzorzec:

```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_USER: "${POSTGRES_USER:-mojaapka}"
      POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD musi byc ustawiony w .env}"
      POSTGRES_DB: "${POSTGRES_DB:-mojaapka}"
    volumes:
      - dbdata:/var/lib/postgresql/data
    networks: [internal]               # baza TYLKO w sieci prywatnej
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-mojaapka} -d ${POSTGRES_DB:-mojaapka}"]
      interval: 5s
      timeout: 5s
      retries: 10

  app:
    build: .
    container_name: mojaapka            # unikalna nazwa kontenera per-projekt
    restart: unless-stopped
    depends_on:
      db: { condition: service_healthy }
    environment:
      NODE_ENV: production
      DATABASE_URL: "postgresql://${POSTGRES_USER:-mojaapka}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-mojaapka}?schema=public"
      AUTH_SECRET: "${AUTH_SECRET:?AUTH_SECRET musi byc ustawiony w .env}"
    networks: [internal, web]           # internal = do bazy, web = do proxy
    labels:                             # to czyta wspólny proxy — bez tego apka jest niewidoczna z netu
      caddy: "${APP_DOMAIN:?APP_DOMAIN musi byc ustawiony w .env}"
      caddy.reverse_proxy: "{{upstreams 3000}}"          # port apki W kontenerze
      caddy.tls: "/certs/wildcard.crt /certs/wildcard.key"
      caddy.import: secure_headers
    healthcheck:                        # proxy/deploy czeka aż apka realnie wstanie
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 60s                 # czas na migracje + seed + start

networks:
  internal:                             # prywatna, tworzona przez compose
  web:
    external: true                      # współdzielona z proxy — MUSI już istnieć

volumes:
  dbdata:
```

Zasady, których pilnuj:
- **Żadnych `ports:` na app/db.** Ruch z internetu wchodzi wyłącznie przez proxy.
- Baza siedzi **tylko** w `internal`; do `web` podłączasz wyłącznie `app`.
- `web` jest `external: true` — compose jej nie tworzy; tworzy ją deploy (`docker network create web`).
- `caddy.tls` wskazuje na cert wgrany do proxy (`/certs/...` to ścieżka WEWNĄTRZ proxy).
  Dla subdomeny pod istniejącym wildcardem nie wgrywasz nic nowego.
- `caddy.import: secure_headers` — wspólny snippet nagłówków bezpieczeństwa z proxy.
- Zmienne z `${...:?komunikat}` celowo wywalają się z czytelnym błędem, gdy `.env` niekompletny.

### 3. `deploy.conf.example` — konfiguracja deployu (wzorzec, w gicie)

Realny `deploy.conf` jest **ignorowany przez git** (`.gitignore`). Klucze:

```sh
# --- Serwer / SSH ---
SERVER_HOST=203.0.113.5     # IP lub host VPS
SSH_USER=root               # root albo user z sudo bez hasła
SSH_PORT=22                 # opcjonalnie (domyślnie 22)
SSH_KEY=                    # opcjonalnie: ścieżka do klucza (puste = domyślny ~/.ssh)

# --- Domena apki ---
APP_DOMAIN=mojaapka.twojadomena.pl   # subdomena objęta certem wgranym do proxy

# --- Repozytorium ---
REPO_URL=https://github.com/uzytkownik/mojaapka.git
REPO_BRANCH=main            # opcjonalnie (domyślnie main)
DEPLOY_DIR=mojaapka         # opcjonalnie: katalog na serwerze (względem $HOME)
GIT_TOKEN=                  # opcjonalnie: token TYLKO dla prywatnego repo
```

Sekrety (`POSTGRES_PASSWORD`, `AUTH_SECRET`) **nie** są w configu — generuje je deploy
na serwerze i zachowuje między wdrożeniami (patrz niżej). Domeny ACME nie podajesz —
TLS robi proxy.

### 4. `scripts/deploy.sh` + `scripts/lib/deploy-lib.sh` — bezobsługowy deploy

Deploy to **idempotentny skrypt bash uruchamiany lokalnie**, który składa skrypt
zdalny i wykonuje go na serwerze przez `ssh ... 'bash -s'`. Logika jest w czystych,
testowalnych funkcjach w `lib/deploy-lib.sh` (sourcowanie bez efektów ubocznych);
`deploy.sh` to cienki sterownik (parsowanie argumentów, prompt o braki, SSH, czekanie).

Wymagany interfejs:
- `bash scripts/deploy.sh` — pełny deploy z `deploy.conf`.
- `bash scripts/deploy.sh --dry-run` — wypisz skrypt zdalny i zakończ (bez SSH). Trzymaj
  to działające — to główny sposób recenzji tego, co poleci na serwer.
- `bash scripts/deploy.sh --config <plik>` — alternatywny plik configu.
- `set -euo pipefail` na górze każdego skryptu (`pipefail` wykrywa błąd w potokach typu `curl … | sh`).

Co robi skrypt zdalny (kolejność, wszystko **idempotentnie**):
1. **Prereqs**: `sudo` tylko gdy nie root; doinstaluj brakujące pakiety (`git`, `curl`)
   jednym `apt-get update`; zainstaluj Dockera oficjalnym instalatorem gdy go brak;
   zweryfikuj plugin `docker compose`.
2. **Sieć `web`**: `docker network inspect web || docker network create web`.
3. **Kod**: pierwszy raz `git clone --depth 1 --branch <branch>`, kolejne — `git fetch`
    + `git reset --hard FETCH_HEAD`. Token (jeśli jest) używany tylko do fetch/klon;
      `origin` zapisuje URL **bez** tokenu (nie zostaje w `.git/config`).
4. **`.env`**: wygeneruj na serwerze. `APP_DOMAIN` podstaw z configu; `POSTGRES_PASSWORD`
   i `AUTH_SECRET` losuj z `/dev/urandom`, ale **jeśli `.env` już istnieje — zachowaj
   dotychczasowe sekrety** (kolejny deploy nie może zmienić hasła do istniejącej bazy).
   `chmod 600 .env`.
5. **Start**: `docker compose -f docker-compose.prod.yml up -d --build`.
   Migracje i seed wykona kontener `app` przez swój `CMD` — deploy ich NIE odpala.

Po SSH skrypt lokalny **czeka aż `https://$APP_DOMAIN` odpowie** (curl w pętli z deadline,
np. 3 min), bo apka musi skończyć migracje/seed i wstać. Na timeout — czytelny komunikat
diagnostyczny (sprawdź DNS, proxy, logi apki), exit 1.

Pomocnicze funkcje, które warto przenieść z `lib/deploy-lib.sh` (są generyczne):
`log/ok/warn/die`, `require_cmd`, `load_config`, `validate_config`,
`inject_git_token`, `gen_remote_prereqs_script`, `gen_remote_env_script`,
`gen_remote_bootstrap_script`. Generator prereqs/Dockera jest **wspólny** z deployem proxy.

## Jednorazowy setup serwera (robisz raz na serwer, nie per-apka)

Jeśli na serwerze nie ma jeszcze wspólnego proxy, postaw go z katalogu `proxy/`:

1. Złóż cert wildcard (`proxy/assemble-cert.sh`) → `proxy/certs/wildcard.crt` + `.key`
   (certy **nie** trafiają do gita — `proxy/.gitignore`, plus `*.key/*.csr/*.crt` globalnie).
2. `scp` certów na serwer do `~/proxy/certs/`.
3. `bash scripts/deploy-proxy.sh` — instaluje Dockera (gdy brak), tworzy sieć `web`,
   wysyła `proxy/docker-compose.yml` + `Caddyfile.base`, startuje proxy.

Wildcard `*.twojadomena.pl` pokrywa wszystkie subdomeny → kolejne apki nie wymagają
nowych certów. Apex (`twojadomena.pl`) zwykle wildcardem **nie** jest objęty — wtedy
osobny cert albo Let's Encrypt (`email` w `Caddyfile.base`, pominięty `caddy.tls`).

## Czego NIE robić

- ❌ Nie stawiaj własnego Caddy/Nginx/Traefik w stacku apki — od TLS/trasowania jest wspólny proxy.
- ❌ Nie publikuj portów (`ports:`) na app ani db.
- ❌ Nie podłączaj bazy do sieci `web`.
- ❌ Nie commituj `deploy.conf`, `.env`, certów ani kluczy.
- ❌ Nie odpalaj migracji/seedu z hosta ani z deploy.sh — robi to `CMD` kontenera app.
- ❌ Nie zmieniaj sekretów istniejącej bazy przy redeployu (zachowuj `.env`).
- ❌ Nie zaszywaj sekretów w obrazie/compose — tylko przez `.env` generowany na serwerze.
- ❌ Nie wymyślaj nowego formatu configu — trzymaj klucze `deploy.conf` jak wyżej.

## Checklista akceptacji dla nowej apki

- [ ] `bash scripts/deploy.sh --dry-run` wypisuje sensowny skrypt zdalny (bez SSH, bez sekretów w jawnym logu).
- [ ] `docker-compose.prod.yml`: brak `ports:`, db tylko w `internal`, app w `internal`+`web`, etykiety `caddy.*` z `APP_DOMAIN`.
- [ ] `web` jest `external: true`; deploy tworzy ją idempotentnie.
- [ ] Obraz binduje serwer na `0.0.0.0` (nie na ID kontenera).
- [ ] Healthcheck app trafia w realny endpoint; `start_period` pokrywa migracje+seed.
- [ ] `.env` generowany na serwerze, sekrety losowe i zachowywane, `chmod 600`.
- [ ] `deploy.conf.example` w gicie, `deploy.conf`/`.env`/certy ignorowane.
- [ ] `APP_DOMAIN` to subdomena objęta wildcardem wgranym do proxy (albo masz plan na apex).
- [ ] Po deployu `https://$APP_DOMAIN` odpowiada; deploy czeka na to i zwraca błąd na timeout.
