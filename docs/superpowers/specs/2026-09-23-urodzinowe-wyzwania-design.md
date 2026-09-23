# Urodzinowe wyzwania — spec projektu

Data: 2026-09-23. Status: do akceptacji przez Dawida przed startem implementacji.

Źródła: `design/DESIGN.md` + artboardy `design/*.html` (wygląd), `zadania.md` (28 zadań),
`demo-deploy.md` (konwencje deployu). Analizy agentów, na których oparto decyzje, są streszczone
w sekcjach "Fakty" poniżej.

## 1. Cel

Jednoosobowa aplikacja webowa: jubilat(ka) dostaje 28 zadań sportowych w 4 etapach po 7.
Zadania odblokowują się sekwencyjnie (N zaliczone → N+1 otwarte). Po 28 odblokowuje się
nagroda główna. Wykonanie zadania jest weryfikowane **automatycznie przez Stravę** tam, gdzie
to obiektywnie możliwe (biegi/marsze na dystans, czas, przewyższenie), a w pozostałych
przypadkach **zatwierdza je Dawid** w panelu admina (albo przez jednorazowy kod per zadanie).
Postęp żyje wyłącznie po stronie serwera; jubilat nie może odblokować zadań przez devtools.

## 2. Decyzje produktowe (do potwierdzenia)

| # | Decyzja | Uzasadnienie / alternatywa |
|---|---|---|
| D1 | **28 świeczek na torcie** w jednym rzędzie, przeskalowane (mobile: korpus 8×24 px, desktop 12×36 px). Świeczka `i` płonie, gdy `i < done`. Wiek na torcie: **28**. | 28 zadań = 28 lat; jedna świeczka za zadanie daje natychmiastową gratyfikację. Alternatywa: 4 świeczki (jedna na etap). Mieści się: mobile 28×8 + 27×4 = 332 px < 350; desktop 28×12 + 27×5 = 471 px < 480. |
| D2 | Tryb świeczek tylko "zapalane". Tryb "zdmuchiwane" pominięty. | YAGNI. |
| D3 | Lista kopert pogrupowana w **4 etapy** z nagłówkiem etapu ("Etap 1 · Rozruch"). Widoczne: wszystkie zaliczone, jedna aktywna, zaklejone jako "??? ??? ???". **Tytuły zaklejonych nie są wysyłane do przeglądarki.** | Zgodne z designem; brak wycieku treści. |
| D4 | Przycisk "Od nowa" **nie** jest na stronie jubilata (jest w panelu admina jako "Resetuj postęp"). | Zabezpieczenie przed przypadkowym resetem. Odstępstwo od makiety prezentu odblokowanego. |
| D5 | Dane personalizacji (imię, wiek, nagroda, opis, od kogo, data w top barze) w jednym pliku `src/config/site.ts`. | Łatwa edycja bez grzebania w komponentach; to nie są sekrety. |
| D6 | Emoji z `zadania.md` (📸 🎉 😉 🏁) zostają w tytułach zadań. | Charakter prezentu. |
| D7 | Zaliczenie AUTO (biegi na dystans) **od razu** oznacza zadanie jako zrobione i odblokowuje następne; Dawid dostaje powiadomienie i ma "Cofnij". MIXED → `PENDING_REVIEW` (system wykrył kandydata, Dawid klika "Zatwierdź"). MANUAL → zgłoszenie jubilata (przycisk + zdjęcie/notatka) **lub** kod od Dawida. | Natychmiastowa nagroda tam, gdzie oszustwo wymaga faktycznego biegu; człowiek tam, gdzie API nie widzi treści. |
| D8 | Dostęp jubilata: **sekretny link** `/start/<PLAYER_TOKEN>` ustawiający podpisane cookie na 120 dni. Bez loginu/PIN. Brak cookie → strona główna renderuje "Koperta zaklejona" (bez informacji o istnieniu gry) i `noindex`. | Jedna osoba; PIN dodaje tarcie bez zysku. |
| D9 | Zatwierdzanie ręczne: **panel `/admin`** (hasło z `.env`, cookie sesji) + **powiadomienie Telegram** z linkiem do zgłoszenia (opcjonalne, gdy ustawione `TELEGRAM_*`) + **kody odblokowujące** per zadanie (HMAC z sekretu, widoczne tylko w panelu admina, rate limit 5 prób / 10 min). | Panel = bezpieczeństwo, Telegram = wygoda, kody = tryb offline/"koperta w kopercie". |
| D10 | Stos: Next.js 16.3 (App Router, TS), Prisma 7.10 + `@prisma/adapter-pg`, Postgres 16, CSS Modules + zmienne CSS (bez Tailwinda), Vitest. Node 24. | Style z artboardów przenosimy 1:1, Tailwind by tylko przeszkadzał. Prisma 8 to RC. |
| D11 | Brak S3: zdjęcia na named volume `uploads`, serwowane przez chroniony route handler. | Jedna instancja, jeden użytkownik. |

## 3. Fakty zweryfikowane (2026-09-23)

### Strava
- OAuth 2.0, apkę rejestruje się na https://www.strava.com/settings/api. Scope wymagany: **`activity:read_all`** (aktywności "Only You"). Access token żyje 6 h; refresh token może się zmieniać przy każdym odświeżeniu, zawsze zapisujemy nowy. https://developers.strava.com/docs/authentication/
- **Single Player Mode**: nowa apka pozwala autoryzować tylko konto właściciela. Od 2026 "Standard Tier" pozwala samodzielnie podnieść limit do 10 sportowców w API Settings. **Od 1.06.2026 założenie apki wymaga płatnej subskrypcji Strava.** https://developers.strava.com/docs/rate-limits/ , https://communityhub.strava.com/insider-journal-9/an-update-to-our-developer-program-13428
- Webhooki: jedna subskrypcja na apkę, `POST /api/v3/push_subscriptions`; walidacja `GET callback?hub.challenge=…` → odpowiedź `{"hub.challenge": …}` w ≤ 2 s; event `POST` zawiera tylko `object_id/aspect_type/owner_id/event_time`, aktywność trzeba dociągnąć `GET /activities/{id}`. https://developers.strava.com/docs/webhooks/
- Pola aktywności: `distance` (m), `moving_time`, `elapsed_time` (s), `total_elevation_gain` (m), `sport_type`, `start_date`, **`manual`** (dodana ręcznie), `trainer`, `device_name`, `laps[]`, `splits_metric[]` (co 1 km: `distance`, `elapsed_time`, `moving_time`). https://developers.strava.com/docs/reference/
- Rate limit: 200 / 15 min i 2 000 / dzień (read: 100 / 1 000). Nieistotne dla 1 osoby.
- API Agreement (11.2024): dane Strava pokazujemy tylko osobie, której dotyczą. Panel admina pokazuje więc tylko werdykt i minimum metryk (dystans, czas, urządzenie, link), bez map.
- Garmin API tylko dla firm; Health Connect / HealthKit tylko on-device; parkrun bez API → wariant parkrun zad. 26 ręcznie.

### Next.js / Prisma / Docker
- Next.js stabilny: **16.3.x**. W Next 16 plik `middleware.ts` zastąpił **`proxy.ts`** (implementer weryfikuje przez context7). Standalone: `server.js` czyta `PORT`/`HOSTNAME`; `public` i `.next/static` kopiujemy ręcznie. https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- Prisma **7.10.x**: obowiązkowy `prisma.config.ts` (`datasource.url`, `migrations.path`, `migrations.seed`), generator `prisma-client` z wymaganym `output`, obowiązkowy driver adapter (`@prisma/adapter-pg` + `pg`), CLI nie ładuje `.env` (potrzebny `import "dotenv/config"`). https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Standalone nie zawiera `prisma.config.ts`, `prisma/` ani CLI → trzeba je skopiować do obrazu runtime osobno. https://github.com/prisma/prisma/discussions/29305
- `node:24-slim` wymaga `apt-get install openssl`. Oficjalny wzorzec Vercel `with-docker`: 3 stage, `USER node`, `HOSTNAME=0.0.0.0`.

## 4. Architektura

```
przeglądarka jubilata ──HTTPS──▶ caddy-docker-proxy ──sieć web──▶ app (Next.js 16, :3000)
przeglądarka Dawida  ──HTTPS──▶        (istnieje)                    │ sieć internal
Strava webhook       ──HTTPS──▶                                      ▼
                                                              db (postgres:16)
                                                              volume uploads
```

Jedna aplikacja Next.js, wszystko po stronie serwera (Server Components + Server Actions +
Route Handlers). Klient dostaje wyłącznie stan renderowany dla niego.

### Moduły (`src/`)

| Moduł | Odpowiedzialność |
|---|---|
| `config/site.ts` | Personalizacja (imię, wiek, nagroda, od kogo, data). |
| `lib/env.ts` | Walidacja zmiennych środowiskowych (zod), jedno miejsce odczytu. |
| `lib/db.ts` | Singleton PrismaClient z adapterem pg. |
| `lib/auth/session.ts` | Podpisywanie/weryfikacja wartości cookie (HMAC-SHA256, `AUTH_SECRET`). |
| `lib/auth/player.ts`, `lib/auth/admin.ts` | Odczyt/ustawienie cookie gracza i admina; `requirePlayer()`, `requireAdmin()`. |
| `lib/rules/*` | **Czyste funkcje**: ocena aktywności/okna względem reguły zadania. Bez DB. |
| `lib/progress.ts` | Maszyna stanów zadań: `getBoard`, `completeTask`, `submitManual`, `approve`, `reject`, `undoLast`, `reset`, `completeWithCode`. Jedyne miejsce, które zmienia `TaskProgress`. |
| `lib/codes.ts` | Generowanie i weryfikacja kodów odblokowujących (HMAC), rate limit prób. |
| `lib/strava/client.ts` | OAuth (`authorizeUrl`, `exchangeCode`, `refresh`), `getActivity`, `listActivities`. |
| `lib/strava/tokens.ts` | Szyfrowanie tokenów (AES-256-GCM, klucz z `AUTH_SECRET`) i zapis/odczyt `StravaAccount`. |
| `lib/strava/process.ts` | Wejście: aktywność Strava → cache → ocena względem aktywnego zadania → `progress`. |
| `lib/strava/sync.ts` | Fallback: `listActivities(after=unlockedAt)` gdy ostatnia synchronizacja > 10 min. |
| `lib/uploads.ts` | Zapis/odczyt zdjęć w `UPLOAD_DIR`, walidacja typu i rozmiaru. |
| `lib/notify/telegram.ts` | `notifyAdmin(text)`; no-op bez konfiguracji. |
| `lib/text.ts` | Pluralizacja polska (`koperta/koperty/kopert`). |
| `app/` | Strony: `/` (jubilat), `/start/[token]`, `/admin`, `/admin/login`; API: `/api/health`, `/api/strava/{connect,callback,webhook}`, `/api/uploads/[id]`. |
| `components/` | Komponenty UI 1:1 z artboardów. |

## 5. Weryfikacja zadań

### Reguły wspólne [R] dla każdego dopasowania automatycznego
`owner_id == athlete_id połączonego konta` ∧ `manual == false` ∧ `start_date ≥ unlocked_at − 10 min`
∧ `strava_activity_id` niewykorzystane w innym zadaniu ∧ `sport_type ∈ dozwolone`.
`trainer == true` lub `VirtualRun` lub brak `device_name` → nie odrzucamy, ale `flagged = true`
z powodem (Dawid widzi w panelu).

Czas na dystansie D: suma `elapsed_time` splitów `splits_metric` (po 1 km) aż do D, ostatni split
proporcjonalnie. Używamy `elapsed_time`, nie `moving_time` (autopauza).

`aspect_type = update` → ponowna ocena tylko, gdy zadanie nie jest `DONE`. `delete` aktywności użytej
jako dowód → zadanie zostaje `DONE`, ale `flagged`. Dedup eventów po `(object_id, aspect_type, event_time)`.

### Macierz (typ, reguła)

| # | Typ | Reguła |
|---|---|---|
| 1 | MANUAL | zdjęcie butów → Dawid |
| 2 | AUTO | Walk/Hike/Run, dist ≥ 3000, czas 3 km ≤ 2400 s |
| 3 | AUTO | Run/TrailRun, dist ≥ 1000, `elapsed − moving ≤ 20 s` na 1. splicie |
| 4 | AUTO | Run/TrailRun, dist ≥ 1500 |
| 5 | MANUAL | core |
| 6 | AUTO | Run/TrailRun, dist ≥ 2000, **zapisz `result_seconds` = czas 2 km** |
| 7 | MIXED | Run/Walk, elapsed ≥ 1200 s → PENDING_REVIEW |
| 8 | AUTO | okno 7 dni: ≥ 3 × Run (każdy ≥ 1000 m), Σ ≥ 6000 m |
| 9 | MANUAL | siłownia |
| 10 | AUTO | Run/TrailRun, dist ≥ 3000 |
| 11 | AUTO | Run/TrailRun, dist ≥ 2000, czas 2 km ≤ `result_seconds(zad. 6) − 30` |
| 12 | MANUAL | siłownia |
| 13 | AUTO | Run/TrailRun, dist ≥ 3500 |
| 14 | MIXED | okno 7 dni: ≥ 4 × {Run, Walk, WeightTraining, Workout, Crossfit, HIIT} → PENDING_REVIEW |
| 15 | AUTO | Run/TrailRun, dist ≥ 4000 |
| 16 | MIXED | Run, elapsed ≥ 900 s → PENDING_REVIEW (Dawid ocenia interwały) |
| 17 | MANUAL | siłownia |
| 18 | AUTO | Run/TrailRun, dist ≥ 4500 |
| 19 | AUTO | Run/TrailRun, dist ≥ 5000 |
| 20 | AUTO | Run/TrailRun, dist ≥ 3000, `total_elevation_gain` ≥ 50 |
| 21 | MANUAL | wspólny bieg → Dawid (podpowiedź: Run ≥ 5000 m tego dnia) |
| 22 | AUTO | Run/TrailRun, dist ≥ 6000 |
| 23 | MIXED | Run/TrailRun, elapsed ≥ 600 s → PENDING_REVIEW |
| 24 | MIXED | WeightTraining/Workout, elapsed ≥ 2700 s → PENDING_REVIEW |
| 25 | AUTO | Run/TrailRun, dist ≥ 7000 |
| 26 | MIXED | AUTO: Run, dist ≥ 5000, czas 5 km ≤ 2100 s; inaczej zgłoszenie ręczne (parkrun) |
| 27 | AUTO | Run/TrailRun, dist ≥ 8000 |
| 28 | AUTO | Run/TrailRun, dist ≥ 10000 → nagroda |

Uwaga do 26: typ MIXED z `autoComplete: true` — dopasowanie reguły zalicza od razu, brak dopasowania
nie blokuje zgłoszenia ręcznego.

### Maszyna stanów `TaskProgress.status`
```
LOCKED ──(poprzednie DONE)──▶ ACTIVE ──(AUTO match | kod | approve)──▶ DONE ──(unlock)──▶ następne ACTIVE
                                 │                                        ▲
                                 └─(zgłoszenie | MIXED match)─▶ PENDING_REVIEW ──(approve)──┘
                                                                     └─(reject)──▶ ACTIVE
DONE ──(admin undoLast; tylko ostatnie DONE)──▶ ACTIVE, a jego następca ACTIVE → LOCKED
```
`unlocked_at` ustawiane przy przejściu do ACTIVE. Aktywności Strava sprzed `unlocked_at` nie liczą się.

## 6. Dostęp i bezpieczeństwo

- Cookie gracza `bd_player` i admina `bd_admin`: wartość `payload.hmac`, `httpOnly`, `Secure` (prod),
  `SameSite=Lax`. Podpis HMAC-SHA256 z `AUTH_SECRET`, porównanie w stałym czasie.
- `/start/<token>`: porównanie z `PLAYER_TOKEN` (stały czas) → cookie na 120 dni → redirect `/`.
- `/admin/login`: hasło vs `ADMIN_PASSWORD` (stały czas), opóźnienie 1 s po błędzie, cookie 30 dni.
- `proxy.ts`: `/admin/*` bez cookie → redirect `/admin/login`; nagłówek `X-Robots-Tag: noindex` globalnie.
- Webhook: GET weryfikuje `hub.verify_token`; POST sprawdza `owner_id` == połączony sportowiec.
- Kody: `HMAC-SHA256(CODES_SECRET, "task:<id>")` → base32, 8 znaków, format `XXXX-XXXX`. Rate limit:
  ≥ 5 nieudanych prób w 10 min → odrzucenie. Kody widoczne tylko w panelu admina.
- Uploady: tylko `image/jpeg|png|webp|heic`, ≤ 10 MB, nazwa `randomUUID()`, serwowane tylko
  zalogowanemu graczowi lub adminowi.

## 7. Model danych (Prisma)

```
Task            id Int @id, stage Int, title, description, verification (AUTO|MIXED|MANUAL), rule Json
TaskProgress    taskId Int @id, status, unlockedAt?, completedAt?, source? (STRAVA|MANUAL|CODE|ADMIN),
                stravaActivityId BigInt? @unique, resultSeconds Int?, resultDistanceM Int?,
                flagged Boolean, flagReason?, note?, approvedAt?
Submission      id, taskId, note?, photoPath?, status (PENDING|APPROVED|REJECTED), createdAt, reviewedAt?
StravaAccount   athleteId BigInt @id, accessTokenEnc, refreshTokenEnc, expiresAt, scope, connectedAt, lastSyncAt?
StravaEvent     id, objectId BigInt, aspectType, eventTime BigInt, ownerId BigInt, payload Json,
                processedAt?, result?  @@unique([objectId, aspectType, eventTime])
StravaActivity  id BigInt @id, startDate, sportType, distanceM Float, movingTimeS Int, elapsedTimeS Int,
                elevGainM Float, manual Boolean, trainer Boolean, deviceName?, splits Json, laps Json, fetchedAt
CodeAttempt     id, taskId, success Boolean, createdAt
AuditLog        id, actor (PLAYER|ADMIN|SYSTEM), action, taskId?, meta Json, createdAt
```
Seed: 28 wierszy `Task` z `prisma/seed-data/tasks.json` (upsert, idempotentny), czysty JS + `pg`.

## 8. UI — mapowanie na artboardy

Wartości z `design/DESIGN.md` i raportu z artboardów (D = desktop ≥ 1024 px, M = mobile):

- **Breakpoint**: jeden, `@media (min-width: 1024px)` → grid `520px minmax(0,1fr)`, gap 72, padding boczny 72;
  poniżej: kolumna, padding 20. Artboardy nie mają stanów hover/focus ani animacji — dodajemy:
  hover przycisku (`#2a2622` tło), `:focus-visible` outline 3px `#c81e5a`, zapalenie świeczki
  `transition: box-shadow .4s, background .4s`.
- **Fonty**: `next/font/google` Anton 400 + Space Grotesk 400/500/700.
- **Tort**: rząd świeczek `align-items:flex-end`, gap D 5 / M 4, wysokość D 72 / M 56. Świeczka:
  płomień D 11×17 / M 8×13, `border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%`, tło `#ffd23f`,
  `border 2px #141210`, poświata D `0 0 0 3px rgba(255,210,63,.35), 0 0 12px rgba(255,150,30,.6)`;
  niezapalona: kółko 6×6 `border 2px dashed #a39c8c`; knot 2×6 `#141210`; korpus D 12×36 / M 8×24,
  `border 2px #141210`, radius 3, `repeating-linear-gradient(-45deg,#fff 0 4px,#c81e5a 4px 8px)`.
  Warstwy: żółta D 320×52 / M 240×42 (`border 3px`, radius `14px 14px 6px 6px` / `12px 12px 6px 6px`,
  `margin-top:-3px`); malinowa D 400×84 / M 300×62 (`border-top:0`, radius `0 0 6px 6px`, wiek Anton
  D 60 / M 44, ls 4/3, kolor `#f4ecdc`); biała D 480×64 / M 350×50 (`border-top:0`, radius `0 0 8px 8px`,
  kropelki `repeating-linear-gradient(90deg,#141210 0 3px,transparent 3px 26px)` (M 22px),
  `background-size:100% 14px` (M 12), `no-repeat`, `position 0 100%`); podstawa D 480×14 / M 350×12
  `#141210`, radius `0 0 10px 10px`, cień D `8px 8px 0` / M `6px 6px 0 #141210`. Na mobile tort
  `max-width:100%` z `transform: scale()` gdy viewport < 390 px.
- **Pigułka**: `margin-top` D 26 / M 22, padding D `8px 18px` / M `6px 14px`, `border 2px`, radius 999,
  białe tło, 700, uppercase, ls 2, font D 13 / M 12. Tekst: `Zapalone: {done} / 28`.
- **Top bar**: flex space-between, `padding-top` D 28 / M 24, font D 13 / M 12, 700, ls 2, uppercase;
  prawy tekst `#c81e5a`.
- **Hero**: gap D 14 / M 10; h1 Anton D 68 / lh .96, M 48 / lh .98, ls 1, uppercase, imię w `#c81e5a`;
  lead D 17 / lh 1.55 / max-width 480, M 15 / lh 1.5, `#4a453c`.
- **Nagłówek listy (desktop)**: flex baseline, `padding-bottom 6`, `border-bottom 3px`; "Koperty" Anton 28
  ls 1; prawy `{done} / 28 zaliczone` 12px 700 ls 2 `#6b655a`. **Nagłówek etapu** (oba): 11px 700 ls 2
  uppercase `#6b655a`, `margin-top 12`: "Etap {n} · {nazwa}".
- **Koperta zaliczona**: flex center, gap D 16 / M 14, padding D `14px 18px` / M `14px 16px`,
  `border 3px #141210`, radius 12, białe tło; kółko 40 `#141210` z checkiem 20 `#ffd23f`;
  etykieta 11px 700 `#6b655a` "KOPERTA n · ZALICZONA"; tytuł Anton 24 lh 1.05 `#6b655a`
  `line-through` (`text-decoration-color #c81e5a`, thickness 3).
- **Koperta aktywna**: kolumna gap 12, padding D `22px 24px` / M 20, radius 14, `border 3px`, cień
  D `8px 8px 0 #c81e5a` / M `6px`; wiersz: pigułka (`#ffd23f`, `border 2px`, padding D `4px 12px` /
  M `4px 10px`, 11px 700 ls 2) "KOPERTA n · OTWARTA" + ikona hantli D 24 / M 22; tytuł Anton D 40 /
  M 36 lh 1 ls 1; opis D 16 / M 15 lh 1.5 `#4a453c`; formularz zgłoszenia (notatka, zdjęcie, kod);
  przycisk h 52, `border 3px`, radius 10, tło `#141210`, tekst `#ffd23f` 14px 700 ls 2
  "ZROBIONE — ZAPAL ŚWIECZKĘ" (D `align-self:flex-start; padding 0 28px`, M pełna szerokość).
  Stan `PENDING_REVIEW`: pigułka "KOPERTA n · CZEKA NA DAWIDA", przycisk disabled (`opacity .5`).
  Zadania AUTO: zamiast przycisku tekst "Zalicza się samo po biegu w Stravie" + (gdy Strava nie
  połączona) link "Połącz Stravę".
- **Koperta zaklejona**: `position:relative; overflow:hidden`, padding D `14px 18px` / M 16, gap D 16 /
  M 14, `border 3px dashed #a39c8c`, radius 12, tło `#ede3cf`; klapa absolutna `top -40 / h 80`
  (M `-36 / 72`), `left 0 right 0`, tło `#e2d6be`, `clip-path: polygon(0 0,100% 0,50% 100%)`;
  pieczęć 40 `#c81e5a` `border 3px #141210` z kłódką 16 (stroke 2.5, biała); etykieta 11px
  "KOPERTA n · ZAKLEJONA"; "??? ??? ???" Anton 22 ls 3 `#a39c8c`.
- **Prezent zablokowany**: `position:relative; overflow:hidden`, flex gap D 20 / M 16, padding D 24 /
  M 20, radius D 16 / M 14, białe tło, `border 3px`; wstążki: pion `left 50%`, szer. D 16 / M 14,
  `margin-left` D -8 / M -7, `#c81e5a`, `border-left/right 2px #141210`; poziom analogicznie `top 50%`;
  kółko D 64 / M 56 tło `#f4ecdc` `border 3px` z kłódką D 28 / M 26; blok tekstu białe tło padding
  D `8px 10px` / M `6px 8px` radius 8 gap D 4 / M 3: "PREZENT GŁÓWNY" D 12 / M 11 `#c81e5a`;
  "Jeszcze {n} {koperta|koperty|kopert}" Anton D 30 / M 26; "Wstążka puści, gdy tort będzie gotowy."
  D 14 / M 13 `#6b655a`.
- **Prezent odblokowany**: D poziomo gap 24 padding 28 radius 16 tło `#ffd23f` `border 3px` cień
  `8px 8px 0 #141210`, ikona 56; M kolumna center gap 10 padding `28px 22px` radius 14 cień 6px,
  ikona 44; etykieta D 12 / M 11 700 "TORT GOTOWY · PREZENT ROZPAKOWANY"; nazwa Anton D 44 / M 40;
  opis D 15 / M 14 `#4a453c`.
- **Stopka**: 500 `#6b655a` D 13 / M 12, M wyśrodkowana: "Z miłością i lekkim sadyzmem — {od kogo}".
- **Ikony** (inline SVG, `viewBox 0 0 24 24`, `fill none`, `stroke-linecap/linejoin round`, `aria-hidden`):
  check `M5 13l4 4L19 7` (sw 3); hantle `M6 5v14 M18 5v14 M3 8v8 M21 8v8 M6 12h12` (sw 2);
  kłódka `rect x5 y11 w14 h10 rx2` + `M8 11V7a4 4 0 0 1 8 0v4`; prezent `M20 12v9H4v-9`,
  `M2 7h20v5H2z`, `M12 22V7`, `M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7z`,
  `M12 7h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7z` (sw 2).

## 9. Panel admina (`/admin`)

Sekcje: (1) status Strava (połączona? ostatnia synchronizacja) + link startowy dla jubilata
(`/start/<token>` do skopiowania); (2) **Do zatwierdzenia**: zgłoszenia PENDING i zadania
PENDING_REVIEW z metrykami/zdjęciem/notatką, przyciski Zatwierdź / Odrzuć; (3) tablica 28 zadań ze
statusem, źródłem, flagą, metrykami; przycisk "Cofnij ostatnie"; (4) kody odblokowujące (28, do wydruku);
(5) "Resetuj postęp" (wymaga wpisania słowa RESET); (6) ostatnie 50 wpisów AuditLog.

## 10. Deploy (zgodnie z `demo-deploy.md`)

- `Dockerfile`: `base → deps → build → prisma-cli → runtime` (`node:24-slim` + openssl, `USER node`,
  `HOSTNAME=0.0.0.0`, `PORT=3000`, `UPLOAD_DIR=/data/uploads` z `mkdir + chown` w obrazie). Runtime
  dostaje `public`, `.next/standalone`, `.next/static`, `prisma/`, `prisma.config.ts`, samodzielną
  instalację `prisma` CLI + `pg` + `dotenv` w `/app/tools`.
- `docker/entrypoint.sh`: sprawdź zapis do `UPLOAD_DIR` → `migrate deploy` → `node prisma/seed.cjs`
  → `exec node server.js`.
- `docker-compose.prod.yml`: `name: urodzinowe`; `db` tylko `internal`; `app` w `internal + web`, bez
  `ports:`, labele `caddy.*`, volume `uploads`, healthcheck `/api/health` (SELECT 1), `start_period 60s`.
- Zmienne: `APP_DOMAIN` (config); losowane i zachowywane: `POSTGRES_PASSWORD`, `AUTH_SECRET`,
  `CODES_SECRET`, `PLAYER_TOKEN`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `ADMIN_PASSWORD`; od człowieka
  (prompt przy pierwszym deployu lub z lokalnego env, nigdy w `deploy.conf`): `STRAVA_CLIENT_ID`,
  `STRAVA_CLIENT_SECRET`; opcjonalne: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
- `scripts/deploy.sh` (`--dry-run`, `--config`, `--set-secret KEY`, `--no-wait`) +
  `scripts/lib/deploy-lib.sh` (czyste generatory; dry-run z placeholderami sekretów) +
  `tests/deploy-lib.test.sh`.
- `scripts/strava-subscribe.sh` → przez ssh `docker compose exec app node scripts/strava-subscribe.cjs`
  (idempotentna rejestracja webhooka). `scripts/backup.sh` (pg_dump + tar wolumenu uploads).
- Dev lokalny: `docker-compose.dev.yml` (tylko Postgres), `.env` lokalny, webhook przez `cloudflared`
  z osobną apką Strava dev.

## 11. Poza zakresem

Tryb "zdmuchiwane", wielu graczy, S3, e-mail, PWA/offline, i18n, Prisma 8, automatyczna analiza
interwałów z `laps` (zostaje MIXED → Dawid), import wyników parkrun.

## 12. Ryzyka

| Ryzyko | Mitygacja |
|---|---|
| Strava: subskrypcja płatna + limit 1 sportowca | Checklista przed urodzinami: kup subskrypcję, załóż apkę, self-upgrade do 10 sportowców, **przetestuj autoryzację z drugiego konta**. Bez Stravy aplikacja działa w trybie MANUAL (kody + panel). |
| Zgubione webhooki | `sync.ts` na wejściu jubilata (≥ 10 min od ostatniej) + przycisk "Synchronizuj" w panelu. |
| Szum GPS (przewyższenie, tempo) | Dawid ma "Cofnij" i widzi flagi. |
| Zmiana `refresh_token` przy odświeżeniu | Zawsze zapisujemy nowy; błąd 401 → oznaczamy konto jako rozłączone i pokazujemy jubilatowi "Połącz ponownie". |
| Prisma 7 w standalone | Osobny stage `prisma-cli`, kopiowanie `prisma/` + `prisma.config.ts` (fakt z dyskusji prisma#29305). |

## 13. Checklista Dawida przed urodzinami

1. Subskrypcja Strava → apka na strava.com/settings/api (Authorization Callback Domain = `APP_DOMAIN`) → API Settings: podnieś limit sportowców.
2. Deploy (`bash scripts/deploy.sh`), potem `bash scripts/strava-subscribe.sh`.
3. W `/admin` skopiuj link startowy; wejdź nim z konta jubilata w trybie testowym, połącz Stravę drugim kontem, sprawdź, czy testowy bieg zalicza zadanie 3; potem "Resetuj postęp".
4. Wydrukuj kody z panelu (opcjonalnie).
5. Uzupełnij `src/config/site.ts` (imię, wiek, nagroda, od kogo, data).
