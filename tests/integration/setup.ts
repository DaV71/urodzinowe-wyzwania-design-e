// Wspólne narzędzia testów integracyjnych (baza z docker-compose.dev.yml, DATABASE_URL z .env).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { prisma } from "@/lib/db";

let seeded = false;

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
  await ensureTasksSeeded();
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "TaskProgress", "Submission", "CodeAttempt", "AuditLog"`);
}
