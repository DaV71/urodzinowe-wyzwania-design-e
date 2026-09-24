// Wspólne narzędzia testów integracyjnych (baza z docker-compose.dev.yml, DATABASE_URL z .env).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db";

let seeded = false;

const LOCAL_DB_HOSTS = new Set(["localhost", "127.0.0.1"]);

// Strażnik: testy czyszczą tabele (TRUNCATE), więc dopuszczamy tylko lokalną bazę.
export function assertLocalDatabaseUrl(url: string | undefined): void {
  let host: string;
  try {
    host = new URL(url ?? "").hostname;
  } catch {
    throw new Error("Testy integracyjne: DATABASE_URL jest pusty albo niepoprawny — przerywam przed TRUNCATE.");
  }
  if (!LOCAL_DB_HOSTS.has(host)) {
    throw new Error(`Testy integracyjne: DATABASE_URL wskazuje na host "${host}", a nie localhost/127.0.0.1 — przerywam przed TRUNCATE.`);
  }
}

// Seed 28 zadań, jeśli tabela Task jest pusta (np. świeża baza po migracji).
async function ensureTasksSeeded(): Promise<void> {
  if (seeded) return;
  if ((await prisma.task.count()) === 0) {
    execFileSync(process.execPath, [path.resolve(__dirname, "../../prisma/seed.cjs")], {
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: "ignore",
    });
  }
  seeded = true;
}

// Czyści stan gry (bez tabeli Task) przed każdym testem.
export async function truncateAll(): Promise<void> {
  assertLocalDatabaseUrl(process.env.DATABASE_URL);
  await ensureTasksSeeded();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "TaskProgress", "Submission", "CodeAttempt", "AuditLog"`);
}
