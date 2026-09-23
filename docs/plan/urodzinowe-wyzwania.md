# Urodzinowe wyzwania — plan implementacji

> **Dla agentów wykonawczych:** WYMAGANY SKILL: `superpowers:subagent-driven-development`
> (zalecane) lub `superpowers:executing-plans`. Kroki mają checkboxy (`- [ ]`) do odhaczania.
> Każde zadanie realizuje agent `implementer` uruchomiony z **`model: "opus"` (Opus 5.5)**,
> po nim agent `reviewer`. Implementer modyfikuje WYŁĄCZNIE pliki ze swojej listy.
> Przed użyciem API Next.js 16 / Prisma 7 / Vitest implementer weryfikuje sygnatury przez context7.

**Cel:** Jednoosobowa apka "Urodzinowe wyzwania": 28 zadań sportowych odblokowywanych sekwencyjnie,
weryfikowanych automatycznie przez Stravę lub zatwierdzanych przez Dawida, z tortem-progresem
1:1 wg artboardów, zdeployowana jako stack Docker za wspólnym proxy Caddy.

**Architektura:** Next.js 16 App Router (Server Components + Server Actions + Route Handlers),
cały stan w Postgresie przez Prisma 7. Czysty, testowalny silnik reguł (`src/lib/rules`) oddzielony
od maszyny stanów (`src/lib/progress.ts`) i od integracji Strava (`src/lib/strava`). Deploy 1:1
z `demo-deploy.md`.

**Stos:** Node 24, Next.js 16.3.x, TypeScript, Prisma 7.10.x + `@prisma/adapter-pg` + `pg`,
Postgres 16, zod, Vitest, CSS Modules, `next/font/google`, Docker multi-stage, bash.

**Spec:** `docs/superpowers/specs/2026-09-23-urodzinowe-wyzwania-design.md` (dalej: SPEC).
Wartości stylów są w SPEC §8, macierz reguł w SPEC §5, model danych w SPEC §7.

## Ograniczenia globalne

- Wersje: `next@^16.3`, `prisma@^7.10`, `@prisma/client@^7.10`, `@prisma/adapter-pg@^7.10`, `pg@^8`,
  `zod@^3`, `vitest@^3`, Node `>=24`. Nie używać Prisma 8 RC ani Tailwinda.
- Komentarze, komunikaty UI i logi po polsku. Nazwy kodu po angielsku.
- Żadnych sekretów w repo. Wszystko przez `process.env` czytane wyłącznie w `src/lib/env.ts`.
- Postęp gry nigdy w `localStorage`. Tytuły zadań `LOCKED` nigdy nie trafiają do odpowiedzi HTTP.
- Wszystkie porównania sekretów/hasła/tokenów w stałym czasie (`crypto.timingSafeEqual`).
- Prisma: generator `prisma-client`, `output = "../src/generated/prisma"` (gitignored), klient
  zawsze z `PrismaPg`. Identyfikatory Strava: w DB `BigInt`, w TS `number` (konwersja na granicy).
- Testy jednostkowe czyste (bez DB) w `*.test.ts` obok kodu; testy integracyjne z DB w
  `tests/integration/*.test.ts` na bazie z `docker-compose.dev.yml` (`DATABASE_URL` z `.env`),
  każdy test czyści tabele w `beforeEach`.
- Commity: `git add <pliki zadania> && git commit -m "claude: T<n> — <opis>"`. Praca na gałęzi `claude/auto`.
- Weryfikacja końcowa każdego zadania: `npm run check` (= `tsc --noEmit && vitest run`), a dla zadań
  deployowych `bash tests/deploy-lib.test.sh`.

## Struktura plików (docelowa)

```
.
├── design/                      # artboardy + DESIGN.md (przeniesione z roota, tylko referencja)
├── docs/plan/, docs/superpowers/specs/
├── prisma/{schema.prisma, migrations/, seed.cjs, seed-data/tasks.json}
├── prisma.config.ts, next.config.ts, tsconfig.json, vitest.config.ts, package.json
├── .env.example, .gitignore, .dockerignore
├── Dockerfile, docker/entrypoint.sh, docker-compose.prod.yml, docker-compose.dev.yml
├── deploy.conf.example, scripts/{deploy.sh, lib/deploy-lib.sh, backup.sh, strava-subscribe.sh, strava-subscribe.cjs}
├── tests/{deploy-lib.test.sh, fixtures/, integration/}
└── src/
    ├── config/site.ts
    ├── proxy.ts
    ├── lib/{env.ts, db.ts, text.ts, audit.ts, progress.ts, codes.ts, uploads.ts}
    ├── lib/auth/{session.ts, player.ts, admin.ts}
    ├── lib/rules/{types.ts, splits.ts, engine.ts, window.ts}
    ├── lib/strava/{crypto.ts, client.ts, tokens.ts, process.ts, sync.ts}
    ├── lib/notify/telegram.ts
    ├── components/{icons.tsx, TopBar, Cake, ProgressPill, Hero, StageHeader, EnvelopeDone,
    │              EnvelopeActive, EnvelopeLocked, GiftLocked, GiftUnlocked, Footer, SubmitForm,
    │              StravaBanner}  (każdy: Name.tsx + Name.module.css)
    └── app/{layout.tsx, globals.css, page.tsx, page.module.css, actions.ts,
             start/[token]/route.ts,
             admin/{page.tsx, page.module.css, actions.ts, login/{page.tsx, actions.ts}},
             api/{health, uploads/[id], strava/{connect, callback, webhook}}/route.ts}
```

## Kolejność i zależności

| Zadanie | Zależy od | Można równolegle z |
|---|---|---|
| T1 Szkielet projektu | — | — |
| T2 Schemat, seed, typy reguł | T1 | — |
| T3 Silnik reguł | T2 | T4, T5, T6, T7, T12, T13 |
| T4 Sesje i dostęp | T1 | T3, T5, T6, T7 |
| T5 Maszyna stanów, kody, audyt, Telegram | T2 | T3, T4, T6, T7 |
| T6 Tokeny CSS, tekst, komponenty bazowe | T1 | T3, T4, T5, T7 |
| T7 Uploady | T2, T4 | T3, T5, T6 |
| T8 Klient Strava + OAuth | T2, T4 | T6, T7 |
| T9 Przetwarzanie aktywności, webhook, sync | T3, T5, T8 | T6, T7 |
| T10 Strona jubilata | T4, T5, T6, T7, T9 | T11 |
| T11 Panel admina | T4, T5, T7, T8 | T10 |
| T12 Obraz Docker + compose | T2 | T3–T11 |
| T13 Skrypty deployu + testy bash | T1 | T3–T12 |
| T14 Subskrypcja webhooka, backup, README | T12, T13 | — |

---

### T1: Szkielet projektu (Next 16 + Prisma 7 + Vitest + dev DB)

**Pliki:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `prisma.config.ts`, `vitest.config.ts`,
  `.gitignore`, `.dockerignore`, `.env.example`, `docker-compose.dev.yml`,
  `src/lib/env.ts`, `src/lib/env.test.ts`, `src/lib/db.ts`, `src/app/layout.tsx`,
  `src/app/globals.css`, `src/app/api/health/route.ts`, `src/config/site.ts`
- Move: `DESIGN.md`, `desktop.html`, `mobile.html`, `mobile-meta.html` → `design/` (git mv)

**Interfejsy:**
- Produces: `getEnv(): Env` (memoizowane, rzuca czytelny błąd z listą brakujących zmiennych),
  `loadEnv(source: NodeJS.ProcessEnv): Env` (czyste, do testów); `prisma` (singleton `PrismaClient`);
  `site` (`{ name, age, rewardTitle, rewardDescription, from, dateLabel, stages: string[4] }`).

- [ ] **Krok 1: Inicjalizacja projektu**

Repo git już istnieje (commit "initial" na `main` z makietami, specem i tym planem). Upewnij się, że jesteś
na gałęzi `claude/auto` (`git branch --show-current`; jeśli nie: `git checkout claude/auto`).

```bash
mkdir -p design && git mv DESIGN.md desktop.html mobile.html mobile-meta.html design/
npx create-next-app@latest . --ts --app --src-dir --no-tailwind --no-eslint --import-alias "@/*" --turbopack --yes
npm i zod pg @prisma/client@^7.10 @prisma/adapter-pg@^7.10
npm i -D prisma@^7.10 vitest@^3 @types/pg dotenv
```
Jeśli `create-next-app` odmówi pracy w niepustym katalogu, uruchom go w katalogu tymczasowym i
skopiuj wygenerowane pliki (bez `README.md`, `public/*.svg`, `src/app/page.tsx`). **Nie tworzyć `src/app/page.tsx`** (powstaje w T10).

- [ ] **Krok 2: Test `loadEnv` (failing)**

`src/lib/env.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { loadEnv } from "./env";

const base = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  AUTH_SECRET: "a".repeat(40),
  CODES_SECRET: "b".repeat(20),
  PLAYER_TOKEN: "c".repeat(32),
  ADMIN_PASSWORD: "haslo-admina",
  APP_URL: "http://localhost:3000",
  UPLOAD_DIR: "./.data/uploads",
};

describe("loadEnv", () => {
  it("parsuje poprawny zestaw i ustawia domyślne NODE_ENV", () => {
    const env = loadEnv(base);
    expect(env.NODE_ENV).toBe("development");
    expect(env.STRAVA_CLIENT_ID).toBeUndefined();
  });
  it("rzuca błąd z nazwami brakujących zmiennych", () => {
    const { AUTH_SECRET: _omit, ...rest } = base;
    expect(() => loadEnv(rest)).toThrow(/AUTH_SECRET/);
  });
  it("odrzuca za krótki AUTH_SECRET", () => {
    expect(() => loadEnv({ ...base, AUTH_SECRET: "short" })).toThrow(/AUTH_SECRET/);
  });
});
```

- [ ] **Krok 3: Uruchom test, oczekiwany FAIL** — `npx vitest run src/lib/env.test.ts` → "Cannot find module './env'".

- [ ] **Krok 4: Implementacja `src/lib/env.ts`**

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
  STRAVA_CLIENT_ID: z.string().min(1).optional(),
  STRAVA_CLIENT_SECRET: z.string().min(1).optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
});
export type Env = z.infer<typeof schema>;

/** Czysta walidacja — do testów. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const names = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Błędna konfiguracja środowiska: ${names}`);
  }
  return parsed.data;
}

let cached: Env | undefined;
export function getEnv(): Env {
  if (!cached) cached = loadEnv(process.env);
  return cached;
}
```

- [ ] **Krok 5: Konfiguracja Prisma, Next, Vitest, DB klient**

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

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
function create() {
  const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
  return new PrismaClient({ adapter });
}
export const prisma = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
```
(Implementer: zweryfikuj przez context7 dokładny import klienta dla generatora `prisma-client` w 7.10 —
`@/generated/prisma/client` lub `@/generated/prisma`.)

`next.config.ts`: `output: "standalone"`, `serverExternalPackages: ["pg"]` (jeśli wymagane w 16.3 — sprawdź context7).
`vitest.config.ts`: `environment: "node"`, alias `@` → `src`, `include: ["src/**/*.test.ts", "tests/**/*.test.ts"]`,
`setupFiles: ["dotenv/config"]`.
`docker-compose.dev.yml`: usługa `db` `postgres:16`, `ports: ["127.0.0.1:5432:5432"]`, user/hasło/db `urodzinowe`,
volume `dbdata_dev`.
`.env.example`: wszystkie klucze z `loadEnv` z wartościami dev (`DATABASE_URL=postgresql://urodzinowe:urodzinowe@localhost:5432/urodzinowe`,
`UPLOAD_DIR=./.data/uploads`, `APP_URL=http://localhost:3000`, sekrety jako `zmien-mnie-...` o wymaganej długości).
`.gitignore`: `node_modules/ .next/ .env .env.* !.env.example .data/ src/generated/ deploy.conf backups/ *.key *.crt *.csr`.
`.dockerignore`: `node_modules .next .git .data backups deploy.conf .env* design docs tests scripts/*.sh *.md docker-compose.dev.yml`
(**nie** ignorować `docker/`, `prisma/`, `prisma.config.ts`, `scripts/strava-subscribe.cjs`).

`src/config/site.ts`:
```ts
export const site = {
  name: "[IMIĘ]",
  age: 28,
  rewardTitle: "[NAGRODA GŁÓWNA]",
  rewardDescription: "[Krótki opis nagrody lub gdzie ją odebrać]",
  from: "[OD KOGO]",
  dateLabel: "23.09 · Birthday Run",
  stages: ["Rozruch", "Budowanie nawyku", "Wytrzymałość", "Prosta do finału"] as const,
  totalTasks: 28,
};
```

`src/app/layout.tsx`: `lang="pl"`, fonty `Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" })`
i `Space_Grotesk({ weight: ["400","500","700"], subsets: ["latin","latin-ext"], variable: "--font-grotesk" })`,
`<html className={\`${anton.variable} ${grotesk.variable}\`}>`, `<body>` z `globals.css`.
`src/app/globals.css` (tokeny z SPEC §8):
```css
:root {
  --bg: #f4ecdc; --ink: #141210; --accent: #c81e5a; --accent-hover: #9c1546; --yellow: #ffd23f;
  --text-2: #4a453c; --muted: #6b655a; --locked: #a39c8c; --card: #ffffff; --card-locked: #ede3cf;
  --flap: #e2d6be; --font-display: var(--font-anton), Impact, sans-serif;
  --font-body: var(--font-grotesk), system-ui, sans-serif;
}
body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); }
a { color: var(--accent); } a:hover { color: var(--accent-hover); }
button { font-family: inherit; cursor: pointer; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
```

`src/app/api/health/route.ts`:
```ts
import { prisma } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ ok: false, error: "db" }, { status: 503 });
  }
}
```
`package.json` scripts: `dev`, `build`, `start`, `check: "tsc --noEmit && vitest run"`, `test: "vitest run"`,
`db:up: "docker compose -f docker-compose.dev.yml up -d"`, `db:migrate: "prisma migrate dev"`,
`db:seed: "prisma db seed"`, `prisma:generate: "prisma generate"`, `postinstall: "prisma generate"`.

- [ ] **Krok 6: Test przechodzi** — `npx vitest run src/lib/env.test.ts` → PASS (3 testy).
- [ ] **Krok 7: `tsc --noEmit` przechodzi** (schemat Prisma minimalny może być pusty; jeśli `prisma generate` wymaga modelu, dodaj `model Ping { id Int @id }` — T2 go zastąpi).
- [ ] **Krok 8: Commit** — `git add -A && git commit -m "claude: T1 — szkielet Next 16 + Prisma 7 + Vitest"`.

---

### T2: Schemat Prisma, seed 28 zadań, typy reguł

**Pliki:**
- Create: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_init/migration.sql` (przez `prisma migrate dev --name init`),
  `prisma/seed-data/tasks.json`, `prisma/seed.cjs`, `src/lib/rules/types.ts`, `src/lib/rules/types.test.ts`
- Modify: `prisma/schema.prisma` (jeśli T1 zostawił `Ping`, usuń)

**Interfejsy:**
- Produces: modele Prisma z SPEC §7 (enumy `TaskStatus {LOCKED, ACTIVE, PENDING_REVIEW, DONE}`,
  `Verification {AUTO, MIXED, MANUAL}`, `Source {STRAVA, MANUAL, CODE, ADMIN}`,
  `SubmissionStatus {PENDING, APPROVED, REJECTED}`, `Actor {PLAYER, ADMIN, SYSTEM}`);
  typy TS: `Rule`, `ActivityRule`, `WindowRule`, `ManualRule`, `SportType`, `Verification`, `ruleSchema` (zod),
  `TaskSeed` (`{ id, stage, title, description, verification, rule }`).

- [ ] **Krok 1: Typy reguł `src/lib/rules/types.ts`**

```ts
import { z } from "zod";

export const sportTypes = ["Run","TrailRun","VirtualRun","Walk","Hike","WeightTraining","Workout","Crossfit","HighIntensityIntervalTraining"] as const;
export type SportType = (typeof sportTypes)[number];

export const activityRuleSchema = z.object({
  kind: z.literal("activity"),
  sports: z.array(z.enum(sportTypes)).min(1),
  minDistanceM: z.number().positive().optional(),
  maxTimeS: z.object({ distanceM: z.number().positive(), maxS: z.number().positive() }).optional(),
  minElevGainM: z.number().positive().optional(),
  minElapsedS: z.number().positive().optional(),
  noStops: z.boolean().optional(),                 // elapsed − moving ≤ 20 s na 1. splicie
  recordTimeForM: z.number().positive().optional(), // zapisz resultSeconds = czas na tym dystansie
  fasterThanTask: z.object({ taskId: z.number().int(), deltaS: z.number().positive() }).optional(),
  autoComplete: z.boolean().default(true),          // false → dopasowanie daje PENDING_REVIEW
});
export const windowRuleSchema = z.object({
  kind: z.literal("window"),
  days: z.number().int().positive(),
  minCount: z.number().int().positive(),
  sports: z.array(z.enum(sportTypes)).min(1),
  minEachDistanceM: z.number().positive().optional(),
  minTotalDistanceM: z.number().positive().optional(),
  autoComplete: z.boolean().default(true),
});
export const manualRuleSchema = z.object({ kind: z.literal("manual") });
export const ruleSchema = z.discriminatedUnion("kind", [activityRuleSchema, windowRuleSchema, manualRuleSchema]);
export type ActivityRule = z.infer<typeof activityRuleSchema>;
export type WindowRule = z.infer<typeof windowRuleSchema>;
export type ManualRule = z.infer<typeof manualRuleSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type Verification = "AUTO" | "MIXED" | "MANUAL";

export const taskSeedSchema = z.object({
  id: z.number().int().min(1).max(28),
  stage: z.number().int().min(1).max(4),
  title: z.string().min(1),
  description: z.string().min(1),
  verification: z.enum(["AUTO", "MIXED", "MANUAL"]),
  rule: ruleSchema,
});
export type TaskSeed = z.infer<typeof taskSeedSchema>;

export interface Split { distanceM: number; elapsedTimeS: number; movingTimeS: number }
export interface ActivitySummary {
  id: number; startDate: string; sportType: string; distanceM: number; movingTimeS: number;
  elapsedTimeS: number; elevGainM: number; manual: boolean; trainer: boolean;
  deviceName: string | null; splits: Split[];
}
export interface EvalContext { unlockedAt: Date; referenceTimes: Record<number, number>; usedActivityIds: Set<number> }
export interface EvalResult { matched: boolean; reasons: string[]; flags: string[]; resultSeconds?: number; resultDistanceM?: number }
```

- [ ] **Krok 2: Test seed-data (failing)** `src/lib/rules/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import tasks from "../../../prisma/seed-data/tasks.json";
import { taskSeedSchema } from "./types";

describe("seed-data/tasks.json", () => {
  it("ma 28 zadań o id 1..28, po 7 na etap", () => {
    expect(tasks).toHaveLength(28);
    expect(tasks.map((t) => t.id)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    for (let s = 1; s <= 4; s++) expect(tasks.filter((t) => t.stage === s)).toHaveLength(7);
  });
  it("każde zadanie przechodzi walidację i typ MANUAL ma regułę manual", () => {
    for (const t of tasks) {
      const parsed = taskSeedSchema.parse(t);
      if (parsed.verification === "MANUAL") expect(parsed.rule.kind).toBe("manual");
      else expect(parsed.rule.kind).not.toBe("manual");
    }
  });
  it("zadanie 11 odwołuje się do czasu z zadania 6, a 6 zapisuje czas na 2 km", () => {
    const t6 = tasks.find((t) => t.id === 6)!.rule as { recordTimeForM?: number };
    const t11 = tasks.find((t) => t.id === 11)!.rule as { fasterThanTask?: { taskId: number; deltaS: number } };
    expect(t6.recordTimeForM).toBe(2000);
    expect(t11.fasterThanTask).toEqual({ taskId: 6, deltaS: 30 });
  });
});
```
(W `tsconfig.json` włącz `resolveJsonModule`.)

- [ ] **Krok 3: FAIL** — `npx vitest run src/lib/rules` → brak pliku JSON.

- [ ] **Krok 4: `prisma/seed-data/tasks.json`** — 28 obiektów wg SPEC §5 i `zadania.md`. Tytuły dosłownie z
`zadania.md` (z emoji), opisy 1–2 zdania w tonie makiety ("Tempo dowolne, ale bez zatrzymywania się.").
Przykłady (pozostałe analogicznie):
```json
[
 {"id":1,"stage":1,"title":"Załóż nowe buty i wyślij mi zdjęcie 📸","description":"Jedyne miękkie zadanie. Zdjęcie butów na nogach wystarczy.","verification":"MANUAL","rule":{"kind":"manual"}},
 {"id":2,"stage":1,"title":"Marsz 3 km w czasie poniżej 40 min","description":"Szybki spacer. Zegarek włączony, Strava zrobi resztę.","verification":"AUTO","rule":{"kind":"activity","sports":["Walk","Hike","Run"],"minDistanceM":3000,"maxTimeS":{"distanceM":3000,"maxS":2400}}},
 {"id":3,"stage":1,"title":"Przebiegnij 1 km bez zatrzymywania","description":"Tempo dowolne, ale bez postojów.","verification":"AUTO","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":1000,"noStops":true}},
 {"id":6,"stage":1,"title":"Przebiegnij 2 km","description":"Zapamiętamy Twój czas. Wróci w zadaniu 11.","verification":"AUTO","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":2000,"recordTimeForM":2000}},
 {"id":7,"stage":1,"title":"20 min marszobiegu: 2 min biegu / 1 min marszu","description":"Dawid sprawdzi strukturę treningu.","verification":"MIXED","rule":{"kind":"activity","sports":["Run","Walk"],"minElapsedS":1200,"autoComplete":false}},
 {"id":8,"stage":2,"title":"3 treningi biegowe w ciągu 7 dni (łącznie min. 6 km)","description":"Trzy biegi w tydzień, każdy co najmniej kilometr.","verification":"AUTO","rule":{"kind":"window","days":7,"minCount":3,"sports":["Run","TrailRun"],"minEachDistanceM":1000,"minTotalDistanceM":6000}},
 {"id":11,"stage":2,"title":"Przebiegnij 2 km szybciej niż w zadaniu 6 o min. 30 s","description":"Ten sam dystans, lepszy czas.","verification":"AUTO","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":2000,"fasterThanTask":{"taskId":6,"deltaS":30}}},
 {"id":14,"stage":2,"title":"4 treningi w ciągu 7 dni (biegowe lub siłowe)","description":"Siłowe liczą się z zegarka. Dawid potwierdzi.","verification":"MIXED","rule":{"kind":"window","days":7,"minCount":4,"sports":["Run","TrailRun","Walk","WeightTraining","Workout","Crossfit","HighIntensityIntervalTraining"],"autoComplete":false}},
 {"id":20,"stage":3,"title":"Bieg z przewyższeniem: min. 3 km i 50 m w górę","description":"Znajdź górkę.","verification":"AUTO","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":3000,"minElevGainM":50}},
 {"id":26,"stage":4,"title":"Przebiegnij 5 km w czasie poniżej 35 min (lub parkrun z oficjalnym wynikiem)","description":"Strava zaliczy sama. Parkrun zgłoś ze zdjęciem wyniku.","verification":"MIXED","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":5000,"maxTimeS":{"distanceM":5000,"maxS":2100},"autoComplete":true}},
 {"id":28,"stage":4,"title":"🏁 Przebiegnij 10 km – nagroda odblokowana","description":"Ostatnia świeczka.","verification":"AUTO","rule":{"kind":"activity","sports":["Run","TrailRun"],"minDistanceM":10000}}
]
```
Pozostałe: 4 (1500 m), 5 MANUAL, 9 MANUAL, 10 (3000), 12 MANUAL, 13 (3500), 15 (4000),
16 MIXED `{"kind":"activity","sports":["Run"],"minElapsedS":900,"autoComplete":false}`, 17 MANUAL, 18 (4500),
19 (5000), 21 MANUAL, 22 (6000), 23 MIXED `{"kind":"activity","sports":["Run","TrailRun"],"minElapsedS":600,"autoComplete":false}`,
24 MIXED `{"kind":"activity","sports":["WeightTraining","Workout"],"minElapsedS":2700,"autoComplete":false}`, 25 (7000), 27 (8000).

- [ ] **Krok 5: `prisma/schema.prisma`** — dokładnie wg SPEC §7:
```prisma
generator client { provider = "prisma-client"; output = "../src/generated/prisma" }
datasource db { provider = "postgresql" }

enum TaskStatus { LOCKED ACTIVE PENDING_REVIEW DONE }
enum Verification { AUTO MIXED MANUAL }
enum Source { STRAVA MANUAL CODE ADMIN }
enum SubmissionStatus { PENDING APPROVED REJECTED }
enum Actor { PLAYER ADMIN SYSTEM }

model Task {
  id Int @id
  stage Int
  title String
  description String
  verification Verification
  rule Json
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
  stravaActivityId BigInt? @unique
  resultSeconds Int?
  resultDistanceM Int?
  flagged Boolean @default(false)
  flagReason String?
  note String?
  approvedAt DateTime?
  updatedAt DateTime @updatedAt
}
model Submission {
  id String @id @default(cuid())
  taskId Int
  task Task @relation(fields: [taskId], references: [id])
  note String?
  photoPath String?
  status SubmissionStatus @default(PENDING)
  createdAt DateTime @default(now())
  reviewedAt DateTime?
  @@index([status])
}
model StravaAccount {
  athleteId BigInt @id
  accessTokenEnc String
  refreshTokenEnc String
  expiresAt DateTime
  scope String
  connectedAt DateTime @default(now())
  lastSyncAt DateTime?
  disconnected Boolean @default(false)
}
model StravaEvent {
  id String @id @default(cuid())
  objectId BigInt
  aspectType String
  eventTime BigInt
  ownerId BigInt
  payload Json
  receivedAt DateTime @default(now())
  processedAt DateTime?
  result String?
  @@unique([objectId, aspectType, eventTime])
}
model StravaActivity {
  id BigInt @id
  startDate DateTime
  sportType String
  distanceM Float
  movingTimeS Int
  elapsedTimeS Int
  elevGainM Float
  manual Boolean
  trainer Boolean
  deviceName String?
  splits Json
  laps Json
  fetchedAt DateTime @default(now())
  @@index([startDate])
}
model CodeAttempt {
  id String @id @default(cuid())
  taskId Int
  success Boolean
  createdAt DateTime @default(now())
  @@index([createdAt])
}
model AuditLog {
  id String @id @default(cuid())
  actor Actor
  action String
  taskId Int?
  meta Json?
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```
Uruchom `npm run db:up && npx prisma migrate dev --name init && npx prisma generate`.

- [ ] **Krok 6: `prisma/seed.cjs`** (czysty JS + `pg`, bez klienta Prisma, idempotentny):
```js
// Seed 28 zadań. Uruchamiany przez CMD kontenera i `prisma db seed`. Idempotentny (UPSERT).
const { Client } = require("pg");
const tasks = require("./seed-data/tasks.json");
async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const t of tasks) {
      await client.query(
        `INSERT INTO "Task" ("id","stage","title","description","verification","rule")
         VALUES ($1,$2,$3,$4,$5::"Verification",$6::jsonb)
         ON CONFLICT ("id") DO UPDATE SET "stage"=EXCLUDED."stage","title"=EXCLUDED."title",
           "description"=EXCLUDED."description","verification"=EXCLUDED."verification","rule"=EXCLUDED."rule"`,
        [t.id, t.stage, t.title, t.description, t.verification, JSON.stringify(t.rule)]
      );
    }
    await client.query("COMMIT");
    console.log(`Seed: ${tasks.length} zadań (upsert).`);
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { await client.end(); }
}
main().catch((e) => { console.error("Seed nieudany:", e); process.exit(1); });
```
`npm run db:seed` dwa razy → za drugim razem bez błędu, nadal 28 wierszy (`npx prisma studio` lub `SELECT count(*)`).

- [ ] **Krok 7: PASS** — `npm run check`.
- [ ] **Krok 8: Commit** — `claude: T2 — schemat Prisma, seed 28 zadań, typy reguł`.

---

### T3: Silnik reguł (czyste funkcje)

**Pliki:**
- Create: `src/lib/rules/splits.ts`, `src/lib/rules/splits.test.ts`, `src/lib/rules/engine.ts`,
  `src/lib/rules/engine.test.ts`, `src/lib/rules/window.ts`, `src/lib/rules/window.test.ts`,
  `tests/fixtures/strava/run-2km.json`, `tests/fixtures/strava/walk-3km-slow.json`, `tests/fixtures/strava/manual-run.json`

**Interfejsy:**
- Consumes: typy z T2.
- Produces:
  - `timeForDistance(splits: Split[], distanceM: number): number | null` (null gdy splity nie pokrywają dystansu).
  - `commonChecks(a: ActivitySummary, sports: SportType[], ctx: EvalContext): { ok: boolean; reasons: string[]; flags: string[] }`.
  - `evaluateActivity(rule: ActivityRule, a: ActivitySummary, ctx: EvalContext): EvalResult`.
  - `evaluateWindow(rule: WindowRule, activities: ActivitySummary[], ctx: EvalContext): EvalResult & { activityIds: number[] }`.

- [ ] **Krok 1: Test `splits` (failing)**
```ts
import { describe, it, expect } from "vitest";
import { timeForDistance } from "./splits";
const s = (d: number, e: number, m = e) => ({ distanceM: d, elapsedTimeS: e, movingTimeS: m });
describe("timeForDistance", () => {
  it("sumuje pełne splity", () => expect(timeForDistance([s(1000, 300), s(1000, 310), s(250, 80)], 2000)).toBe(610));
  it("interpoluje ostatni split proporcjonalnie", () => expect(timeForDistance([s(1000, 300), s(1000, 400)], 1500)).toBe(500));
  it("zwraca null gdy za mało dystansu", () => expect(timeForDistance([s(1000, 300)], 1500)).toBeNull());
  it("zwraca null dla pustych splitów", () => expect(timeForDistance([], 1000)).toBeNull());
});
```
- [ ] **Krok 2: FAIL**, potem implementacja:
```ts
import type { Split } from "./types";
/** Czas (s) pokonania pierwszych `distanceM` metrów wg splitów 1 km; ostatni split proporcjonalnie. */
export function timeForDistance(splits: Split[], distanceM: number): number | null {
  let covered = 0, time = 0;
  for (const sp of splits) {
    if (sp.distanceM <= 0) continue;
    const need = distanceM - covered;
    if (sp.distanceM >= need) return Math.round(time + sp.elapsedTimeS * (need / sp.distanceM));
    covered += sp.distanceM; time += sp.elapsedTimeS;
  }
  return null;
}
```
- [ ] **Krok 3: Testy `engine` (failing)** — przypadki (każdy osobny `it`), fixture'y tworzone helperem `act(overrides)`:
  1. Run 2100 m po unlockedAt, `manual:false` → `matched:true`, `resultDistanceM: 2100`.
  2. `manual:true` → `matched:false`, `reasons` zawiera "aktywność dodana ręcznie".
  3. `startDate` 1 h przed `unlockedAt` → false, reason "sprzed odblokowania"; 5 min przed → true (tolerancja 10 min).
  4. sportType `Ride` → false, reason zawiera "typ aktywności".
  5. id w `usedActivityIds` → false, "już wykorzystana".
  6. `maxTimeS {3000, 2400}` ze splitami dającymi 2500 s → false; 2300 s → true.
  7. `noStops` z `elapsed−moving = 25` na 1. splicie → false; 10 → true.
  8. `minElevGainM: 50` z 42 → false.
  9. `recordTimeForM: 2000` → `resultSeconds` = `timeForDistance(...,2000)`.
  10. `fasterThanTask {6, 30}` z `referenceTimes {6: 700}` i czasem 680 → false; 660 → true; brak `referenceTimes[6]` → false, reason "brak czasu referencyjnego".
  11. `trainer:true` → matched true, ale `flags` zawiera "trenażer"; `deviceName:null` → flag "brak urządzenia"; `VirtualRun` w sports → flag "bieg wirtualny".
  12. `minElapsedS: 1200` z elapsed 1100 → false.
- [ ] **Krok 4: Implementacja `engine.ts`** — `commonChecks` (owner sprawdzany wyżej, w process.ts), kolejność:
  manual → sport → startDate (`a.startDate >= unlockedAt − 10 min`) → used id; flagi wg SPEC §5. `evaluateActivity`
  łączy `commonChecks` + warunki reguły; **zbiera wszystkie powody**, nie przerywa na pierwszym.
  `resultDistanceM = Math.round(a.distanceM)`; `resultSeconds` ustawiane, gdy `recordTimeForM` lub `maxTimeS`.
- [ ] **Krok 5: Testy `window` (failing)**: 3 biegi w 5 dni Σ 6500 → true, `activityIds` = te 3; 3 biegi w 9 dni → false;
  3 biegi Σ 5500 → false; jeden bieg 900 m przy `minEachDistanceM 1000` nie liczy się; aktywności `manual` nie liczą się;
  aktywności sprzed `unlockedAt` nie liczą się; okno przesuwne: 4 biegi, tylko 3 ostatnie w 7 dniach → true.
- [ ] **Krok 6: Implementacja `window.ts`** — filtruj przez `commonChecks` (bez `usedActivityIds` — aktywności okna
  mogą być nowe), sortuj po `startDate`, dla każdego `i` weź aktywności w `[start_i, start_i + days*86400s]`,
  sprawdź `count ≥ minCount` i `Σ ≥ minTotalDistanceM`; zwróć pierwsze spełniające okno.
- [ ] **Krok 7: PASS** `npx vitest run src/lib/rules` — wszystkie zielone. `npm run check`.
- [ ] **Krok 8: Commit** — `claude: T3 — silnik reguł weryfikacji`.

---

### T4: Sesje, dostęp jubilata, logowanie admina, proxy

**Pliki:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/session.test.ts`, `src/lib/auth/player.ts`, `src/lib/auth/admin.ts`,
  `src/proxy.ts`, `src/app/start/[token]/route.ts`, `src/app/admin/login/page.tsx`, `src/app/admin/login/actions.ts`,
  `src/app/admin/login/login.module.css`

**Interfejsy:**
- Consumes: `getEnv()`.
- Produces: `signValue(payload: string, secret: string): string`, `verifyValue(token: string, secret: string): string | null`,
  `safeEqual(a: string, b: string): boolean`; `PLAYER_COOKIE = "bd_player"`, `ADMIN_COOKIE = "bd_admin"`;
  `isPlayer(): Promise<boolean>`, `setPlayerCookie(): Promise<void>`; `isAdmin(): Promise<boolean>`,
  `requireAdmin(): Promise<void>` (rzuca `redirect("/admin/login")`), `setAdminCookie()`, `clearAdminCookie()`;
  server action `loginAdmin(prev, formData)`.

- [ ] **Krok 1: Test `session` (failing)**: `signValue("player:1", s)` zwraca `payload.sig`; `verifyValue` zwraca payload;
  zmiana jednego znaku sygnatury → null; inny sekret → null; brak kropki → null; `safeEqual` różne długości → false.
- [ ] **Krok 2: Implementacja `session.ts`** (HMAC-SHA256 base64url; `safeEqual` przez `timingSafeEqual` na buforach
  równej długości, inaczej `false`).
- [ ] **Krok 3: `player.ts` / `admin.ts`** — `cookies()` z `next/headers` (async w Next 16 — sprawdź context7); payload
  `player:<issuedAtMs>` / `admin:<issuedAtMs>`; ważność 120 dni / 30 dni sprawdzana przy odczycie; cookie `httpOnly`,
  `sameSite: "lax"`, `secure: NODE_ENV === "production"`, `path: "/"`.
- [ ] **Krok 4: `start/[token]/route.ts`** — `GET`: `safeEqual(token, env.PLAYER_TOKEN)` → `setPlayerCookie()` →
  `redirect("/")`; inaczej `new Response("Nie znaleziono", { status: 404 })`.
- [ ] **Krok 5: `admin/login`** — formularz (hasło) → action `loginAdmin`: `safeEqual(hasło, env.ADMIN_PASSWORD)`; przy
  błędzie `await sleep(1000)` i komunikat "Nieprawidłowe hasło"; sukces → `setAdminCookie()` + `redirect("/admin")`.
  Style: karta jak "koperta aktywna" (SPEC §8), przycisk czarny/żółty.
- [ ] **Krok 6: `src/proxy.ts`** (Next 16; context7!) — dla `/admin` bez `/admin/login`: brak ważnego cookie → redirect
  `/admin/login`; dla wszystkich odpowiedzi dodaj `X-Robots-Tag: noindex, nofollow`. `matcher: ["/((?!_next|api/health).*)"]`.
  Weryfikacja podpisu w proxy: użyj Web Crypto (`crypto.subtle`) — środowisko może nie mieć `node:crypto`; jeśli 16.3
  pozwala na runtime Node w proxy, użyj `session.ts`. Zdecyduj po sprawdzeniu context7 i opisz w raporcie.
- [ ] **Krok 7: Weryfikacja ręczna** — `npm run dev`; `curl -I localhost:3000/admin` → 307 na `/admin/login`;
  `curl -I localhost:3000/start/zly` → 404; `curl -I "localhost:3000/start/$PLAYER_TOKEN"` → 307 + `Set-Cookie: bd_player`.
- [ ] **Krok 8: `npm run check`**, commit `claude: T4 — sesje, link startowy, logowanie admina, proxy`.

---

### T5: Maszyna stanów postępu, kody, audyt, Telegram

**Pliki:**
- Create: `src/lib/progress.ts`, `src/lib/codes.ts`, `src/lib/codes.test.ts`, `src/lib/audit.ts`,
  `src/lib/notify/telegram.ts`, `tests/integration/progress.test.ts`, `tests/integration/setup.ts`

**Interfejsy:**
- Consumes: `prisma`, `getEnv()`.
- Produces (`progress.ts`):
  ```ts
  export type BoardTask = { id: number; stage: number; status: TaskStatus; verification: Verification;
    title?: string; description?: string; source?: Source | null; flagged: boolean; resultSeconds?: number | null;
    completedAt?: Date | null; hasPendingSubmission: boolean };
  export type Board = { done: number; total: number; tasks: BoardTask[] };
  export function ensureStarted(): Promise<void>;          // tworzy 28 wierszy, zadanie 1 ACTIVE
  export function getBoard(opts?: { revealLocked?: boolean }): Promise<Board>; // domyślnie bez tytułów LOCKED
  export function getActive(): Promise<{ task: Task; progress: TaskProgress } | null>; // ACTIVE lub PENDING_REVIEW
  export function completeTask(taskId: number, input: { source: Source; stravaActivityId?: number; resultSeconds?: number;
    resultDistanceM?: number; flagged?: boolean; flagReason?: string; note?: string; actor: Actor }): Promise<void>;
  export function markPendingReview(taskId: number, input: { source: Source; stravaActivityId?: number; note?: string;
    resultSeconds?: number; resultDistanceM?: number; flagged?: boolean; flagReason?: string }): Promise<void>;
  export function submitManual(taskId: number, input: { note?: string; photoPath?: string }): Promise<void>;
  export function approve(taskId: number): Promise<void>;
  export function reject(taskId: number, reason: string): Promise<void>;
  export function undoLast(): Promise<number | null>;     // id cofniętego zadania
  export function resetAll(): Promise<void>;
  export function completeWithCode(taskId: number, code: string): Promise<{ ok: true } | { ok: false; error: "bad_code" | "rate_limited" | "not_active" }>;
  export class ProgressError extends Error { constructor(public code: "not_active" | "not_found" | "invalid_transition") }
  ```
  `codes.ts`: `codeForTask(secret: string, taskId: number): string` (format `XXXX-XXXX`, base32 bez 0/O/1/I),
  `verifyCode(secret, taskId, input): boolean` (normalizacja: uppercase, bez spacji/myślników, stały czas),
  `allCodes(secret): { taskId: number; code: string }[]`.
  `audit.ts`: `audit(actor: Actor, action: string, taskId?: number, meta?: unknown): Promise<void>`.
  `telegram.ts`: `notifyAdmin(text: string): Promise<void>` — `POST https://api.telegram.org/bot<token>/sendMessage`,
  no-op bez `TELEGRAM_*`, błędy tylko logowane.

- [ ] **Krok 1: Test `codes` (failing)**: kod deterministyczny (dwa wywołania równe), różne taskId → różne kody, format
  `/^[A-Z2-9]{4}-[A-Z2-9]{4}$/`, `verifyCode` akceptuje `"abcd efgh"`, `"ABCD-EFGH"`, odrzuca zły; inny sekret → inny kod.
- [ ] **Krok 2: Implementacja `codes.ts`** — `HMAC-SHA256(secret, "task:"+taskId)` → base32 alfabet
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 znaki), 8 znaków z pierwszych 40 bitów.
- [ ] **Krok 3: `tests/integration/setup.ts`** — `truncateAll()`: `TRUNCATE "TaskProgress","Submission","CodeAttempt","AuditLog","StravaEvent","StravaActivity","StravaAccount" CASCADE`
  (Task zostaje — seed). `beforeAll` wywołuje seed jeśli `Task` pusty (`node prisma/seed.cjs` przez `child_process`).
- [ ] **Krok 4: Testy integracyjne `progress` (failing)**, każdy `it` po `truncateAll()`:
  1. `ensureStarted` tworzy 28 wierszy; zadanie 1 ACTIVE z `unlockedAt`, reszta LOCKED; drugie wywołanie nic nie zmienia.
  2. `getBoard()` → `done 0`, `tasks[0].title` zdefiniowany, `tasks[1].title` **undefined**; `getBoard({revealLocked:true})` → zdefiniowany.
  3. `completeTask(1, {source:"MANUAL", actor:"ADMIN"})` → 1 DONE z `completedAt`, 2 ACTIVE z `unlockedAt ≥ teraz−1s`, `done 1`.
  4. `completeTask(3, …)` gdy 3 LOCKED → rzuca `ProgressError("not_active")`.
  5. `submitManual(1, {note:"x"})` → 1 PENDING_REVIEW, Submission PENDING; `approve(1)` → DONE, Submission APPROVED, 2 ACTIVE.
  6. `reject(1, "za mało")` po submitManual → 1 ACTIVE, Submission REJECTED, `note` = powód.
  7. `markPendingReview(1, {source:"STRAVA", stravaActivityId: 123})` → PENDING_REVIEW; `approve(1)` → DONE z `source STRAVA`, `stravaActivityId 123n`.
  8. `undoLast()` po zaliczeniu 1 i 2 → zwraca 2; 2 ACTIVE (bez `completedAt`, `stravaActivityId null`), 3 LOCKED; przy `done 0` → null.
  9. `resetAll()` → wszystko jak po `ensureStarted`, Submission/CodeAttempt puste, AuditLog ma wpis `reset`.
  10. `completeWithCode(1, codeForTask(env.CODES_SECRET, 1))` → ok, 1 DONE `source CODE`; zły kod → `bad_code` + CodeAttempt; 5 złych w 10 min → `rate_limited` nawet dla dobrego kodu.
  11. Zaliczenie 28 → `done 28`, brak ACTIVE.
  12. `completeTask` z `stravaActivityId` już użytym → błąd unikalności zamieniony na `ProgressError("invalid_transition")`.
- [ ] **Krok 5: Implementacja `progress.ts`** — każda mutacja w `prisma.$transaction`, wpis `audit(...)`, po
  `submitManual`/`markPendingReview` → `notifyAdmin("Koperta N czeka na zatwierdzenie: <APP_URL>/admin")`,
  po `completeTask` ze źródłem STRAVA → `notifyAdmin("Koperta N zaliczona automatycznie (…km, …min)")`.
  Unlock następnego: `taskId + 1 ≤ 28` → `LOCKED → ACTIVE`, `unlockedAt = now`.
- [ ] **Krok 6: PASS** — `npm run db:up && npx vitest run tests/integration/progress.test.ts src/lib/codes.test.ts`.
- [ ] **Krok 7: `npm run check`**, commit `claude: T5 — maszyna stanów postępu, kody, audyt, Telegram`.

---

### T6: Tokeny CSS, pluralizacja, komponenty bazowe (TopBar, Cake, ProgressPill, Hero, StageHeader, Footer, ikony)

**Pliki:**
- Create: `src/lib/text.ts`, `src/lib/text.test.ts`, `src/components/icons.tsx`,
  `src/components/TopBar.tsx` + `.module.css`, `src/components/Cake.tsx` + `.module.css`,
  `src/components/ProgressPill.tsx` + `.module.css`, `src/components/Hero.tsx` + `.module.css`,
  `src/components/StageHeader.tsx` + `.module.css`, `src/components/Footer.tsx` + `.module.css`,
  `src/app/dev/preview/page.tsx` (tylko `NODE_ENV !== "production"`, inaczej `notFound()`)

**Interfejsy:**
- Produces: `plural(n: number, one: string, few: string, many: string): string`;
  `IconCheck`, `IconDumbbell`, `IconLock`, `IconGift` (`{ size?: number; strokeWidth?: number; color?: string }`);
  `<TopBar dateLabel />`, `<Cake done total age />`, `<ProgressPill done total />`, `<Hero name total />`,
  `<StageHeader index name />`, `<Footer from />`.

- [ ] **Krok 1: Test `plural` (failing)**: `plural(1,"koperta","koperty","kopert")="koperta"`, 2→koperty, 5→kopert,
  12→kopert, 22→koperty, 25→kopert, 0→kopert.
- [ ] **Krok 2: Implementacja** — reguła polska: 1 → one; `n%10 ∈ 2..4` i `n%100 ∉ 12..14` → few; inaczej many.
- [ ] **Krok 3: `icons.tsx`** — 4 ikony ze ścieżek w SPEC §8 (`viewBox 0 0 24 24`, `fill none`, `stroke currentColor`,
  `strokeLinecap/Join round`, `aria-hidden`).
- [ ] **Krok 4: Komponenty** — wartości 1:1 ze SPEC §8, mobile-first, `@media (min-width:1024px)` dla desktop.
  `Cake`: renderuje `total` świeczek (`Array.from`), świeczka `i` ma klasę `lit` gdy `i < done`, `transition: box-shadow .4s, background .4s`;
  warstwa malinowa z `age`; `aria-label="Tort: {done} z {total} świeczek zapalonych"`. Kontener tortu na mobile:
  `width: 350px; max-width: 100%; transform-origin: top center;` z `@media (max-width: 389px) { transform: scale(calc((100vw - 40px) / 350)); }`.
  `ProgressPill`: `Zapalone: {done} / {total}`. `Hero`: `Sto lat, <span class=accent>{name}</span>!<br/>Zanim zdmuchniesz…`,
  lead `Masz {total} {plural(total,"kopertę","koperty","kopert")} z zadaniami. Każda otwiera się dopiero po zaliczeniu poprzedniej. Gdy tort będzie gotowy, rozpakujesz prezent.`
  `StageHeader`: `Etap {index} · {name}`. `Footer`: `Z miłością i lekkim sadyzmem — {from}`.
- [ ] **Krok 5: Strona podglądu `/dev/preview`** — renderuje wszystkie komponenty z `done = 0, 5, 28`.
  Sprawdź wizualnie w przeglądarce (skill `frontend-design` przy pracy nad stylami; porównaj z `design/mobile.html`
  i `design/desktop.html` otwartymi jako pliki statyczne — one same się nie uruchomią, ale wartości są w SPEC).
- [ ] **Krok 6: `npm run check`**, commit `claude: T6 — tokeny, pluralizacja, tort i komponenty bazowe`.

---

### T7: Uploady zdjęć

**Pliki:**
- Create: `src/lib/uploads.ts`, `src/lib/uploads.test.ts`, `src/app/api/uploads/[id]/route.ts`

**Interfejsy:**
- Consumes: `getEnv().UPLOAD_DIR`, `isPlayer()`, `isAdmin()`.
- Produces: `saveUpload(file: File): Promise<{ path: string }>` (rzuca `UploadError("type"|"size")`),
  `openUpload(path: string): Promise<{ stream: ReadableStream; contentType: string } | null>`,
  `ALLOWED = {"image/jpeg":".jpg","image/png":".png","image/webp":".webp","image/heic":".heic"}`, `MAX_BYTES = 10*1024*1024`.

- [ ] **Krok 1: Testy (failing)** z `UPLOAD_DIR` = katalog tymczasowy (`fs.mkdtemp`): zapis JPEG → plik istnieje,
  nazwa `/^[0-9a-f-]{36}\.jpg$/`; `text/plain` → `UploadError("type")`; 11 MB → `UploadError("size")`;
  `openUpload("../../etc/passwd")` → null (ścieżka poza katalogiem); `openUpload` nieistniejącego → null.
- [ ] **Krok 2: Implementacja** — `path.basename` + sprawdzenie, że `resolve(UPLOAD_DIR, name)` zaczyna się od `resolve(UPLOAD_DIR)`;
  `mkdir -p` przy pierwszym zapisie; `randomUUID()`.
- [ ] **Krok 3: Route `GET /api/uploads/[id]`** — 404 gdy ani gracz, ani admin; `Cache-Control: private, max-age=3600`.
- [ ] **Krok 4: `npm run check`**, commit `claude: T7 — uploady zdjęć`.

---

### T8: Klient Strava, szyfrowanie tokenów, OAuth connect/callback

**Pliki:**
- Create: `src/lib/strava/crypto.ts`, `src/lib/strava/crypto.test.ts`, `src/lib/strava/client.ts`,
  `src/lib/strava/client.test.ts`, `src/lib/strava/tokens.ts`, `tests/integration/tokens.test.ts`,
  `src/app/api/strava/connect/route.ts`, `src/app/api/strava/callback/route.ts`, `tests/fixtures/strava/detailed-activity.json`

**Interfejsy:**
- Consumes: `prisma`, `getEnv()`, `signValue/verifyValue`, `isPlayer()`, `ActivitySummary`.
- Produces:
  - `encrypt(plain: string, secret: string): string`, `decrypt(enc: string, secret: string): string` (AES-256-GCM, klucz `sha256(secret)`, format `iv.tag.data` base64url).
  - `authorizeUrl(state: string): string` (`https://www.strava.com/oauth/authorize?client_id&redirect_uri=${APP_URL}/api/strava/callback&response_type=code&approval_prompt=auto&scope=activity:read_all&state`).
  - `exchangeCode(code: string): Promise<TokenSet>`, `refreshTokens(refreshToken: string): Promise<TokenSet>`
    gdzie `TokenSet = { accessToken; refreshToken; expiresAt: Date; athleteId: number; scope: string }`.
  - `getActivity(accessToken, id: number): Promise<ActivitySummary & { laps: unknown[]; ownerId: number }>`,
    `listActivityIds(accessToken, afterEpochS: number): Promise<number[]>` (paginacja `per_page=50`).
  - `mapDetailedActivity(json: unknown): ActivitySummary & { laps: unknown[]; ownerId: number }`.
  - `tokens.ts`: `saveTokens(t: TokenSet)`, `getAccount(): Promise<{ athleteId: number; connected: boolean; lastSyncAt: Date | null } | null>`,
    `getValidAccessToken(): Promise<{ token: string; athleteId: number } | null>` (odświeża, gdy `expiresAt < now + 60 s`;
    401 przy odświeżaniu → `disconnected = true`, zwraca null), `markSynced()`, `disconnect()`.
  - `StravaApiError extends Error { status: number }`.

- [ ] **Krok 1: Test `crypto`**: round-trip; inny sekret → rzuca; zmiana znaku → rzuca; dwa szyfrowania tego samego tekstu różnią się (losowy IV).
- [ ] **Krok 2: Test `client`** z `vi.stubGlobal("fetch", …)`: `authorizeUrl` zawiera `scope=activity%3Aread_all` i `state`;
  `exchangeCode` wysyła `grant_type=authorization_code` i mapuje `expires_at` (epoch s) na `Date`; `refreshTokens` zapisuje
  **nowy** `refresh_token` z odpowiedzi; `mapDetailedActivity(fixture)` mapuje `splits_metric[].distance→distanceM`,
  `elapsed_time→elapsedTimeS`, `moving_time→movingTimeS`, `total_elevation_gain→elevGainM`, `device_name→deviceName`,
  `athlete.id→ownerId`, `manual`, `trainer`; brak `splits_metric` → `splits: []`; odpowiedź 429 → `StravaApiError(429)`.
- [ ] **Krok 3: Implementacja** `crypto.ts`, `client.ts` (weryfikuj endpointy przez WebFetch dokumentacji
  https://developers.strava.com/docs/reference/ jeśli context7 nie ma Stravy), `tokens.ts`.
- [ ] **Krok 4: Test integracyjny `tokens`**: `saveTokens` → w DB tokeny zaszyfrowane (nie równe jawnym);
  `getValidAccessToken` bez odświeżania gdy ważny; z `expiresAt` w przeszłości wywołuje `refreshTokens` (mock) i zapisuje nowy refresh.
- [ ] **Krok 5: Routes** — `connect`: wymaga `isPlayer()` (inaczej 404); `state = signValue("strava:"+Date.now())`;
  redirect na `authorizeUrl`. `callback`: `verifyValue(state)` (≤ 10 min) inaczej 400; `error=access_denied` → redirect `/?strava=denied`;
  `scope` bez `activity:read_all` → redirect `/?strava=scope`; `exchangeCode` → `saveTokens` → redirect `/?strava=ok`.
- [ ] **Krok 6: `npm run check`**, commit `claude: T8 — klient Strava, tokeny, OAuth`.

---

### T9: Przetwarzanie aktywności, webhook, synchronizacja

**Pliki:**
- Create: `src/lib/strava/process.ts`, `tests/integration/process.test.ts`, `src/lib/strava/sync.ts`,
  `src/app/api/strava/webhook/route.ts`, `src/lib/strava/webhook.test.ts`

**Interfejsy:**
- Consumes: `evaluateActivity`, `evaluateWindow`, `progress.*`, `getValidAccessToken`, `getActivity`, `listActivityIds`, `audit`.
- Produces:
  - `cacheActivity(a: ActivitySummary & { laps: unknown[] }): Promise<void>` (upsert `StravaActivity`).
  - `evaluateAgainstActive(a: ActivitySummary): Promise<{ outcome: "completed" | "pending" | "no_match" | "no_active" | "already_done"; reasons: string[] }>`
    — wczytuje aktywne zadanie; `referenceTimes` z `TaskProgress.resultSeconds` zadań DONE; `usedActivityIds` z `TaskProgress.stravaActivityId`;
    dla `window` pobiera z cache aktywności `startDate ≥ unlockedAt − 10 min`; AUTO lub `autoComplete` → `completeTask`,
    inaczej `markPendingReview`; dla okna `stravaActivityId` = ostatnia aktywność okna, `note` = lista id.
  - `processActivityById(id: number): Promise<…>` — `getValidAccessToken` → `getActivity` → `ownerId` musi być równy `athleteId` → `cacheActivity` → `evaluateAgainstActive`; wpis audytu `strava.evaluate` z `reasons`.
  - `handleWebhookEvent(ev: { object_type; aspect_type; object_id; owner_id; event_time; updates? }): Promise<void>` —
    zapis `StravaEvent` (`create` z `@@unique` → duplikat = return); `athlete` → ignoruj; `delete` → jeśli id użyte w DONE →
    `flagged = true`, `flagReason = "aktywność usunięta ze Stravy"`; `create|update` → `processActivityById`; `processedAt`, `result`.
  - `sync.ts`: `syncNow(): Promise<{ fetched: number }>` — `listActivityIds(after = unlockedAt aktywnego − 10 min)`, dla nieznanych
    w cache `processActivityById`, `markSynced()`; `syncIfStale(maxAgeMin = 10): Promise<void>` (nie rzuca; loguje).
- [ ] **Krok 1: Testy integracyjne `process`** (mock `getActivity`/`getValidAccessToken` przez `vi.mock("./client")`,
  `vi.mock("./tokens")`): (a) zadanie 3 aktywne, bieg 1,2 km z fixture → `completed`, 3 DONE, 4 ACTIVE, `stravaActivityId`;
  (b) ten sam id drugi raz → `already_done`/brak zmian; (c) `manual:true` → `no_match`, nic nie zmienione, audit z powodem;
  (d) zadanie 7 (MIXED) → `pending`, status PENDING_REVIEW; (e) zadanie 8 (window): 3 biegi po 2,2 km w 3 dni → trzeci daje `completed`;
  (f) `ownerId` inny niż `athleteId` → `no_match` z powodem "inny sportowiec".
- [ ] **Krok 2: Implementacja `process.ts`, `sync.ts`.**
- [ ] **Krok 3: Test `webhook` route (unit, mock `handleWebhookEvent`)**: GET z dobrym `hub.verify_token` →
  200 `{"hub.challenge": "..."}`; zły → 403; POST → 200 natychmiast, `handleWebhookEvent` wywołany przez `after()`
  (z `next/server`; context7) z payloadem; POST z błędnym JSON → 400.
- [ ] **Krok 4: Implementacja route** (`export const dynamic = "force-dynamic"`).
- [ ] **Krok 5: `npm run check`**, commit `claude: T9 — przetwarzanie aktywności Strava, webhook, sync`.

---

### T10: Strona jubilata (koperty, prezent, zgłoszenia)

**Pliki:**
- Create: `src/components/EnvelopeDone.tsx` + `.module.css`, `src/components/EnvelopeActive.tsx` + `.module.css`,
  `src/components/EnvelopeLocked.tsx` + `.module.css`, `src/components/GiftLocked.tsx` + `.module.css`,
  `src/components/GiftUnlocked.tsx` + `.module.css`, `src/components/SubmitForm.tsx` (client) + `.module.css`,
  `src/components/StravaBanner.tsx` + `.module.css`, `src/app/page.tsx`, `src/app/page.module.css`,
  `src/app/actions.ts`, `src/app/not-started.module.css`

**Interfejsy:**
- Consumes: `isPlayer`, `ensureStarted`, `getBoard`, `submitManual`, `completeWithCode`, `saveUpload`, `getAccount`,
  `syncIfStale`, komponenty z T6, `site`, `plural`.
- Produces: server actions `submitTaskAction(prev, formData)` (pola: `taskId`, `note`, `photo`, `code`) → `{ ok } | { error: string }`;
  strona `/`.

- [ ] **Krok 1: Layout strony** (`page.tsx`, Server Component):
  - Brak `isPlayer()` → widok "zaklejony": top bar + jedna koperta zaklejona z tekstem "Ta strona otwiera się tylko
    z właściwym linkiem." (bez imienia, bez liczby zadań) i status 200.
  - Gracz: `await ensureStarted()`; `after(() => syncIfStale())`; `board = await getBoard()`; `account = await getAccount()`.
  - Mobile kolejność: TopBar → Cake → ProgressPill → Hero → (StravaBanner gdy `!account?.connected` i aktywne zadanie
    ma `verification !== "MANUAL"`) → lista (StageHeader + koperty) → Gift → Footer. Desktop: grid `520px minmax(0,1fr)`,
    lewa: Cake, Hero, Gift, Footer; prawa: nagłówek listy "Koperty · {done} / 28 zaliczone" + lista.
  - Query `?strava=ok|denied|scope` → jednorazowy komunikat nad listą.
- [ ] **Krok 2: Koperty** wg SPEC §8. `EnvelopeActive` props: `{ task: BoardTask; stravaConnected: boolean }`;
  dla `verification === "AUTO"`: opis + tekst "Zalicza się samo po biegu zapisanym w Stravie." + (gdy nie połączona) link
  `/api/strava/connect` "Połącz Stravę"; formularz zgłoszenia z polem kodu **zawsze** (kod działa też dla AUTO — tryb awaryjny);
  dla MANUAL/MIXED: `SubmitForm` (notatka, zdjęcie, kod) z przyciskiem "ZROBIONE — ZAPAL ŚWIECZKĘ";
  status `PENDING_REVIEW` → pigułka "KOPERTA n · CZEKA NA DAWIDA", formularz ukryty, tekst "Zgłoszenie wysłane. Świeczka zapali się po potwierdzeniu.".
  `SubmitForm`: `useActionState(submitTaskAction)`, `<input type="file" accept="image/*" capture="environment">`,
  komunikaty błędów: `bad_code` → "Zły kod. Spróbuj jeszcze raz.", `rate_limited` → "Za dużo prób. Odczekaj 10 minut.",
  `type/size` → "Zdjęcie: tylko JPG/PNG/WEBP/HEIC do 10 MB.".
- [ ] **Krok 3: `actions.ts`** — `"use server"`; `isPlayer()` inaczej `{error:"forbidden"}`; jeśli `code` niepuste →
  `completeWithCode`; w przeciwnym razie: MANUAL/MIXED → opcjonalny `saveUpload(photo)` → `submitManual`; AUTO bez kodu →
  `{ error: "auto_only" }` ("To zadanie zalicza Strava."). Na końcu `revalidatePath("/")`.
- [ ] **Krok 4: Prezent** — `GiftLocked` `{ left }` z `plural(left,"koperta","koperty","kopert")`; `GiftUnlocked` `{ title, description }` bez przycisku "Od nowa" (SPEC D4).
- [ ] **Krok 5: Weryfikacja ręczna** — `npm run dev`, wejdź `/start/<PLAYER_TOKEN>`; zaliczaj kodem z `codeForTask` (np. skryptem
  `node -e` z `CODES_SECRET`) 3 zadania; sprawdź: świeczki, pigułka, koperty, nagłówki etapów, mobile 390 px i desktop 1280 px w devtools;
  `curl localhost:3000` bez cookie → HTML nie zawiera imienia z `site.name` ani tytułów zadań (`grep`).
- [ ] **Krok 6: `npm run check`**, commit `claude: T10 — strona jubilata`.

---

### T11: Panel admina

**Pliki:**
- Create: `src/app/admin/page.tsx`, `src/app/admin/page.module.css`, `src/app/admin/actions.ts`,
  `src/components/admin/PendingCard.tsx`, `src/components/admin/TaskTable.tsx`, `src/components/admin/CodesList.tsx`,
  `src/components/admin/DangerZone.tsx` (client)

**Interfejsy:**
- Consumes: `requireAdmin`, `getBoard({revealLocked:true})`, `prisma` (Submission PENDING, AuditLog, StravaActivity), `approve`,
  `reject`, `undoLast`, `resetAll`, `syncNow`, `allCodes`, `getAccount`, `disconnect`, `clearAdminCookie`, `getEnv().PLAYER_TOKEN`.
- Produces: actions `approveAction(taskId)`, `rejectAction(taskId, reason)`, `undoAction()`, `resetAction(confirmWord)`
  (tylko `"RESET"`), `syncAction()`, `logoutAction()`, `disconnectStravaAction()`.

- [ ] **Krok 1: Strona** (`requireAdmin()` na górze) — sekcje wg SPEC §9. W kartach "Do zatwierdzenia": tytuł zadania,
  typ, data zgłoszenia, notatka, zdjęcie (`<img src="/api/uploads/<id>">`), a dla PENDING_REVIEW ze Stravą: dystans (km, 2 miejsca),
  czas (mm:ss), typ, urządzenie, flaga, link `https://www.strava.com/activities/<id>`; przyciski Zatwierdź / Odrzuć (pole powodu).
  Tabela 28 zadań: nr, tytuł, status, źródło, wynik (`resultSeconds` jako mm:ss), flaga z powodem, `completedAt`.
  "Cofnij ostatnie zaliczenie" (confirm w UI, bez `confirm()`), "Synchronizuj Stravę", status konta, link startowy
  `${APP_URL}/start/${PLAYER_TOKEN}` z przyciskiem kopiuj (client), kody (28 wierszy, `@media print` ukrywa resztę),
  strefa niebezpieczna z polem "wpisz RESET", ostatnie 50 wpisów audytu.
- [ ] **Krok 2: Actions** — każda zaczyna od `requireAdmin()`; `revalidatePath("/admin")` i `revalidatePath("/")`.
- [ ] **Krok 3: Weryfikacja ręczna** — zgłoś zadanie MANUAL jako gracz ze zdjęciem → w panelu widać zdjęcie → Zatwierdź →
  u gracza świeczka; Odrzuć → koperta znów aktywna z powodem; Cofnij; Reset z "RESET"; `curl -I /admin` bez cookie → redirect.
- [ ] **Krok 4: `npm run check`**, commit `claude: T11 — panel admina`.

---

### T12: Obraz Docker i compose produkcyjny

**Pliki:**
- Create: `Dockerfile`, `docker/entrypoint.sh`, `docker-compose.prod.yml`, `tests/docker-smoke.sh`

**Interfejsy:**
- Consumes: `prisma/`, `prisma.config.ts`, `package.json` (wersja `prisma` w devDependencies), `/api/health`.
- Produces: obraz z `CMD ["./entrypoint.sh"]`; stack `urodzinowe` (usługi `db`, `app`).

- [ ] **Krok 1: `Dockerfile`** — stage `base` (`node:24-slim`, `WORKDIR /app`), `deps` (`COPY package*.json`, `npm ci`),
  `build` (`COPY . .`, `npx prisma generate`, `NEXT_TELEMETRY_DISABLED=1 npm run build`), `prisma-cli`:
  ```dockerfile
  FROM base AS prisma-cli
  WORKDIR /tools
  COPY package.json /tmp/package.json
  RUN V=$(node -p "require('/tmp/package.json').devDependencies.prisma") \
   && npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund "prisma@$V" dotenv pg
  ```
  `runtime`: `apt-get install -y --no-install-recommends openssl ca-certificates`, `ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/data/uploads`,
  kopie `public`, `.next/standalone` → `./`, `.next/static` → `./.next/static`, `prisma/`, `prisma.config.ts`,
  `scripts/strava-subscribe.cjs` → `./scripts/`, `/tools/node_modules` → `./tools/node_modules`, `docker/entrypoint.sh`;
  `RUN mkdir -p /data/uploads && chown -R node:node /data /app`; `USER node`; `EXPOSE 3000`; `CMD ["./entrypoint.sh"]`.
  Jeśli `prisma.config.ts` nie ładuje się w runtime bez TypeScript-loadera — fallback: skopiuj go jako `prisma.config.mjs`
  z tą samą treścią w ESM (implementer sprawdza `node tools/node_modules/prisma/build/index.js migrate status` w kontenerze).
- [ ] **Krok 2: `docker/entrypoint.sh`**:
  ```sh
  #!/bin/sh
  set -eu
  [ -w "$UPLOAD_DIR" ] || { echo "Katalog $UPLOAD_DIR nie jest zapisywalny" >&2; exit 1; }
  echo "Migracje…";  node tools/node_modules/prisma/build/index.js migrate deploy
  echo "Seed…";      NODE_PATH=/app/tools/node_modules node prisma/seed.cjs
  echo "Start…";     exec node server.js
  ```
- [ ] **Krok 3: `docker-compose.prod.yml`** — 1:1 z SPEC §10 i `demo-deploy.md` (zmienne: `POSTGRES_*`, `DATABASE_URL`,
  `AUTH_SECRET`, `CODES_SECRET`, `PLAYER_TOKEN`, `ADMIN_PASSWORD`, `APP_URL: "https://${APP_DOMAIN}"`, `STRAVA_CLIENT_ID`,
  `STRAVA_CLIENT_SECRET`, `STRAVA_WEBHOOK_VERIFY_TOKEN`, `TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN:-}"`,
  `TELEGRAM_CHAT_ID: "${TELEGRAM_CHAT_ID:-}"`, `UPLOAD_DIR: /data/uploads`); wymagane z `:?komunikat`; `volumes: [uploads:/data/uploads]`;
  healthcheck na `/api/health`; `start_period: 60s`; bez `ports:`.
- [ ] **Krok 4: `tests/docker-smoke.sh`** — lokalny test: `docker compose -f docker-compose.prod.yml -f tests/compose.smoke.yml config`
  (override w tym samym pliku testowym tworzy sieć `web` lokalnie: `docker network create web || true`), `.env` testowy z losowymi
  wartościami, `up -d --build`, pętla do 90 s na `docker inspect --format '{{.State.Health.Status}}' urodzinowe == healthy`,
  `docker compose exec app node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1))"`, `down -v`.
  Asercje statyczne: `grep -q '^\s*ports:' docker-compose.prod.yml` → FAIL jeśli znajdzie.
- [ ] **Krok 5: Uruchom `bash tests/docker-smoke.sh`** → "healthy" (wymaga Dockera lokalnie; jeśli brak — zaznacz w raporcie
  i pozostaw krok nieodhaczony).
- [ ] **Krok 6: Commit** `claude: T12 — Dockerfile, entrypoint, compose produkcyjny`.

---

### T13: Skrypty deployu i testy bash

**Pliki:**
- Create: `deploy.conf.example`, `scripts/deploy.sh`, `scripts/lib/deploy-lib.sh`, `tests/deploy-lib.test.sh`,
  `tests/fixtures/deploy.conf`

**Interfejsy:**
- Produces (w `deploy-lib.sh`, wszystkie bez efektów ubocznych przy `source`): `log ok warn die`, `require_cmd`,
  `load_config FILE`, `validate_config`, `inject_git_token URL TOKEN`, `gen_remote_prereqs_script`,
  `gen_remote_network_script`, `gen_remote_code_script`, `gen_remote_env_script APP_DOMAIN KEY=VALUE...`,
  `gen_remote_secret_probe_script KEY...`, `gen_remote_up_script`, `gen_remote_bootstrap_script`, `wait_for_url URL DEADLINE_S INTERVAL_S`.
  `deploy.sh`: `--dry-run`, `--config <plik>`, `--set-secret KEY`, `--no-wait`.

- [ ] **Krok 1: `tests/deploy-lib.test.sh` (failing)** — własne `assert_contains/assert_not_contains/assert_fails`, `set -euo pipefail`:
  1. `validate_config` bez `SERVER_HOST` → die; z kompletem → ustawia `SSH_PORT=22`, `REPO_BRANCH=main`, `DEPLOY_DIR=urodzinowe`.
  2. `inject_git_token https://github.com/x/y.git tok` → `https://tok@github.com/x/y.git`; `gen_remote_code_script` zawiera `git remote set-url origin` **bez** `tok`.
  3. `gen_remote_env_script app.example.pl STRAVA_CLIENT_SECRET=__PLACEHOLDER__` zawiera `chmod 600 .env`, `env_set APP_DOMAIN`,
     `env_set_if_missing POSTGRES_PASSWORD`, `env_set_if_missing AUTH_SECRET`, `CODES_SECRET`, `PLAYER_TOKEN`,
     `STRAVA_WEBHOOK_VERIFY_TOKEN`, `ADMIN_PASSWORD`; zawiera `__PLACEHOLDER__`, nie zawiera `sekret-testowy`.
  4. `gen_remote_bootstrap_script` przechodzi `bash -n`; zawiera `docker network create web`, `up -d --build`; **nie** zawiera `prisma migrate`.
  5. `bash scripts/deploy.sh --dry-run --config tests/fixtures/deploy.conf` → exit 0, wyjście zawiera `set -euo pipefail` i `app.example.pl`, nie zawiera `ssh `.
  6. `gen_remote_secret_probe_script STRAVA_CLIENT_ID` zawiera `grep -q '^STRAVA_CLIENT_ID=' .env || echo STRAVA_CLIENT_ID`.
- [ ] **Krok 2: Implementacja `deploy-lib.sh`** wg `demo-deploy.md` §4 i SPEC §10. `env_set` przez `awk` do pliku tymczasowego;
  `gen_secret(){ head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }`; `PLAYER_TOKEN` 32 znaki.
- [ ] **Krok 3: `deploy.sh`** — sterownik: parsowanie argumentów → `load_config` → `validate_config` → w `--dry-run`:
  bootstrap z placeholderami na stdout, exit 0 → realnie: `ssh … 'bash -s' < <(gen_remote_secret_probe_script STRAVA_CLIENT_ID STRAVA_CLIENT_SECRET TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID)`;
  brakujące: z lokalnego env lub `read -rs` (Telegram: Enter = pomiń); `gen_remote_bootstrap_script … | ssh … 'bash -s'`;
  `wait_for_url "https://$APP_DOMAIN/api/health" 180 5`; na koniec przypomnienie o `scripts/strava-subscribe.sh`.
- [ ] **Krok 4: `deploy.conf.example`** — klucze dokładnie z `demo-deploy.md` + `DEPLOY_DIR=urodzinowe`, `HEALTH_TIMEOUT=180`.
- [ ] **Krok 5: PASS** `bash tests/deploy-lib.test.sh`; `shellcheck` jeśli dostępny.
- [ ] **Krok 6: Commit** `claude: T13 — skrypty deployu z testami`.

---

### T14: Subskrypcja webhooka, backup, README

**Pliki:**
- Create: `scripts/strava-subscribe.cjs`, `scripts/strava-subscribe.sh`, `scripts/backup.sh`, `README.md`

- [ ] **Krok 1: `scripts/strava-subscribe.cjs`** (czysty `fetch`, uruchamiany **w kontenerze**): `GET push_subscriptions?client_id&client_secret`;
  jeśli istnieje z `callback_url === APP_URL + "/api/strava/webhook"` → "OK, już zarejestrowana"; jeśli inna → `DELETE /push_subscriptions/{id}`;
  `POST` z `verify_token = STRAVA_WEBHOOK_VERIFY_TOKEN`; wypisz id. Exit 1 z czytelnym komunikatem, gdy Strava odrzuci (np. callback nie odpowiedział).
- [ ] **Krok 2: `scripts/strava-subscribe.sh`** — `source scripts/lib/deploy-lib.sh`, `load_config`, `ssh … "cd ~/$DEPLOY_DIR && docker compose -f docker-compose.prod.yml exec -T app node scripts/strava-subscribe.cjs"`.
- [ ] **Krok 3: `scripts/backup.sh`** — `pg_dump -Fc` przez `docker compose exec -T db` do `backups/db-<data>.dump`; wolumen `urodzinowe_uploads`
  do `backups/uploads-<data>.tgz`; sekcja komentarza z komendami restore.
- [ ] **Krok 4: `README.md`** — po polsku: co to jest, dev lokalny (`db:up`, `.env`, `db:migrate`, `db:seed`, `dev`), tunel dla webhooka
  (`cloudflared tunnel --url http://localhost:3000` + osobna apka Strava dev), deploy (`deploy.conf`, `deploy.sh --dry-run`, `deploy.sh`,
  `strava-subscribe.sh`), checklista Dawida (SPEC §13), gdzie zmienić personalizację (`src/config/site.ts`), jak wydrukować kody.
- [ ] **Krok 5: Commit** `claude: T14 — subskrypcja webhooka, backup, README`.

---

## Poza zakresem

Tryb "zdmuchiwane", wielu graczy, S3/CDN, e-mail, PWA, i18n, automatyczne wykrywanie interwałów z `laps`,
import parkrun, Prisma 8, CI/CD (deploy ręczny z laptopa zgodnie z `demo-deploy.md`).

## Ryzyka i decyzje architektoniczne

1. **Strava Single Player Mode + płatna subskrypcja** (SPEC §3): bez tego OAuth jubilata nie zadziała. Aplikacja
   działa bez Stravy w trybie kodów/panelu — dlatego kod jest akceptowany także dla zadań AUTO.
2. **Next 16 `proxy.ts` i runtime** — implementer T4 weryfikuje przez context7; podpis cookie w proxy przez Web Crypto.
3. **Prisma 7 w obrazie standalone** — osobny stage `prisma-cli` i jawne kopiowanie `prisma/` + `prisma.config.ts`
   (dyskusja prisma#29305); w razie problemu z `.ts` w runtime — `prisma.config.mjs`.
4. **Czysty silnik reguł bez DB** — testowalny na fixture'ach; process.ts to jedyny most do DB. Reguły w JSON w `Task.rule`,
   więc zmiana progu zadania = edycja `tasks.json` + redeploy (seed jest upsertem).
5. **AUTO zalicza natychmiast** (SPEC D7) — ryzyko szumu GPS mitygowane flagami i "Cofnij" w panelu.
6. **Sync przy wejściu gracza zamiast crona** — jedna osoba, brak dodatkowego procesu; `after()` nie blokuje renderu.
7. **Kody HMAC, nie losowe w DB** — brak tabeli sekretów, panel generuje listę na żądanie; kompromitacja `CODES_SECRET` = rotacja
   przez `deploy.sh --set-secret CODES_SECRET`.

## Uruchomienie planu

```
Agent(subagent_type: "implementer", model: "opus", prompt: "Plan: docs/plan/urodzinowe-wyzwania.md, zadanie T1")
Agent(subagent_type: "reviewer",              prompt: "Plan: docs/plan/urodzinowe-wyzwania.md, zadanie T1")
```
Kolejność: T1 → T2 → [T3 ‖ T4 ‖ T5 ‖ T6 ‖ T7 ‖ T13] → T8 → T9 → [T10 ‖ T11 ‖ T12] → T14.
Równoległe zadania w jednym wywołaniu `Agent` (osobne worktree nie są konieczne — listy plików są rozłączne).
