// Seed 28 zadań z prisma/seed-data/tasks.json — czysty CommonJS + pg (bez klienta Prisma i TS),
// żeby działał także w obrazie produkcyjnym. Idempotentny: UPSERT wszystkich kolumn w jednej transakcji.
// DATABASE_URL dostarcza `prisma db seed` (prisma.config.ts ładuje .env) albo środowisko kontenera.
const path = require("node:path");
const { Client } = require("pg");
const tasks = require(path.join(__dirname, "seed-data", "tasks.json"));

const SQL = `
INSERT INTO "Task" ("id", "stage", "title", "description", "proof", "proofHint", "askDistance", "askDuration",
  "maxPhotos", "compareToTask", "minImprovementS", "minDistanceM", "maxDurationS")
VALUES ($1, $2, $3, $4, $5::"Proof", $6, $7, $8, $9, $10, $11, $12, $13)
ON CONFLICT ("id") DO UPDATE SET
  "stage" = EXCLUDED."stage",
  "title" = EXCLUDED."title",
  "description" = EXCLUDED."description",
  "proof" = EXCLUDED."proof",
  "proofHint" = EXCLUDED."proofHint",
  "askDistance" = EXCLUDED."askDistance",
  "askDuration" = EXCLUDED."askDuration",
  "maxPhotos" = EXCLUDED."maxPhotos",
  "compareToTask" = EXCLUDED."compareToTask",
  "minImprovementS" = EXCLUDED."minImprovementS",
  "minDistanceM" = EXCLUDED."minDistanceM",
  "maxDurationS" = EXCLUDED."maxDurationS"`;

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("Brak DATABASE_URL");
  if (!Array.isArray(tasks) || tasks.length !== 28) throw new Error(`tasks.json: oczekiwano 28 zadań, jest ${tasks.length}`);
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const t of tasks) {
      await client.query(SQL, [
        t.id, t.stage, t.title, t.description, t.proof, t.proofHint, t.askDistance, t.askDuration, t.maxPhotos,
        t.compareToTask ?? null, t.minImprovementS ?? null, t.minDistanceM ?? null, t.maxDurationS ?? null,
      ]);
    }
    await client.query("COMMIT");
    console.log("Seed: 28 zadań (upsert).");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Seed nieudany:", err);
  process.exit(1);
});
