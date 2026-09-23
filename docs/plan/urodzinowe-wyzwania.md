# Urodzinowe wyzwania — plan implementacji (wersja 2: zatwierdzanie ręczne)

> **Dla agentów wykonawczych:** WYMAGANY SKILL: `superpowers:subagent-driven-development`
> (zalecane) lub `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`) do odhaczania.
> Każde zadanie realizuje agent `implementer` uruchomiony z **`model: "opus"` (Opus 5.5)**,
> po nim agent `reviewer`. Implementer modyfikuje WYŁĄCZNIE pliki ze swojej listy.
> Przed użyciem API Next.js 16 / Prisma 7 / Vitest implementer weryfikuje sygnatury przez context7.

**Cel:** Jednoosobowa apka "Urodzinowe wyzwania": 28 zadań odblokowywanych sekwencyjnie; jubilat zgłasza
wykonanie z dowodem, Dawid zatwierdza w panelu (lub podaje kod), tort-progres 1:1 wg artboardów, deploy
jako stack Docker za wspólnym proxy Caddy.

**Architektura:** Next.js 16 App Router (Server Components + Server Actions + Route Handlers), cały stan
w Postgresie przez Prisma 7. Maszyna stanów w `src/lib/progress.ts` jest jedynym miejscem zmieniającym postęp.
Deploy 1:1 z `demo-deploy.md`.

**Stos:** Node 24, Next.js 16.3.x, TypeScript, Prisma 7.10.x + `@prisma/adapter-pg` + `pg`, Postgres 16, zod,
Vitest, CSS Modules, `next/font/google`, Docker multi-stage, bash.

**Spec:** `docs/superpowers/specs/2026-09-23-urodzinowe-wyzwania-design.md` (dalej: SPEC). Style: SPEC §8,
dowody per zadanie: SPEC §5, model danych: SPEC §7, panel: SPEC §9.

## Ograniczenia globalne

- Wersje: `next@^16.3`, `prisma@^7.10`, `@prisma/client@^7.10`, `@prisma/adapter-pg@^7.10`, `pg@^8`, `zod@^3`,
  `vitest@^3`, Node `>=24`. Bez Prisma 8 RC, bez Tailwinda.
- Komentarze, komunikaty UI i logi po polsku. Nazwy w kodzie po angielsku.
- Sekrety tylko przez `process.env`, czytane wyłącznie w `src/lib/env.ts`.
- Postęp nigdy w `localStorage`. Tytuły zadań `LOCKED` nigdy nie trafiają do odpowiedzi HTTP.
- Porównania sekretów/hasła/tokenów/kodów w stałym czasie (`crypto.timingSafeEqual`).
- Prisma: generator `prisma-client`, `output = "../src/generated/prisma"` (gitignored), klient z `PrismaPg`.
- Testy jednostkowe (bez DB) w `*.test.ts` obok kodu; integracyjne z DB w `tests/integration/*.test.ts`
  na bazie z `docker-compose.dev.yml`, każdy test czyści tabele w `beforeEach`.
- Commity: `git add <pliki zadania> && git commit -m "claude: T<n> — <opis>"`. Gałąź `claude/auto`.
- Weryfikacja końcowa zadania: `npm run check` (= `tsc --noEmit && vitest run`); dla zadań deployowych
  dodatkowo `bash tests/deploy-lib.test.sh`.

## Struktura plików (docelowa)

```
.
├── design/                      # artboardy + DESIGN.md (referencja)
├── docs/plan/, docs/superpowers/specs/
├── prisma/{schema.prisma, migrations/, seed.cjs, seed-data/tasks.json}
├── prisma.config.ts, next.config.ts, tsconfig.json, vitest.config.ts, package.json
├── .env.example, .gitignore, .dockerignore
├── Dockerfile, docker/entrypoint.sh, docker-compose.prod.yml, docker-compose.dev.yml
├── deploy.conf.example, scripts/{deploy.sh, lib/deploy-lib.sh, backup.sh}
├── tests/{deploy-lib.test.sh, docker-smoke.sh, fixtures/, integration/}
└── src/
    ├── config/site.ts
    ├── proxy.ts
    ├── lib/{env.ts, db.ts, text.ts, audit.ts, progress.ts, codes.ts, uploads.ts, tasks.ts}
    ├── lib/auth/{session.ts, player.ts, admin.ts}
    ├── components/{icons.tsx, TopBar, Cake, ProgressPill, Hero, StageHeader, EnvelopeDone, EnvelopeActive,
    │              EnvelopeLocked, GiftLocked, GiftUnlocked, Footer, SubmitForm}  (Name.tsx + Name.module.css)
    ├── components/admin/{PendingCard, TaskTable, CodesList, DangerZone, CopyButton}.tsx
    └── app/{layout.tsx, globals.css, page.tsx, page.module.css, actions.ts,
             start/[token]/route.ts,
             admin/{page.tsx, page.module.css, actions.ts, login/{page.tsx, actions.ts, login.module.css}},
             api/{health, uploads/[id]}/route.ts,
             dev/preview/page.tsx}
```

## Kolejność i zależności

| Zadanie | Zależy od | Można równolegle z |
|---|---|---|
| T1 Szkielet projektu | — | — |
| T2 Schemat, seed, typy zadań | T1 | T9 (Docker bez seeda się nie zbuduje — T9 po T2), T10 |
| T3 Sesje i dostęp | T1 | T2, T4, T5, T6, T10 |
| T4 Maszyna stanów, kody, audyt | T2 | T3, T5, T6, T10 |
| T5 Tokeny CSS, tekst, komponenty bazowe | T1 | T2, T3, T4, T6, T10 |
| T6 Uploady | T1, T3 | T4, T5, T10 |
| T7 Strona jubilata | T3, T4, T5, T6 | T8, T9 |
| T8 Panel admina | T3, T4, T6 | T7, T9 |
| T9 Obraz Docker + compose | T2 | T7, T8, T10 |
| T10 Skrypty deployu + testy bash | T1 | T2–T9 |
| T11 Backup + README | T9, T10 | — |

---

### T1: Szkielet projektu (Next 16 + Prisma 7 + Vitest + dev DB)

**Pliki:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `prisma.config.ts`, `vitest.config.ts`, `.gitignore`,
  `.dockerignore`, `.env.example`, `docker-compose.dev.yml`, `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/db.ts`,
  `src/app/layout.tsx`, `src/app/globals.css`, `src/app/api/health/route.ts`, `src/config/site.ts`
- Move: `DESIGN.md`, `desktop.html`, `mobile.html`, `mobile-meta.html` → `design/` (git mv)

**Interfejsy:**
- Produces: `getEnv(): Env` (memoizowane), `loadEnv(source): Env` (czyste); `prisma` (singleton);
  `site` (`{ name, age, rewardTitle, rewardDescription, from, dateLabel, stages, totalTasks }`).

- [x] **Krok 1: Inicjalizacja**

Repo git już istnieje (commit "initial" na `main`). Upewnij się, że jesteś na `claude/auto`.
```bash
mkdir -p design && git mv DESIGN.md desktop.html mobile.html mobile-meta.html design/
npx create-next-app@latest . --ts --app --src-dir --no-tailwind --no-eslint --import-alias "@/*" --turbopack --yes
npm i zod pg @prisma/client@^7.10 @prisma/adapter-pg@^7.10
npm i -D prisma@^7.10 vitest@^3 @types/pg dotenv
```
Jeśli `create-next-app` odmówi pracy w niepustym katalogu: uruchom w katalogu tymczasowym i skopiuj pliki
(bez `README.md`, `public/*.svg`, `src/app/page.tsx`). **Nie tworzyć `src/app/page.tsx`** (powstaje w T7).

- [x] **Krok 2: Test `loadEnv` (failing)** — `src/lib/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";
const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db", AUTH_SECRET: "a".repeat(40), CODES_SECRET: "b".repeat(20),
  PLAYER_TOKEN: "c".repeat(32), ADMIN_PASSWORD: "haslo-admina", APP_URL: "http://localhost:3000", UPLOAD_DIR: "./.data/uploads",
};
describe("loadEnv", () => {
  it("parsuje poprawny zestaw i ustawia domyślne NODE_ENV", () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.UPLOAD_DIR).toBe("./.data/uploads");
  });
  it("rzuca błąd z nazwami brakujących zmiennych", () => {
    const { AUTH_SECRET: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/AUTH_SECRET/);
  });
  it("odrzuca za krótki AUTH_SECRET", () => expect(() => loadEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/));
});
```
- [x] **Krok 3: FAIL** — `npx vitest run src/lib/env.test.ts`.
- [x] **Krok 4: `src/lib/env.ts`**
```ts
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  CODES_SECRET: z.string().min(16),
  PLAYER_TOKEN: z.string().min(16),
  ADMIN_PASSWORD: z.string().min(8),
  APP_URL: z.string().url(),
  UPLOAD_DIR: z.string().min(1),
});
export type Env = z.infer<typeof schema>;
export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) throw new Error(`Błędna konfiguracja środowiska: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return parsed.data;
}
let cached: Env | undefined;
export function getEnv(): Env { return (cached ??= loadEnv(process.env)); }
```
- [x] **Krok 5: Konfiguracja**

`prisma.config.ts`:
```ts
import "dotenv/config";
import { defineConfig, env } from "prisma/config";
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "node prisma/seed.cjs" },
  datasource: { url: env("DATABASE_URL") },
});
```
`src/lib/db.ts`:
```ts
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "./env";
const g = globalThis as unknown as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient({ adapter: new PrismaPg({ connectionString: getEnv().DATABASE_URL }) });
if (process.env.NODE_ENV !== "production") g.prisma = prisma;
```
(Implementer: zweryfikuj przez context7 ścieżkę importu klienta generatora `prisma-client` w 7.10.)
`next.config.ts`: `output: "standalone"`. `vitest.config.ts`: `environment: "node"`, alias `@` → `src`,
`include: ["src/**/*.test.ts", "tests/**/*.test.ts"]`, `setupFiles: ["dotenv/config"]`.
`docker-compose.dev.yml`: `db` `postgres:16`, `ports: ["127.0.0.1:5432:5432"]`, user/hasło/db `urodzinowe`, volume `dbdata_dev`.
`.env.example`: klucze z `loadEnv` (`DATABASE_URL=postgresql://urodzinowe:urodzinowe@localhost:5432/urodzinowe`,
`UPLOAD_DIR=./.data/uploads`, `APP_URL=http://localhost:3000`, sekrety `zmien-mnie-…` o wymaganej długości).
`.gitignore`: `node_modules/ .next/ .env .env.* !.env.example .data/ src/generated/ deploy.conf backups/ *.key *.crt *.csr`.
`.dockerignore`: `node_modules .next .git .data backups deploy.conf .env* design docs tests scripts *.md docker-compose.dev.yml`
(nie ignorować `docker/`, `prisma/`, `prisma.config.ts`).
`src/config/site.ts`:
```ts
export const site = {
  name: "[IMIĘ]", age: 28, rewardTitle: "[NAGRODA GŁÓWNA]",
  rewardDescription: "[Krótki opis nagrody lub gdzie ją odebrać]", from: "[OD KOGO]",
  dateLabel: "23.09 · Birthday Run",
  stages: ["Rozruch", "Budowanie nawyku", "Wytrzymałość", "Prosta do finału"] as const,
  totalTasks: 28,
};
```
`src/app/layout.tsx`: `lang="pl"`, `Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" })`,
`Space_Grotesk({ weight: ["400","500","700"], subsets: ["latin","latin-ext"], variable: "--font-grotesk" })`,
`viewport` z `width=device-width, initial-scale=1`. `src/app/globals.css`:
```css
:root {
  --bg:#f4ecdc; --ink:#141210; --accent:#c81e5a; --accent-hover:#9c1546; --yellow:#ffd23f; --text-2:#4a453c;
  --muted:#6b655a; --locked:#a39c8c; --card:#fff; --card-locked:#ede3cf; --flap:#e2d6be;
  --font-display: var(--font-anton), Impact, sans-serif; --font-body: var(--font-grotesk), system-ui, sans-serif;
}
body { margin:0; background:var(--bg); color:var(--ink); font-family:var(--font-body); }
a { color:var(--accent); } a:hover { color:var(--accent-hover); }
button, input, textarea { font-family:inherit; } button { cursor:pointer; }
:focus-visible { outline:3px solid var(--accent); outline-offset:2px; }
```
`src/app/api/health/route.ts`: `export const dynamic = "force-dynamic"`; `SELECT 1` przez `prisma.$queryRaw` → `{ok:true}` lub 503.
`package.json` scripts: `dev`, `build`, `start`, `check: "tsc --noEmit && vitest run"`, `test: "vitest run"`,
`db:up: "docker compose -f docker-compose.dev.yml up -d"`, `db:migrate: "prisma migrate dev"`, `db:seed: "prisma db seed"`,
`postinstall: "prisma generate"`.
- [x] **Krok 6: PASS** `npx vitest run src/lib/env.test.ts` (3 testy) i `tsc --noEmit` (tymczasowy `model Ping { id Int @id }` w schemacie, jeśli `generate` wymaga modelu; T2 go zastąpi).
- [x] **Krok 7: Commit** `claude: T1 — szkielet Next 16 + Prisma 7 + Vitest`.

---

### T2: Schemat Prisma, seed 28 zadań, typy zadań

**Pliki:**
- Create: `prisma/schema.prisma`, `prisma/migrations/<ts>_init/migration.sql` (przez `prisma migrate dev --name init`),
  `prisma/seed-data/tasks.json`, `prisma/seed.cjs`, `src/lib/tasks.ts`, `src/lib/tasks.test.ts`

**Interfejsy:**
- Produces: enumy `TaskStatus {LOCKED, ACTIVE, PENDING_REVIEW, DONE}`, `Proof {PHOTO, PHOTO_OPTIONAL, NONE}`,
  `Source {MANUAL, CODE, ADMIN}`, `SubmissionStatus {PENDING, APPROVED, REJECTED}`, `Actor {PLAYER, ADMIN, SYSTEM}`;
  `taskSeedSchema` (zod), `TaskSeed`, `TASK_COUNT = 28`, `STAGE_SIZE = 7`.

- [x] **Krok 1: `src/lib/tasks.ts`**
```ts
import { z } from "zod";
export const TASK_COUNT = 28; export const STAGE_SIZE = 7;
export const taskSeedSchema = z.object({
  id: z.number().int().min(1).max(TASK_COUNT), stage: z.number().int().min(1).max(4),
  title: z.string().min(1), description: z.string().min(1),
  proof: z.enum(["PHOTO", "PHOTO_OPTIONAL", "NONE"]), proofHint: z.string().min(1),
  askDistance: z.boolean(), askDuration: z.boolean(), maxPhotos: z.union([z.literal(1), z.literal(4)]),
  compareToTask: z.number().int().optional(), minImprovementS: z.number().int().positive().optional(),
  minDistanceM: z.number().int().positive().optional(),   // do ostrzeżeń: dystans poniżej progu z tytułu
  maxDurationS: z.number().int().positive().optional(),   // do ostrzeżeń: czas powyżej limitu (zad. 2, 26)
}).refine((t) => (t.compareToTask === undefined) === (t.minImprovementS === undefined), { message: "compareToTask i minImprovementS razem" });
export type TaskSeed = z.infer<typeof taskSeedSchema>;
```
- [x] **Krok 2: Test `tasks.test.ts` (failing)**: 28 zadań o id 1..28, po 7 na etap; każde przechodzi `taskSeedSchema`;
  `PHOTO`/`PHOTO_OPTIONAL` mają `proofHint` ≠ ""; zadanie 11 ma `compareToTask 6, minImprovementS 30`; zadanie 21 ma `proof NONE`;
  8 i 14 mają `maxPhotos 4`; 2 ma `maxDurationS 2400`, 26 ma `maxDurationS 2100`; każde `askDistance` ma `minDistanceM`.
- [x] **Krok 3: `prisma/seed-data/tasks.json`** — 28 obiektów wg SPEC §5 (tytuły dosłownie z `zadania.md`, opisy 1–2 zdania w tonie
  makiety). Przykłady:
```json
[
 {"id":1,"stage":1,"title":"Załóż nowe buty i wyślij mi zdjęcie 📸","description":"Jedyne miękkie zadanie. Buty na nogach, uśmiech opcjonalny.","proof":"PHOTO","proofHint":"Zdjęcie nowych butów na nogach.","askDistance":false,"askDuration":false,"maxPhotos":1},
 {"id":2,"stage":1,"title":"Marsz 3 km w czasie poniżej 40 min","description":"Szybki spacer z włączonym zegarkiem.","proof":"PHOTO","proofHint":"Screenshot z zegarka lub aplikacji: dystans, czas, data.","askDistance":true,"askDuration":true,"maxPhotos":1,"minDistanceM":3000,"maxDurationS":2400},
 {"id":6,"stage":1,"title":"Przebiegnij 2 km","description":"Zapamiętamy Twój czas. Wróci w zadaniu 11.","proof":"PHOTO","proofHint":"Screenshot biegu: dystans, czas, data.","askDistance":true,"askDuration":true,"maxPhotos":1,"minDistanceM":2000},
 {"id":8,"stage":2,"title":"3 treningi biegowe w ciągu 7 dni (łącznie min. 6 km)","description":"Trzy biegi w tydzień. Dołącz screenshoty wszystkich.","proof":"PHOTO","proofHint":"Screenshoty 3 biegów z 7 dni (do 4 zdjęć).","askDistance":true,"askDuration":false,"maxPhotos":4,"minDistanceM":6000},
 {"id":9,"stage":2,"title":"Siłownia: 3 × 12 przysiadów ze sztangą/hantlami + 3 × 10 wykroków na nogę","description":"Zdjęcie z siłowni albo notatka z ciężarami.","proof":"PHOTO_OPTIONAL","proofHint":"Zdjęcie z siłowni lub notatka: serie i ciężar.","askDistance":false,"askDuration":false,"maxPhotos":1},
 {"id":11,"stage":2,"title":"Przebiegnij 2 km szybciej niż w zadaniu 6 o min. 30 s","description":"Ten sam dystans, lepszy czas.","proof":"PHOTO","proofHint":"Screenshot biegu 2 km z czasem.","askDistance":true,"askDuration":true,"maxPhotos":1,"minDistanceM":2000,"compareToTask":6,"minImprovementS":30},
 {"id":21,"stage":3,"title":"Wspólny bieg ze mną – min. 5 km (weryfikacja: ja 😉)","description":"Umówimy się. Dawid zalicza na miejscu.","proof":"NONE","proofHint":"Bez dowodu — Dawid biegnie z Tobą.","askDistance":false,"askDuration":false,"maxPhotos":1},
 {"id":26,"stage":4,"title":"Przebiegnij 5 km w czasie poniżej 35 min (lub parkrun z oficjalnym wynikiem)","description":"Screenshot z zegarka albo wynik parkrun.","proof":"PHOTO","proofHint":"Screenshot 5 km z czasem albo wynik parkrun.","askDistance":true,"askDuration":true,"maxPhotos":1,"minDistanceM":5000,"maxDurationS":2100},
 {"id":28,"stage":4,"title":"🏁 Przebiegnij 10 km – nagroda odblokowana","description":"Ostatnia świeczka.","proof":"PHOTO","proofHint":"Screenshot biegu 10 km.","askDistance":true,"askDuration":true,"maxPhotos":1,"minDistanceM":10000}
]
```
Pozostałe zadania wg tabeli w SPEC §5 (3, 4, 10, 13, 15, 18, 19, 22, 25, 27 jak 6 z odpowiednim `minDistanceM`; 5, 12, 17 jak 9;
7, 16, 23 `PHOTO`, `askDuration true`; 14 jak 8 bez `askDistance`; 20 `PHOTO`, `askDistance` + `askDuration`, `minDistanceM 3000`;
24 `PHOTO_OPTIONAL`, `askDuration true`).
- [x] **Krok 4: `prisma/schema.prisma`** (dokładnie SPEC §7):
```prisma
generator client { provider = "prisma-client"; output = "../src/generated/prisma" }
datasource db { provider = "postgresql" }
enum TaskStatus { LOCKED ACTIVE PENDING_REVIEW DONE }
enum Proof { PHOTO PHOTO_OPTIONAL NONE }
enum Source { MANUAL CODE ADMIN }
enum SubmissionStatus { PENDING APPROVED REJECTED }
enum Actor { PLAYER ADMIN SYSTEM }
model Task {
  id Int @id
  stage Int
  title String
  description String
  proof Proof
  proofHint String
  askDistance Boolean
  askDuration Boolean
  maxPhotos Int
  compareToTask Int?
  minImprovementS Int?
  minDistanceM Int?
  maxDurationS Int?
  progress TaskProgress?
  submissions Submission[]
}
model TaskProgress {
  taskId Int @id
  task Task @relation(fields: [taskId], references: [id])
  status TaskStatus @default(LOCKED)
  unlockedAt DateTime?
  completedAt DateTime?
  source Source?
  resultSeconds Int?
  resultDistanceM Int?
  lastRejectReason String?
  updatedAt DateTime @updatedAt
}
model Submission {
  id String @id @default(cuid())
  taskId Int
  task Task @relation(fields: [taskId], references: [id])
  note String?
  photos Json
  photoHashes Json
  distanceM Int?
  durationS Int?
  warnings Json
  status SubmissionStatus @default(PENDING)
  createdAt DateTime @default(now())
  reviewedAt DateTime?
  reviewNote String?
  @@index([status])
}
model CodeAttempt { id String @id @default(cuid()); taskId Int; success Boolean; createdAt DateTime @default(now()); @@index([createdAt]) }
model AuditLog { id String @id @default(cuid()); actor Actor; action String; taskId Int?; meta Json?; createdAt DateTime @default(now()); @@index([createdAt]) }
```
`npm run db:up && npx prisma migrate dev --name init`.
- [x] **Krok 5: `prisma/seed.cjs`** (czysty JS + `pg`, idempotentny UPSERT wszystkich kolumn `Task`, transakcja, `console.log("Seed: 28 zadań (upsert).")`,
  exit 1 przy błędzie). Uruchom `npm run db:seed` dwa razy — bez błędu, 28 wierszy.
- [x] **Krok 6: PASS** `npm run check`. **Commit** `claude: T2 — schemat Prisma, seed 28 zadań`.

---

### T3: Sesje, link startowy, logowanie admina, proxy

**Pliki:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`, `src/lib/auth/player.ts`, `src/lib/auth/admin.ts`,
  `src/proxy.ts`, `src/app/start/[token]/route.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`,
  `src/app/admin/login/login.module.css`

**Interfejsy:**
- Produces: `signValue(payload, secret): string` (`payload.sig`, HMAC-SHA256 base64url), `verifyValue(token, secret): string | null`,
  `safeEqual(a, b): boolean`; `PLAYER_COOKIE="bd_player"`, `ADMIN_COOKIE="bd_admin"`; `isPlayer(): Promise<boolean>`,
  `setPlayerCookie()`; `isAdmin()`, `requireAdmin()` (redirect `/admin/login`), `setAdminCookie()`, `clearAdminCookie()`;
  action `loginAdmin(prev, formData)`.

- [ ] **Krok 1: Test `session` (failing)**: podpis i weryfikacja; zmieniony znak → null; inny sekret → null; brak kropki → null;
  `safeEqual` różne długości → false, równe → true.
- [ ] **Krok 2: Implementacja `session.ts`** (`timingSafeEqual` na buforach równej długości).
- [ ] **Krok 3: `player.ts`/`admin.ts`** — `cookies()` z `next/headers` (async; context7); payload `player:<issuedAtMs>` /
  `admin:<issuedAtMs>`; ważność 120 / 30 dni sprawdzana przy odczycie; `httpOnly`, `sameSite:"lax"`, `secure` w prod, `path:"/"`.
- [ ] **Krok 4: `start/[token]/route.ts`** — `safeEqual(token, PLAYER_TOKEN)` → cookie → `redirect("/")`; inaczej 404 "Nie znaleziono".
- [ ] **Krok 5: `admin/login`** — formularz z hasłem, action: `safeEqual` → cookie → `redirect("/admin")`; błąd: `sleep(1000)` + "Nieprawidłowe hasło".
  Karta w stylu koperty aktywnej (SPEC §8), mobile-first.
- [ ] **Krok 6: `src/proxy.ts`** — `/admin` (bez `/admin/login`) bez ważnego cookie → redirect `/admin/login`; wszystkie odpowiedzi
  `X-Robots-Tag: noindex, nofollow`; `matcher: ["/((?!_next|api/health).*)"]`. Podpis weryfikuj Web Crypto (`crypto.subtle`), chyba że
  context7 potwierdzi runtime Node w proxy 16.3 — wtedy `session.ts`. Opisz wybór w raporcie.
- [ ] **Krok 7: Ręcznie** — `curl -I localhost:3000/admin` → 307; `/start/zly` → 404; `/start/$PLAYER_TOKEN` → 307 + `Set-Cookie: bd_player`.
- [ ] **Krok 8: `npm run check`**, commit `claude: T3 — sesje, link startowy, logowanie admina, proxy`.

---

### T4: Maszyna stanów postępu, zgłoszenia, kody, audyt

**Pliki:**
- Create: `src/lib/progress.ts`, `src/lib/progress.warnings.ts`, `src/lib/progress.warnings.test.ts`, `src/lib/codes.ts`,
  `src/lib/codes.test.ts`, `src/lib/audit.ts`, `tests/integration/setup.ts`,
  `tests/integration/progress.test.ts`

**Interfejsy:**
- Consumes: `prisma`, `getEnv()`, `site`.
- Produces:
  ```ts
  export type BoardTask = { id: number; stage: number; status: TaskStatus; title?: string; description?: string;
    proof?: Proof; proofHint?: string; askDistance?: boolean; askDuration?: boolean; maxPhotos?: number;
    source?: Source | null; resultSeconds?: number | null; resultDistanceM?: number | null; completedAt?: Date | null;
    lastRejectReason?: string | null; pending?: { createdAt: Date; photos: string[] } | null };
  export type Board = { done: number; total: number; tasks: BoardTask[] };
  export function ensureStarted(): Promise<void>;
  export function getBoard(opts?: { revealLocked?: boolean }): Promise<Board>;
  export type SubmitInput = { note?: string; photos: { path: string; hash: string }[]; distanceM?: number; durationS?: number };
  export function submit(taskId: number, input: SubmitInput): Promise<{ ok: true; warnings: string[] } | { ok: false; error: "not_active" | "photo_required" | "too_many_photos" }>;
  export function approve(taskId: number): Promise<void>;          // PENDING_REVIEW → DONE (+unlock)
  export function reject(taskId: number, reason: string): Promise<void>; // → ACTIVE, lastRejectReason
  export function completeWithCode(taskId: number, code: string): Promise<{ ok: true } | { ok: false; error: "bad_code" | "rate_limited" | "not_active" }>;
  export function undoLast(): Promise<number | null>;
  export function resetAll(): Promise<void>;
  export function getPendingSubmissions(): Promise<Array<Submission & { task: Task; reference?: { taskId: number; resultSeconds: number } | null; minutesAfterUnlock: number }>>;
  export class ProgressError extends Error { constructor(public code: "not_active" | "not_found" | "invalid_transition") }
  ```
  `progress.warnings.ts`: `computeWarnings(task: Task, input: SubmitInput, ctx: { unlockedAt: Date; now: Date; reference?: number | null; knownHashes: Set<string> }): string[]`
  — czyste; teksty: "Dystans {x} km poniżej progu {y} km", "Czas {mm:ss} powyżej limitu {mm:ss}", "Zgłoszone {n} min po odblokowaniu",
  "Zdjęcie użyte już w innym zgłoszeniu", "Czas {mm:ss} nie jest szybszy o {s} s od referencji {mm:ss}".
  `codes.ts`: `codeForTask(secret, taskId)`, `verifyCode(secret, taskId, input)`, `allCodes(secret)`.
  `audit.ts`: `audit(actor, action, taskId?, meta?)`. Dodatkowo `countPending(): Promise<number>` (liczba zadań `PENDING_REVIEW`) do tytułu strony admina.

- [ ] **Krok 1: Test `codes` (failing)**: deterministyczne; różne taskId → różne; format `/^[A-Z2-9]{4}-[A-Z2-9]{4}$/`;
  `verifyCode` akceptuje `"abcd efgh"`, `"ABCD-EFGH"`, odrzuca zły; inny sekret → inny kod. Implementacja: HMAC-SHA256 → alfabet
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, 8 znaków z pierwszych 40 bitów.
- [ ] **Krok 2: Test `computeWarnings` (failing)**: każdy komunikat osobno + brak ostrzeżeń dla poprawnego zgłoszenia; zad. 11 z
  `reference 760` i `durationS 740` → ostrzeżenie; `720` → brak.
- [ ] **Krok 3: `tests/integration/setup.ts`** — `truncateAll()` (`TaskProgress, Submission, CodeAttempt, AuditLog`), seed gdy `Task` pusty.
- [ ] **Krok 4: Testy integracyjne `progress` (failing)**, każdy po `truncateAll()`:
  1. `ensureStarted`: 28 wierszy, 1 ACTIVE z `unlockedAt`, reszta LOCKED; idempotentne.
  2. `getBoard()`: `done 0`; `tasks[0].title` zdefiniowany, `tasks[1].title` undefined; `revealLocked` ujawnia.
  3. `submit(1, {photos:[{path,hash}]})` → ok, 1 PENDING_REVIEW, Submission PENDING; `getBoard().tasks[0].pending.photos` = 1.
  4. `submit(1, {photos:[]})` przy `proof PHOTO` → `photo_required`; `submit(21, {photos:[]})` (po dojściu do 21 przez `approve`) → ok.
  5. `submit(2, …)` gdy 2 LOCKED → `not_active`; 5 zdjęć przy `maxPhotos 4` → `too_many_photos`.
  6. `approve(1)` → 1 DONE (`source MANUAL`, `completedAt`), Submission APPROVED, 2 ACTIVE z `unlockedAt`, `done 1`.
  7. `reject(1,"za mało")` → 1 ACTIVE, `lastRejectReason "za mało"`, Submission REJECTED z `reviewNote`; ponowny `submit` czyści `lastRejectReason`.
  8. `approve(6)` ze zgłoszeniem `durationS 760, distanceM 2100` → `resultSeconds 760`, `resultDistanceM 2100`; `getPendingSubmissions()` dla 11 zwraca `reference {6, 760}`.
  9. `completeWithCode(1, codeForTask(env.CODES_SECRET, 1))` → ok, DONE `source CODE`; zły → `bad_code` + CodeAttempt; 5 złych w 10 min → `rate_limited`.
  10. `undoLast()` po DONE 1 i 2 → 2; 2 ACTIVE bez `completedAt`, 3 LOCKED; przy `done 0` → null.
  11. `resetAll()` → jak po `ensureStarted`, Submission/CodeAttempt puste, AuditLog ma `reset`.
  12. Zaliczenie 28 → `done 28`, brak ACTIVE; AuditLog ma wpis `all_done`.
  13. `countPending()` → 0 na starcie, 1 po `submit(1, …)`, 0 po `approve(1)`.
- [ ] **Krok 5: Implementacja `progress.ts`** — mutacje w `prisma.$transaction`, `audit(...)` przy każdej. Unlock: `taskId+1 ≤ 28` → ACTIVE + `unlockedAt`.
- [ ] **Krok 6: PASS** `npm run db:up && npx vitest run tests/integration src/lib`. **Commit** `claude: T4 — maszyna stanów, zgłoszenia, kody, audyt`.

---

### T5: Tokeny CSS, pluralizacja, komponenty bazowe

**Pliki:**
- Create: `src/lib/text.ts`, `src/lib/text.test.ts`, `src/components/icons.tsx`, `src/components/TopBar.tsx` + `.module.css`,
  `src/components/Cake.tsx` + `.module.css`, `src/components/ProgressPill.tsx` + `.module.css`, `src/components/Hero.tsx` + `.module.css`,
  `src/components/StageHeader.tsx` + `.module.css`, `src/components/Footer.tsx` + `.module.css`, `src/app/dev/preview/page.tsx`

**Interfejsy:**
- Produces: `plural(n, one, few, many)`, `formatDuration(s): "mm:ss"` (≥ 1 h: "h:mm:ss"), `parseDuration("12:40" | "1:02:03"): number | null`,
  `formatKm(m): "2,10"`; `IconCheck`, `IconDumbbell`, `IconLock`, `IconGift` (`{ size?, strokeWidth?, color? }`);
  `<TopBar dateLabel />`, `<Cake done total age />`, `<ProgressPill done total />`, `<Hero name total />`, `<StageHeader index name />`, `<Footer from />`.

- [ ] **Krok 1: Test `text` (failing)**: `plural` 1/2/5/12/22/25/0 (koperta/koperty/kopert/kopert/koperty/kopert/kopert);
  `formatDuration(760)="12:40"`, `formatDuration(3723)="1:02:03"`; `parseDuration("12:40")=760`, `"1:02:03"=3723`, `"abc"=null`, `"12:70"=null`;
  `formatKm(2100)="2,10"`.
- [ ] **Krok 2: Implementacja** (reguła polska: 1 → one; `n%10∈2..4 && n%100∉12..14` → few; inaczej many).
- [ ] **Krok 3: `icons.tsx`** — 4 ikony ze ścieżek SPEC §8.
- [ ] **Krok 4: Komponenty** — wartości 1:1 ze SPEC §8, mobile-first, `@media (min-width:1024px)`. `Cake`: `total` świeczek, klasa `lit`
  gdy `i < done`, `transition`, `aria-label`; kontener mobile `width 350px; max-width 100%; transform-origin: top center` +
  `@media (max-width:389px){ transform: scale(calc((100vw - 40px)/350)); }`. `Hero`: `Sto lat, <span>{name}</span>!<br/>Zanim zdmuchniesz…`,
  lead z `plural(total,"kopertę","koperty","kopert")`.
- [ ] **Krok 5: `/dev/preview`** (`notFound()` w produkcji): komponenty z `done = 0, 5, 28`. Sprawdź w przeglądarce 390 px i 1280 px
  (skill `frontend-design` przy stylach).
- [ ] **Krok 6: `npm run check`**, commit `claude: T5 — tokeny, tekst, tort i komponenty bazowe`.

---

### T6: Uploady zdjęć

**Pliki:**
- Create: `src/lib/uploads.ts`, `src/lib/uploads.test.ts`, `src/app/api/uploads/[id]/route.ts`

**Interfejsy:**
- Consumes: `getEnv().UPLOAD_DIR`, `isPlayer()`, `isAdmin()`.
- Produces: `saveUpload(file: File): Promise<{ path: string; hash: string }>` (rzuca `UploadError("type"|"size")`),
  `openUpload(path): Promise<{ stream: ReadableStream; contentType: string } | null>`,
  `ALLOWED = {"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/heic":".heic"}`, `MAX_BYTES = 10*1024*1024`.

- [ ] **Krok 1: Testy (failing)** z `UPLOAD_DIR` tymczasowym: JPEG → plik istnieje, `path` `/^[0-9a-f-]{36}\.jpg$/`, `hash` = sha256 hex
  zawartości; `text/plain` → `type`; 11 MB → `size`; `openUpload("../../etc/passwd")` → null; nieistniejący → null.
- [ ] **Krok 2: Implementacja** (`resolve` w obrębie `UPLOAD_DIR`, `mkdir -p`, `randomUUID()`, hash liczony ze strumienia).
- [ ] **Krok 3: Route `GET /api/uploads/[id]`** — 404 gdy ani gracz, ani admin; `Cache-Control: private, max-age=3600`.
- [ ] **Krok 4: `npm run check`**, commit `claude: T6 — uploady zdjęć`.

---

### T7: Strona jubilata (koperty, formularz zgłoszenia, prezent)

**Pliki:**
- Create: `src/components/EnvelopeDone.tsx` + `.module.css`, `src/components/EnvelopeActive.tsx` + `.module.css`,
  `src/components/EnvelopeLocked.tsx` + `.module.css`, `src/components/GiftLocked.tsx` + `.module.css`,
  `src/components/GiftUnlocked.tsx` + `.module.css`, `src/components/SubmitForm.tsx` (client) + `.module.css`,
  `src/app/page.tsx`, `src/app/page.module.css`, `src/app/actions.ts`

**Interfejsy:**
- Consumes: `isPlayer`, `ensureStarted`, `getBoard`, `submit`, `completeWithCode`, `saveUpload`, `parseDuration`, komponenty T5, `site`, `plural`.
- Produces: action `submitTaskAction(prev, formData)` (pola `taskId`, `note`, `photos[]`, `distanceKm`, `duration`, `code`)
  → `{ ok: true } | { error: string }`; strona `/`.

- [ ] **Krok 1: `page.tsx`** (Server Component): bez `isPlayer()` → top bar + jedna koperta zaklejona z tekstem "Ta strona otwiera się
  tylko z właściwym linkiem." (bez imienia i liczb), status 200. Gracz: `ensureStarted()`, `getBoard()`. Mobile: TopBar → Cake →
  ProgressPill → Hero → lista (StageHeader + koperty) → Gift → Footer. Desktop: grid `520px minmax(0,1fr)`; lewa: Cake, Hero, Gift, Footer;
  prawa: nagłówek "Koperty · {done} / 28 zaliczone" + lista.
- [ ] **Krok 2: Koperty** wg SPEC §8. `EnvelopeActive` `{ task: BoardTask }`: status ACTIVE → opis, pasek odrzucenia gdy
  `lastRejectReason`, `SubmitForm`; PENDING_REVIEW → pigułka "CZEKA NA DAWIDA", tekst z datą, miniatury (`/api/uploads/<path>`).
  `SubmitForm` (`useActionState`): `proofHint`; pola `distanceKm` (`inputmode="decimal"`, placeholder "2,10") i `duration`
  (placeholder "12:40") wg `askDistance/askDuration`; `<input type="file" accept="image/*" capture="environment" multiple?>`
  z listą wybranych nazw; `textarea` notatka; szczegół "Mam kod od Dawida" z polem; przycisk "ZROBIONE — ZAPAL ŚWIECZKĘ";
  `proof NONE` → tylko przycisk i kod. Komunikaty: `photo_required` → "Dołącz zdjęcie — to dowód dla Dawida.",
  `too_many_photos` → "Maksymalnie {n} zdjęcia.", `bad_code` → "Zły kod. Spróbuj jeszcze raz.", `rate_limited` → "Za dużo prób. Odczekaj 10 minut.",
  `type`/`size` → "Zdjęcie: tylko JPG/PNG/WEBP/HEIC do 10 MB.", `bad_duration` → "Czas w formacie mm:ss.", po sukcesie zgłoszenia
  "Wysłane! Dawid dostał znać." (strona odświeża się przez `revalidatePath`).
- [ ] **Krok 3: `actions.ts`** — `"use server"`; `isPlayer()` inaczej `{error:"forbidden"}`; `code` niepuste → `completeWithCode`;
  inaczej: parsuj `distanceKm` (przecinek lub kropka → metry), `duration` (`parseDuration`), zapisz każde zdjęcie `saveUpload`
  (przy błędzie typu/rozmiaru zwróć błąd przed zapisem czegokolwiek do DB), `submit(...)`. `revalidatePath("/")`.
- [ ] **Krok 4: Prezent** — `GiftLocked {left}` z pluralizacją; `GiftUnlocked {title, description}` bez "Od nowa".
- [ ] **Krok 5: Ręcznie** — `npm run dev`, wejście linkiem, zgłoszenie zadania 1 ze zdjęciem z telefonu (devtools → tryb mobilny),
  kod dla zadania (skrypt `node -e` z `codeForTask`), sprawdź 390 px i 1280 px; `curl localhost:3000` bez cookie nie zawiera `site.name`
  ani tytułów zadań.
- [ ] **Krok 6: `npm run check`**, commit `claude: T7 — strona jubilata`.

---

### T8: Panel admina

**Pliki:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/page.module.css`, `src/app/admin/actions.ts`,
  `src/components/admin/PendingCard.tsx`, `src/components/admin/TaskTable.tsx`, `src/components/admin/CodesList.tsx`,
  `src/components/admin/DangerZone.tsx` (client), `src/components/admin/CopyButton.tsx` (client)

**Interfejsy:**
- Consumes: `requireAdmin`, `getBoard({revealLocked:true})`, `getPendingSubmissions`, `approve`, `reject`, `undoLast`, `resetAll`,
  `allCodes`, `clearAdminCookie`, `prisma.auditLog`, `getEnv().PLAYER_TOKEN`, `formatDuration`, `formatKm`.
- Produces: actions `approveAction(taskId)`, `rejectAction(taskId, reason)`, `undoAction()`, `resetAction(confirmWord)`, `logoutAction()`.

- [ ] **Krok 1: Strona** (`requireAdmin()`), sekcje i treść wg SPEC §9. `generateMetadata` ustawia tytuł
  `(${countPending()}) Urodzinowe wyzwania · admin` (bez nawiasu, gdy 0). `PendingCard` `id="task-{n}"`: metryki, dla `reference`
  tekst "ref. z zad. {id}: {mm:ss} → teraz {mm:ss}, {±s} s" z ✓/✗, zdjęcia (`<a href target=_blank><img>`), notatka, `warnings` jako żółte
  etykiety; Zatwierdź (h 52, czarny/żółty) i Odrzuć (pole powodu `required`). Mobile-first, max-width 720 na desktopie.
- [ ] **Krok 2: Actions** — każda od `requireAdmin()`; `revalidatePath("/admin")` i `revalidatePath("/")`; `resetAction` tylko dla `"RESET"`.
- [ ] **Krok 3: Ręcznie** — zgłoszenie gracza ze zdjęciem widoczne w panelu → Zatwierdź → świeczka u gracza; Odrzuć → koperta z powodem;
  Cofnij; Reset; `curl -I /admin` bez cookie → redirect; wydruk kodów (`@media print`).
- [ ] **Krok 4: `npm run check`**, commit `claude: T8 — panel admina`.

---

### T9: Obraz Docker i compose produkcyjny

**Pliki:**
- Create: `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.prod.yml`, `tests/docker-smoke.sh`, `tests/compose.smoke.yml`

- [ ] **Krok 1: `Dockerfile`** — stage `base` (`node:24-slim`), `deps` (`npm ci`), `build` (`npx prisma generate`, `npm run build`,
  `NEXT_TELEMETRY_DISABLED=1`), `prisma-cli`:
  ```dockerfile
  FROM base AS prisma-cli
  WORKDIR /tools
  COPY package.json /tmp/package.json
  RUN V=$(node -p "require('/tmp/package.json').devDependencies.prisma") \
   && npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund "prisma@$V" dotenv pg
  ```
  `runtime`: `apt-get install -y --no-install-recommends openssl ca-certificates`, `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads`,
  kopie `public`, `.next/standalone` → `./`, `.next/static` → `./.next/static`, `prisma/`, `prisma.config.ts`, `/tools/node_modules` → `./tools/node_modules`,
  `docker/entrypoint.sh`; `RUN mkdir -p /data/uploads && chown -R node:node /data /app`; `USER node`; `EXPOSE 3000`; `CMD ["./entrypoint.sh"]`.
  Fallback gdy CLI nie załaduje `.ts` w runtime: `prisma.config.mjs` (ESM, ta sama treść).
- [ ] **Krok 2: `docker/entrypoint.sh`**:
  ```sh
  #!/bin/sh
  set -eu
  [ -w "$UPLOAD_DIR" ] || { echo "Katalog $UPLOAD_DIR nie jest zapisywalny" >&2; exit 1; }
  echo "Migracje…"; node tools/node_modules/prisma/build/index.js migrate deploy
  echo "Seed…";     NODE_PATH=/app/tools/node_modules node prisma/seed.cjs
  echo "Start…";    exec node server.js
  ```
- [ ] **Krok 3: `docker-compose.prod.yml`** — 1:1 z `demo-deploy.md` i SPEC §10: `name: urodzinowe`; `db` `postgres:16` tylko `internal`
  z healthcheck `pg_isready`; `app` `container_name: urodzinowe`, env: `NODE_ENV`, `DATABASE_URL`, `AUTH_SECRET`, `CODES_SECRET`,
  `PLAYER_TOKEN`, `ADMIN_PASSWORD` (wszystkie `:?komunikat`), `APP_URL: "https://${APP_DOMAIN:?APP_DOMAIN musi byc ustawiony w .env}"`,
  `UPLOAD_DIR: /data/uploads`;
  `volumes: ["uploads:/data/uploads"]`; `networks: [internal, web]`; labele `caddy`, `caddy.reverse_proxy: "{{upstreams 3000}}"`,
  `caddy.tls: "/certs/wildcard.crt /certs/wildcard.key"`, `caddy.import: secure_headers`, `caddy.request_body.max_size: 45MB`;
  healthcheck `fetch('http://localhost:3000/api/health')`, `start_period: 60s`; `networks: internal, web (external: true)`; `volumes: dbdata, uploads`.
- [ ] **Krok 4: `tests/docker-smoke.sh`** — `docker network create web 2>/dev/null || true`; `.env` testowy z losowymi wartościami;
  `docker compose -f docker-compose.prod.yml -f tests/compose.smoke.yml up -d --build` (override usuwa labele caddy i dodaje nic więcej);
  pętla ≤ 90 s na `docker inspect --format '{{.State.Health.Status}}' urodzinowe` == `healthy`; `down -v`. Asercje statyczne:
  brak `ports:` w compose prod, `db` bez `web`.
- [ ] **Krok 5: Uruchom** `bash tests/docker-smoke.sh` → healthy (bez Dockera lokalnie: zaznacz w raporcie, zostaw krok nieodhaczony).
- [ ] **Krok 6: Commit** `claude: T9 — Dockerfile, entrypoint, compose produkcyjny`.

---

### T10: Skrypty deployu i testy bash

**Pliki:**
- Create: `deploy.conf.example`, `scripts/deploy.sh`, `scripts/lib/deploy-lib.sh`, `tests/deploy-lib.test.sh`, `tests/fixtures/deploy.conf`

**Interfejsy:**
- Produces (czyste, bez efektów ubocznych przy `source`): `log ok warn die`, `require_cmd`, `load_config FILE`, `validate_config`,
  `inject_git_token URL TOKEN`, `gen_remote_prereqs_script`, `gen_remote_network_script`, `gen_remote_code_script`,
  `gen_remote_env_script APP_DOMAIN [KEY=VALUE…]`, `gen_remote_secret_probe_script KEY…`, `gen_remote_up_script`,
  `gen_remote_bootstrap_script`, `wait_for_url URL DEADLINE_S INTERVAL_S`. `deploy.sh`: `--dry-run`, `--config`, `--set-secret KEY`, `--no-wait`.

- [ ] **Krok 1: `tests/deploy-lib.test.sh` (failing)** — własne `assert_contains/assert_not_contains/assert_fails`:
  1. `validate_config` bez `SERVER_HOST` → die; komplet → `SSH_PORT=22`, `REPO_BRANCH=main`, `DEPLOY_DIR=urodzinowe`.
  2. `inject_git_token` → URL z tokenem; `gen_remote_code_script` zawiera `git remote set-url origin` bez tokenu.
  3. `gen_remote_env_script app.example.pl` zawiera `chmod 600 .env`, `env_set APP_DOMAIN`, `env_set_if_missing` dla
     `POSTGRES_PASSWORD AUTH_SECRET CODES_SECRET PLAYER_TOKEN ADMIN_PASSWORD`; `gen_remote_env_script app.example.pl ADMIN_PASSWORD=__PLACEHOLDER__`
     (tryb `--set-secret`) zawiera `env_set ADMIN_PASSWORD "__PLACEHOLDER__"`, nie zawiera `sekret-testowy`.
  4. `gen_remote_bootstrap_script` przechodzi `bash -n`; zawiera `docker network create web` i `up -d --build`; nie zawiera `prisma migrate`.
  5. `bash scripts/deploy.sh --dry-run --config tests/fixtures/deploy.conf` → exit 0, zawiera `set -euo pipefail` i `app.example.pl`, nie zawiera `ssh `.
  6. `gen_remote_secret_probe_script ADMIN_PASSWORD` zawiera `grep -q '^ADMIN_PASSWORD=' .env || echo ADMIN_PASSWORD` (używane przez `--set-secret` do potwierdzenia rotacji).
- [ ] **Krok 2: `deploy-lib.sh`** wg `demo-deploy.md` §4 i SPEC §10; `env_set` przez `awk` do pliku tymczasowego;
  `gen_secret(){ head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }`; po `.env` skrypt zdalny wypisuje
  "ADMIN_PASSWORD i PLAYER_TOKEN: `grep -E '^(ADMIN_PASSWORD|PLAYER_TOKEN)=' ~/urodzinowe/.env`".
- [ ] **Krok 3: `deploy.sh`** — parsowanie → `load_config` → `validate_config` → dry-run (placeholdery, stdout, exit 0) → probe brakujących
  (`--set-secret KEY`: wartość z lokalnego env lub `read -rs`, przekazana do `gen_remote_env_script` jako `KEY=VALUE`; zwykły deploy
  nie prompt-uje o nic) → `gen_remote_bootstrap_script | ssh … 'bash -s'` → `wait_for_url "https://$APP_DOMAIN/api/health" 180 5` →
  wypisz `https://$APP_DOMAIN/admin` i przypomnienie, jak odczytać `ADMIN_PASSWORD`.
- [ ] **Krok 4: `deploy.conf.example`** — klucze z `demo-deploy.md` + `DEPLOY_DIR=urodzinowe`, `HEALTH_TIMEOUT=180`.
- [ ] **Krok 5: PASS** `bash tests/deploy-lib.test.sh` (+ `shellcheck` jeśli jest). **Commit** `claude: T10 — skrypty deployu z testami`.

---

### T11: Backup i README

**Pliki:**
- Create: `scripts/backup.sh`, `README.md`

- [ ] **Krok 1: `scripts/backup.sh`** — `source scripts/lib/deploy-lib.sh`, `load_config`; `pg_dump -Fc` przez `docker compose exec -T db`
  do `backups/db-<data>.dump`; wolumen `urodzinowe_uploads` → `backups/uploads-<data>.tgz`; komentarz z komendami restore.
- [ ] **Krok 2: `README.md`** — po polsku: co to jest, dev lokalny (`db:up`, `.env`, `db:migrate`, `db:seed`, `dev`), personalizacja
  (`src/config/site.ts`), zmiana treści zadań (`prisma/seed-data/tasks.json` + redeploy), deploy (`deploy.conf`, `--dry-run`, `deploy.sh`,
  odczyt `ADMIN_PASSWORD`/linku), checklista Dawida (SPEC §13), kody do druku, backup, rotacja sekretów (`--set-secret`).
- [ ] **Krok 3: Commit** `claude: T11 — backup, README`.

---

## Poza zakresem

Integracje z platformami sportowymi, automatyczna ocena dowodów, tryb "zdmuchiwane", wielu graczy, S3, e-mail, PWA, i18n, Prisma 8, CI/CD.

## Ryzyka i decyzje architektoniczne

1. **Jeden mechanizm dla wszystkich zadań** (zgłoszenie → zatwierdzenie) zamiast integracji: mniej kodu, zero zależności zewnętrznych,
   działa z każdym zegarkiem. Cena: każde zaliczenie wymaga wejścia Dawida do panelu (bez powiadomień — decyzja Dawida;
   licznik oczekujących w tytule karty `/admin`, moduł powiadomień do dołożenia później jako osobne zadanie).
2. **Ostrzeżenia zamiast twardych blokad** przy wartościach liczbowych: apka nie zna prawdy, Dawid tak. Twarda blokada tylko
   dla brakującego wymaganego zdjęcia.
3. **Kody HMAC** zamiast losowych w DB: brak tabeli sekretów, lista na żądanie, rotacja przez `--set-secret CODES_SECRET`.
4. **Next 16 `proxy.ts`** i **Prisma 7 w standalone**: weryfikacja przez context7; osobny stage `prisma-cli` (prisma#29305).
5. **Zdjęcia na wolumenie**: prosto; backup skryptem. Limit body w Caddy ustawiony etykietą.

## Uruchomienie planu

```
Agent(subagent_type: "implementer", model: "opus", prompt: "Plan: docs/plan/urodzinowe-wyzwania.md, zadanie T1")
Agent(subagent_type: "reviewer",              prompt: "Plan: docs/plan/urodzinowe-wyzwania.md, zadanie T1")
```
Kolejność: T1 → T2 → [T3 ‖ T4 ‖ T5 ‖ T10] → T6 → [T7 ‖ T8 ‖ T9] → T11.
