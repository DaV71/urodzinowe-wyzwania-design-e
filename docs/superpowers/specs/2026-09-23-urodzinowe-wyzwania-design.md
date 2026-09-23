# Urodzinowe wyzwania — spec projektu (wersja 2: zatwierdzanie ręczne)

Data: 2026-09-23. Status: do akceptacji przez Dawida przed startem implementacji.
Zmiana względem wersji 1: **bez integracji Strava**. Wykonanie każdego zadania zgłasza jubilat
(zdjęcie/screenshot + wartości), a zatwierdza Dawid w panelu admina. Alternatywnie kod od Dawida.

Źródła: `design/DESIGN.md` + artboardy `design/*.html` (wygląd), `zadania.md` (28 zadań),
`demo-deploy.md` (konwencje deployu).

## 1. Cel

Jednoosobowa aplikacja webowa: jubilat(ka) dostaje 28 zadań sportowych w 4 etapach po 7.
Zadania odblokowują się sekwencyjnie (N zaliczone → N+1 otwarte). Po 28 odblokowuje się nagroda
główna. Postęp żyje wyłącznie po stronie serwera. Zaliczenie zadania wymaga decyzji Dawida
(zatwierdzenie zgłoszenia w panelu) albo jednorazowego kodu, który zna tylko Dawid.

## 2. Decyzje produktowe

| # | Decyzja | Uzasadnienie / alternatywa |
|---|---|---|
| D1 | **28 świeczek** w jednym rzędzie, przeskalowane (mobile korpus 8×24 px, desktop 12×36 px). Świeczka `i` płonie, gdy `i < done`. Wiek na torcie: **28**. | 28 zadań = 28 lat. Mieści się: mobile 28×8 + 27×4 = 332 px < 350; desktop 28×12 + 27×5 = 471 px < 480. Alternatywa: 4 świeczki (etapy). |
| D2 | Tryb świeczek tylko "zapalane". | YAGNI. |
| D3 | Koperty pogrupowane w **4 etapy** z nagłówkiem "Etap n · Nazwa". Widoczne: zaliczone, jedna aktywna, zaklejone jako "??? ??? ???". **Tytuły zaklejonych nie są wysyłane do przeglądarki.** | Brak wycieku treści. |
| D4 | "Od nowa" tylko w panelu admina ("Resetuj postęp"). | Ochrona przed przypadkowym resetem. |
| D5 | Personalizacja (imię, wiek, nagroda, opis, od kogo, data) w `src/config/site.ts`. | Nie są to sekrety; łatwa edycja. |
| D6 | Emoji z `zadania.md` zostają w tytułach. | Charakter prezentu. |
| D7 | **Przepływ zaliczania:** jubilat w otwartej kopercie klika "ZROBIONE — ZAPAL ŚWIECZKĘ", dołącza dowód (zdjęcie/screenshot, do 4 plików) i, gdy zadanie tego wymaga, wpisuje dystans i czas. Koperta przechodzi w stan "czeka na Dawida". Dawid dostaje Telegram i zatwierdza lub odrzuca (z powodem) w panelu. Po zatwierdzeniu świeczka się zapala i otwiera się następna koperta. | Jeden prosty mechanizm dla wszystkich 28 zadań; człowiek widzi dowód, apka pilnuje kolejności, dat i liczb. |
| D8 | **Kody odblokowujące** per zadanie (HMAC z sekretu, format `XXXX-XXXX`, lista tylko w panelu admina, limit 5 prób / 10 min). Kod zalicza zadanie natychmiast, bez zgłoszenia. | Tryb offline: Dawid mówi kod przy wspólnym biegu albo wkłada do fizycznej koperty. |
| D9 | Dostęp jubilata: **sekretny link** `/start/<PLAYER_TOKEN>` ustawiający podpisane cookie na 120 dni. Bez loginu. Bez cookie strona pokazuje tylko zaklejoną kopertę i `noindex`. | Jedna osoba, zero tarcia. |
| D10 | Admin: `/admin` z hasłem z `.env`, cookie sesji 30 dni (na telefonie Dawida zatwierdzanie to jedno wejście z Telegrama i jedno kliknięcie). | |
| D11 | Stos: Next.js 16.3 (App Router, TS), Prisma 7.10 + `@prisma/adapter-pg`, Postgres 16, CSS Modules, Vitest, Node 24. Bez Tailwinda, bez Prisma 8 RC. | Style z artboardów 1:1. |
| D12 | Zdjęcia na named volume `uploads`, serwowane przez chroniony route handler. Brak S3. | Jedna instancja. |

## 3. Fakty zweryfikowane (2026-09-23)

- Next.js stabilny **16.3.x**; `middleware.ts` zastąpił **`proxy.ts`** (implementer weryfikuje przez context7). Standalone: `server.js` czyta `PORT`/`HOSTNAME`; `public` i `.next/static` kopiujemy ręcznie. https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Prisma **7.10.x**: obowiązkowy `prisma.config.ts` (`datasource.url`, `migrations.path`, `migrations.seed`), generator `prisma-client` z wymaganym `output`, driver adapter `@prisma/adapter-pg` + `pg`, CLI nie ładuje `.env` (`import "dotenv/config"`). https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Standalone nie zawiera `prisma.config.ts`, `prisma/` ani CLI → kopiujemy je do obrazu runtime osobno. https://github.com/prisma/prisma/discussions/29305
- `node:24-slim` wymaga `openssl`. Wzorzec Vercel `with-docker`: 3 stage, `USER node`, `HOSTNAME=0.0.0.0`.
- Telegram Bot API: `POST https://api.telegram.org/bot<TOKEN>/sendMessage` z `chat_id`, `text`; bot i chat_id zakłada się raz przez @BotFather i @userinfobot. https://core.telegram.org/bots/api#sendmessage

## 4. Architektura

```
przeglądarka jubilata ──HTTPS──▶ caddy-docker-proxy ──sieć web──▶ app (Next.js 16, :3000)
przeglądarka Dawida  ──HTTPS──▶      (istnieje)                     │ sieć internal
                                                              ┌─────┴─────┐
app ──HTTPS──▶ api.telegram.org (powiadomienia)               ▼           ▼
                                                        db (postgres)  volume uploads
```

Jedna aplikacja Next.js: Server Components + Server Actions + Route Handlers. Klient dostaje
wyłącznie stan renderowany dla niego.

### Moduły (`src/`)

| Moduł | Odpowiedzialność |
|---|---|
| `config/site.ts` | Personalizacja. |
| `lib/env.ts` | Walidacja zmiennych środowiskowych (zod). |
| `lib/db.ts` | Singleton PrismaClient z adapterem pg. |
| `lib/auth/session.ts`, `player.ts`, `admin.ts` | Podpisane cookie (HMAC-SHA256), `isPlayer()`, `requireAdmin()`. |
| `lib/progress.ts` | Maszyna stanów: `ensureStarted`, `getBoard`, `submit`, `approve`, `reject`, `completeWithCode`, `undoLast`, `resetAll`. Jedyne miejsce zmieniające `TaskProgress`. |
| `lib/codes.ts` | Kody HMAC i ich weryfikacja. |
| `lib/uploads.ts` | Zapis/odczyt zdjęć w `UPLOAD_DIR` (typ, rozmiar, ścieżka). |
| `lib/notify/telegram.ts` | `notifyAdmin(text)`; no-op bez konfiguracji. |
| `lib/audit.ts`, `lib/text.ts` | Log zdarzeń; pluralizacja i formatowanie czasu. |
| `app/` | `/` (jubilat), `/start/[token]`, `/admin`, `/admin/login`, `/api/health`, `/api/uploads/[id]`. |
| `components/` | UI 1:1 z artboardów + `SubmitForm` + komponenty panelu. |

## 5. Zgłoszenia i zatwierdzanie

### Co jubilat podaje przy zgłoszeniu
Każde zadanie ma w seedzie:
- `proof`: `PHOTO` (zdjęcie wymagane), `PHOTO_OPTIONAL`, `NONE` (tylko przycisk),
- `proofHint`: podpowiedź co dołączyć (np. "Screenshot z zegarka lub aplikacji z dystansem, czasem i datą"),
- `askDistance`, `askDuration`: czy formularz prosi o dystans (km, 2 miejsca) i czas (mm:ss),
- `maxPhotos`: 1 lub 4 (zadania "N treningów w 7 dni"),
- `compareToTask` + `minImprovementS`: dla zadania 11 (czas z zadania 6 minus 30 s).

| # | proof | hint | dane |
|---|---|---|---|
| 1 | PHOTO | Zdjęcie nowych butów na nogach | — |
| 2 | PHOTO | Screenshot marszu: dystans, czas, data | dystans, czas |
| 3, 4, 6, 10, 13, 15, 18, 19, 22, 25, 27, 28 | PHOTO | Screenshot biegu: dystans, czas, data | dystans, czas (6 zapisuje czas jako referencję) |
| 5 | PHOTO_OPTIONAL | Zdjęcie/selfie z treningu albo notatka | — |
| 7 | PHOTO | Screenshot treningu (min. 20 min) | czas |
| 8 | PHOTO, maxPhotos 4 | Screenshoty 3 biegów z 7 dni | dystans łączny |
| 9, 12, 17 | PHOTO_OPTIONAL | Zdjęcie z siłowni albo notatka z seriami | — |
| 11 | PHOTO | Screenshot biegu 2 km | dystans, czas (porównanie z zad. 6: musi być ≤ ref − 30 s, inaczej formularz ostrzega, ale Dawid decyduje) |
| 14 | PHOTO, maxPhotos 4 | Screenshoty 4 treningów z 7 dni | — |
| 16, 23 | PHOTO | Screenshot interwałów/podbiegów (wykres tempa) | czas |
| 20 | PHOTO | Screenshot z przewyższeniem | dystans, czas |
| 21 | NONE | Dawid był na miejscu | — |
| 24 | PHOTO_OPTIONAL | Zdjęcie z siłowni albo notatka (min. 45 min) | czas |
| 26 | PHOTO | Screenshot 5 km albo wynik parkrun | dystans, czas (ostrzeżenie gdy > 35:00) |

Walidacje po stronie serwera (miękkie, informacyjne dla Dawida; twarde tylko dla brakującego wymaganego zdjęcia):
dystans niższy niż w tytule zadania, czas powyżej limitu, zgłoszenie < 5 min po odblokowaniu, zgłoszenie
tego samego zdjęcia (ten sam hash SHA-256 pliku) co w innym zadaniu. Każda taka uwaga trafia do
`Submission.warnings` i jest pokazana Dawidowi jako żółta etykieta.

### Maszyna stanów `TaskProgress.status`
```
LOCKED ──(poprzednie DONE)──▶ ACTIVE ──(kod | approve)──▶ DONE ──(unlock)──▶ następne ACTIVE
                                 │                          ▲
                                 └─(submit)─▶ PENDING_REVIEW ──(approve)──┘
                                                   └─(reject z powodem)──▶ ACTIVE (powód widoczny w kopercie)
DONE ──(admin undoLast; tylko ostatnie DONE)──▶ ACTIVE, jego następca ACTIVE → LOCKED
```

### Powiadomienia Telegram (gdy skonfigurowane)
- Zgłoszenie: `📬 Koperta 6 · Przebiegnij 2 km — 2,10 km, 12:40, 1 zdjęcie. Zatwierdź: <APP_URL>/admin#task-6`
- Kod: `🔑 Koperta 5 zaliczona kodem.`
- Wszystkie 28: `🎂 Tort gotowy — prezent odblokowany!`

## 6. Dostęp i bezpieczeństwo

- Cookie gracza `bd_player` i admina `bd_admin`: `payload.hmac`, `httpOnly`, `Secure` (prod), `SameSite=Lax`,
  HMAC-SHA256 z `AUTH_SECRET`, porównania w stałym czasie.
- `/start/<token>` vs `PLAYER_TOKEN` → cookie 120 dni → redirect `/`; zły token → 404.
- `/admin/login`: hasło vs `ADMIN_PASSWORD`, 1 s opóźnienia po błędzie, cookie 30 dni.
- `proxy.ts`: `/admin/*` bez cookie → `/admin/login`; `X-Robots-Tag: noindex` globalnie.
- Kody: `HMAC-SHA256(CODES_SECRET, "task:<id>")` → base32 (bez 0/O/1/I) 8 znaków `XXXX-XXXX`; ≥ 5 nieudanych
  prób w 10 min → odrzucenie. Lista tylko w panelu admina (widok do druku).
- Uploady: `image/jpeg|png|webp|heic`, ≤ 10 MB/plik, nazwa `randomUUID()`, hash SHA-256 zapisany w DB,
  serwowane tylko graczowi lub adminowi.

## 7. Model danych (Prisma)

```
Task          id Int @id, stage Int, title, description, proof (PHOTO|PHOTO_OPTIONAL|NONE), proofHint,
              askDistance Boolean, askDuration Boolean, maxPhotos Int, compareToTask Int?, minImprovementS Int?
TaskProgress  taskId @id, status (LOCKED|ACTIVE|PENDING_REVIEW|DONE), unlockedAt?, completedAt?,
              source? (MANUAL|CODE|ADMIN), resultSeconds Int?, resultDistanceM Int?, lastRejectReason?, updatedAt
Submission    id, taskId, note?, photos Json (string[]), photoHashes Json (string[]), distanceM Int?, durationS Int?,
              warnings Json (string[]), status (PENDING|APPROVED|REJECTED), createdAt, reviewedAt?, reviewNote?
CodeAttempt   id, taskId, success, createdAt
AuditLog      id, actor (PLAYER|ADMIN|SYSTEM), action, taskId?, meta Json?, createdAt
```
Seed: 28 wierszy `Task` z `prisma/seed-data/tasks.json` (upsert, czysty JS + `pg`).

## 8. UI — mapowanie na artboardy

Wartości z `design/DESIGN.md` i analizy artboardów (D = desktop ≥ 1024 px, M = mobile):

- **Breakpoint**: `@media (min-width: 1024px)` → grid `520px minmax(0,1fr)`, gap 72, padding boczny 72;
  poniżej kolumna, padding 20. Dodajemy: hover przycisku (tło `#2a2622`), `:focus-visible` outline 3px `#c81e5a`,
  zapalenie świeczki `transition: box-shadow .4s, background .4s`.
- **Fonty**: `next/font/google` Anton 400 + Space Grotesk 400/500/700.
- **Tort**: rząd świeczek `align-items:flex-end`, gap D 5 / M 4, wysokość D 72 / M 56. Świeczka: płomień D 11×17 /
  M 8×13, `border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%`, tło `#ffd23f`, `border 2px #141210`, poświata
  D `0 0 0 3px rgba(255,210,63,.35), 0 0 12px rgba(255,150,30,.6)`; niezapalona: kółko 6×6 `border 2px dashed #a39c8c`;
  knot 2×6 `#141210`; korpus D 12×36 / M 8×24, `border 2px #141210`, radius 3,
  `repeating-linear-gradient(-45deg,#fff 0 4px,#c81e5a 4px 8px)`. Warstwy: żółta D 320×52 / M 240×42 (`border 3px`,
  radius `14px 14px 6px 6px` / `12px 12px 6px 6px`, `margin-top:-3px`); malinowa D 400×84 / M 300×62 (`border-top:0`,
  radius `0 0 6px 6px`, wiek Anton D 60 / M 44, ls 4/3, kolor `#f4ecdc`); biała D 480×64 / M 350×50 (`border-top:0`,
  radius `0 0 8px 8px`, kropelki `repeating-linear-gradient(90deg,#141210 0 3px,transparent 3px 26px)` (M 22px),
  `background-size:100% 14px` (M 12), `no-repeat`, `position 0 100%`); podstawa D 480×14 / M 350×12 `#141210`,
  radius `0 0 10px 10px`, cień D `8px 8px 0` / M `6px 6px 0 #141210`. Mobile: `width 350px; max-width 100%`,
  `transform: scale()` gdy viewport < 390 px.
- **Pigułka**: `margin-top` D 26 / M 22, padding D `8px 18px` / M `6px 14px`, `border 2px`, radius 999, białe tło,
  700, uppercase, ls 2, font D 13 / M 12. Tekst `Zapalone: {done} / 28`.
- **Top bar**: flex space-between, `padding-top` D 28 / M 24, font D 13 / M 12, 700, ls 2, uppercase; prawy `#c81e5a`.
- **Hero**: gap D 14 / M 10; h1 Anton D 68 / lh .96, M 48 / lh .98, ls 1, uppercase, imię `#c81e5a`;
  lead D 17 / lh 1.55 / max-width 480, M 15 / lh 1.5, `#4a453c`.
- **Nagłówek listy (desktop)**: flex baseline, `padding-bottom 6`, `border-bottom 3px`; "Koperty" Anton 28 ls 1;
  prawy `{done} / 28 zaliczone` 12px 700 ls 2 `#6b655a`. **Nagłówek etapu**: 11px 700 ls 2 uppercase `#6b655a`, `margin-top 12`.
- **Koperta zaliczona**: flex center, gap D 16 / M 14, padding D `14px 18px` / M `14px 16px`, `border 3px #141210`,
  radius 12, białe tło; kółko 40 `#141210` z checkiem 20 `#ffd23f`; etykieta 11px 700 `#6b655a` "KOPERTA n · ZALICZONA";
  tytuł Anton 24 lh 1.05 `#6b655a` `line-through` (`text-decoration-color #c81e5a`, thickness 3).
- **Koperta aktywna**: kolumna gap 12, padding D `22px 24px` / M 20, radius 14, `border 3px`, cień D `8px 8px 0 #c81e5a`
  / M `6px`; wiersz: pigułka (`#ffd23f`, `border 2px`, padding D `4px 12px` / M `4px 10px`, 11px 700 ls 2)
  "KOPERTA n · OTWARTA" + hantle D 24 / M 22; tytuł Anton D 40 / M 36 lh 1 ls 1; opis D 16 / M 15 lh 1.5 `#4a453c`;
  **formularz zgłoszenia**: `proofHint` 13px `#6b655a`; pola dystans/czas (gdy `askDistance/askDuration`) w jednym
  wierszu, `border 2px #141210`, radius 10, h 44; pole zdjęć (`accept="image/*"`, `multiple` gdy `maxPhotos 4`) jako
  przycisk-obramowanie kreskowane "DODAJ ZDJĘCIE"; notatka `textarea` 2 wiersze; rozwijany wiersz "Mam kod od Dawida"
  z polem `XXXX-XXXX`; przycisk h 52, `border 3px`, radius 10, tło `#141210`, tekst `#ffd23f` 14px 700 ls 2
  "ZROBIONE — ZAPAL ŚWIECZKĘ" (D `align-self:flex-start; padding 0 28px`, M pełna szerokość).
  Odrzucenie: nad formularzem pasek `#ffd23f` `border 2px` "Dawid odrzucił: {powód}. Spróbuj jeszcze raz."
  Stan `PENDING_REVIEW`: pigułka "KOPERTA n · CZEKA NA DAWIDA", zamiast formularza tekst
  "Zgłoszenie wysłane {data}. Świeczka zapali się po potwierdzeniu." + miniatury wysłanych zdjęć.
- **Koperta zaklejona**: `position:relative; overflow:hidden`, padding D `14px 18px` / M 16, gap D 16 / M 14,
  `border 3px dashed #a39c8c`, radius 12, tło `#ede3cf`; klapa absolutna `top -40 / h 80` (M `-36 / 72`), `left 0 right 0`,
  `#e2d6be`, `clip-path: polygon(0 0,100% 0,50% 100%)`; pieczęć 40 `#c81e5a` `border 3px #141210` z kłódką 16
  (stroke 2.5, biała); etykieta 11px "KOPERTA n · ZAKLEJONA"; "??? ??? ???" Anton 22 ls 3 `#a39c8c`.
- **Prezent zablokowany**: `position:relative; overflow:hidden`, flex gap D 20 / M 16, padding D 24 / M 20, radius
  D 16 / M 14, białe tło, `border 3px`; wstążki: pion `left 50%`, szer. D 16 / M 14, `margin-left` D -8 / M -7,
  `#c81e5a`, `border-left/right 2px #141210`; poziom analogicznie `top 50%`; kółko D 64 / M 56 tło `#f4ecdc`
  `border 3px` z kłódką D 28 / M 26; blok tekstu białe tło padding D `8px 10px` / M `6px 8px` radius 8 gap D 4 / M 3:
  "PREZENT GŁÓWNY" D 12 / M 11 `#c81e5a`; "Jeszcze {n} {koperta|koperty|kopert}" Anton D 30 / M 26;
  "Wstążka puści, gdy tort będzie gotowy." D 14 / M 13 `#6b655a`.
- **Prezent odblokowany**: D poziomo gap 24 padding 28 radius 16 tło `#ffd23f` `border 3px` cień `8px 8px 0 #141210`,
  ikona 56; M kolumna center gap 10 padding `28px 22px` radius 14 cień 6px, ikona 44; etykieta D 12 / M 11 700
  "TORT GOTOWY · PREZENT ROZPAKOWANY"; nazwa Anton D 44 / M 40; opis D 15 / M 14 `#4a453c`.
- **Stopka**: 500 `#6b655a` D 13 / M 12, M wyśrodkowana: "Z miłością i lekkim sadyzmem — {od kogo}".
- **Ikony** (inline SVG `viewBox 0 0 24 24`, `fill none`, `stroke currentColor`, round caps, `aria-hidden`):
  check `M5 13l4 4L19 7` (sw 3); hantle `M6 5v14 M18 5v14 M3 8v8 M21 8v8 M6 12h12` (sw 2);
  kłódka `rect x5 y11 w14 h10 rx2` + `M8 11V7a4 4 0 0 1 8 0v4`; prezent `M20 12v9H4v-9`, `M2 7h20v5H2z`, `M12 22V7`,
  `M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z`, `M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z` (sw 2).

## 9. Panel admina (`/admin`)

Mobile-first (Dawid zatwierdza z telefonu). Sekcje w kolejności:
1. **Do zatwierdzenia** (na górze, kotwica `#task-N`): karta ze zgłoszeniem: nr i tytuł zadania, kiedy zgłoszono
   i ile po odblokowaniu, dystans/czas (a dla zad. 11: "ref. z zad. 6: 12:40 → teraz 11:50, −50 s ✓"), zdjęcia
   (miniatury, klik = pełny rozmiar), notatka, żółte etykiety `warnings`; przyciski **Zatwierdź** (duży) i **Odrzuć**
   (pole powodu, wymagane).
2. **Tablica 28 zadań**: nr, tytuł, status, źródło, wynik (mm:ss / km), data; "Cofnij ostatnie zaliczenie" (potwierdzenie w UI).
3. **Link startowy** `${APP_URL}/start/${PLAYER_TOKEN}` z przyciskiem kopiuj.
4. **Kody** (28 wierszy; `@media print` ukrywa resztę strony).
5. **Strefa niebezpieczna**: "Resetuj postęp" (wpisz `RESET`).
6. **Ostatnie 50 wpisów audytu**.
7. Wyloguj.

## 10. Deploy (zgodnie z `demo-deploy.md`)

- `Dockerfile`: `base → deps → build → prisma-cli → runtime` (`node:24-slim` + openssl, `USER node`, `HOSTNAME=0.0.0.0`,
  `PORT=3000`, `UPLOAD_DIR=/data/uploads` z `mkdir + chown` w obrazie). Runtime dostaje `public`, `.next/standalone`,
  `.next/static`, `prisma/`, `prisma.config.ts`, samodzielną instalację `prisma` CLI + `pg` + `dotenv` w `/app/tools`.
- `docker/entrypoint.sh`: sprawdź zapis do `UPLOAD_DIR` → `migrate deploy` → `node prisma/seed.cjs` → `exec node server.js`.
- `docker-compose.prod.yml`: `name: urodzinowe`; `db` tylko `internal`; `app` w `internal + web`, bez `ports:`,
  labele `caddy.*`, volume `uploads`, healthcheck `/api/health`, `start_period 60s`.
- Zmienne: `APP_DOMAIN` (config); losowane i zachowywane na serwerze: `POSTGRES_PASSWORD`, `AUTH_SECRET`, `CODES_SECRET`,
  `PLAYER_TOKEN`, `ADMIN_PASSWORD` (deploy wypisuje jak odczytać); opcjonalne od człowieka (prompt przy pierwszym
  deployu, Enter = pomiń): `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- `scripts/deploy.sh` (`--dry-run`, `--config`, `--set-secret KEY`, `--no-wait`) + `scripts/lib/deploy-lib.sh` +
  `tests/deploy-lib.test.sh`; `scripts/backup.sh` (pg_dump + tar wolumenu uploads).
- Dev lokalny: `docker-compose.dev.yml` (tylko Postgres), `.env` lokalny.

## 11. Poza zakresem

Integracje z platformami sportowymi (Strava, Garmin, Samsung Health), automatyczna ocena dowodów (OCR/vision),
tryb "zdmuchiwane", wielu graczy, S3, e-mail, PWA, i18n, Prisma 8, CI/CD.

## 12. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Dawid nie zauważy zgłoszenia | Telegram z linkiem; w kopercie jubilat widzi "czeka na Dawida" z datą. |
| Podrobiony screenshot | Dawid ogląda dowód; ostrzeżenia (za szybko po odblokowaniu, ten sam plik, wartości poniżej progu). To gra urodzinowa, nie audyt. |
| Zgubiony link startowy | Link zawsze w panelu admina; `PLAYER_TOKEN` rotowalny przez `deploy.sh --set-secret PLAYER_TOKEN`. |
| Prisma 7 w standalone | Osobny stage `prisma-cli`, kopiowanie `prisma/` + `prisma.config.ts`; fallback `prisma.config.mjs`. |
| Duże zdjęcia z telefonu (HEIC, 10+ MB) | Limit 10 MB/plik z czytelnym komunikatem; `caddy.request_body.max_size` 45 MB (4 pliki). |

## 13. Checklista Dawida przed urodzinami

1. (Opcjonalnie) bot Telegram: @BotFather → token; @userinfobot → chat_id; podać przy pierwszym deployu.
2. `bash scripts/deploy.sh`; odczytać `ADMIN_PASSWORD` i link startowy z panelu.
3. Test z telefonu: wejść linkiem, zgłosić zadanie 1 ze zdjęciem, zatwierdzić z Telegrama, potem "Resetuj postęp".
4. Uzupełnić `src/config/site.ts` (imię, wiek, nagroda, od kogo, data) i wydrukować kody z panelu.
