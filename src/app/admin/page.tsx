// Panel admina (SPEC §9): zgłoszenia, tablica, link startowy, kody, reset, audyt, wyloguj.
import type { Metadata } from "next";
import { CodesList } from "@/components/admin/CodesList";
import { CopyButton } from "@/components/admin/CopyButton";
import { DangerZone } from "@/components/admin/DangerZone";
import { formatWarsaw, resolveMessage } from "@/components/admin/format";
import { PendingCard } from "@/components/admin/PendingCard";
import { TaskTable } from "@/components/admin/TaskTable";
import type { Prisma } from "@/generated/prisma/client";
import { isAdmin, requireAdmin } from "@/lib/auth/admin";
import { allCodes } from "@/lib/codes";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { countPending, getBoard, getPendingSubmissions } from "@/lib/progress";
import { plural } from "@/lib/text";
import { logoutAction } from "./actions";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

const TITLE = "Urodzinowe wyzwania · admin";

export async function generateMetadata(): Promise<Metadata> {
  const robots = { index: false, follow: false };
  if (!(await isAdmin())) return { title: TITLE, robots };
  const pending = await countPending();
  return { title: pending > 0 ? `(${pending}) ${TITLE}` : TITLE, robots };
}

const ACTIONS: Record<string, string> = {
  start: "start gry",
  submit: "zgłoszenie",
  approve: "zatwierdzenie",
  reject: "odrzucenie",
  undo: "cofnięcie",
  reset: "reset",
  code_ok: "dobry kod",
  code_bad: "zły kod",
  all_done: "wszystko zaliczone",
};

const ACTORS = { PLAYER: "jubilat", ADMIN: "Dawid", SYSTEM: "system" } as const;

// Krótki opis meta wpisu audytu: powód odrzucenia albo uwagi zgłoszenia.
function auditDetail(meta: Prisma.JsonValue | null): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  if (typeof meta.reason === "string") return `„${meta.reason}”`;
  const warnings = Array.isArray(meta.warnings) ? meta.warnings.filter((w) => typeof w === "string") : [];
  return warnings.length ? `uwagi: ${warnings.join("; ")}` : null;
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const env = getEnv();

  const [board, pending, audit] = await Promise.all([
    getBoard({ revealLocked: true, withHistory: true }),
    getPendingSubmissions(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const titles = new Map(board.tasks.map((t) => [t.id, t.title]));
  const codes = allCodes(env.CODES_SECRET).map((c) => ({ ...c, title: titles.get(c.taskId) }));
  const startLink = `${env.APP_URL.replace(/\/+$/, "")}/start/${env.PLAYER_TOKEN}`;

  const msgKey = one(params.msg);
  const msg = resolveMessage(msgKey, (one(params.task) ?? "").replace(/\D/g, ""));

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={styles.pill}>Panel organizatora</span>
        <h1 className={styles.title}>Urodzinowe wyzwania</h1>
        <p className={styles.lead}>
          {board.done} / {board.total} zaliczone ·{" "}
          {pending.length > 0
            ? `${pending.length} ${plural(pending.length, "zgłoszenie czeka", "zgłoszenia czekają", "zgłoszeń czeka")}`
            : "nic nie czeka"}
        </p>
      </header>

      {msg && (
        <p role={msg.error ? "alert" : "status"} className={msg.error ? styles.flashError : styles.flash}>
          {msg.text}
        </p>
      )}

      <section className={styles.section} aria-labelledby="pending-heading">
        <h2 id="pending-heading" className={styles.h2}>
          Do zatwierdzenia <span className={styles.count}>{pending.length}</span>
        </h2>
        {pending.length > 0 ? (
          <div className={styles.stack}>
            {pending.map((sub) => (
              <PendingCard key={sub.id} sub={sub} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Brak zgłoszeń. Nowe pojawią się tutaj, a liczba — w tytule karty.</p>
        )}
      </section>

      <section id="tablica" className={styles.section} aria-labelledby="board-heading">
        <h2 id="board-heading" className={styles.h2}>
          Tablica <span className={styles.count}>{board.done}/{board.total}</span>
        </h2>
        <TaskTable tasks={board.tasks} />
      </section>

      <section className={styles.section} aria-labelledby="link-heading">
        <h2 id="link-heading" className={styles.h2}>
          Link startowy
        </h2>
        <p className={styles.small}>Jubilat otwiera go raz na swoim telefonie — potem strona pamięta go 120 dni.</p>
        <CopyButton value={startLink} label="Link startowy dla jubilata" />
      </section>

      <section className={`${styles.section} ${styles.codesSection}`} aria-labelledby="codes-heading">
        <h2 id="codes-heading" className={styles.h2}>
          Kody kopert
        </h2>
        <p className={`${styles.small} ${styles.noPrint}`}>
          Kod zalicza kopertę bez zatwierdzania. Drukuj stronę (Ctrl+P / Udostępnij → Drukuj) — na kartce będzie tylko
          ta lista.
        </p>
        <CodesList codes={codes} />
      </section>

      <section id="reset" className={`${styles.section} ${styles.dangerSection}`} aria-labelledby="danger-heading">
        <h2 id="danger-heading" className={styles.h2}>
          Strefa niebezpieczna
        </h2>
        <DangerZone key={msgKey ?? "none"} />
      </section>

      <section className={styles.section} aria-labelledby="audit-heading">
        <h2 id="audit-heading" className={styles.h2}>
          Dziennik <span className={styles.count}>{audit.length}</span>
        </h2>
        {audit.length > 0 ? (
          <ol className={styles.audit}>
            {audit.map((a) => {
              const detail = auditDetail(a.meta);
              return (
                <li key={a.id} className={styles.auditRow}>
                  <time dateTime={a.createdAt.toISOString()} className={styles.auditTime}>
                    {formatWarsaw(a.createdAt)}
                  </time>
                  <span>
                    <strong>{Object.hasOwn(ACTIONS, a.action) ? ACTIONS[a.action] : a.action}</strong>
                    {a.taskId != null && ` · koperta ${a.taskId}`} · {ACTORS[a.actor]}
                    {detail && <span className={styles.auditDetail}> {detail}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className={styles.empty}>Dziennik jest pusty.</p>
        )}
      </section>

      <form action={logoutAction} className={styles.logout}>
        <button type="submit" className={styles.secondary}>
          Wyloguj
        </button>
      </form>
    </main>
  );
}
