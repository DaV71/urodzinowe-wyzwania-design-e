import { undoAction } from "@/app/admin/actions";
import styles from "@/app/admin/page.module.css";
import type { BoardTask } from "@/lib/progress";
import { TASK_COUNT } from "@/lib/tasks";
import { formatDuration, formatKm } from "@/lib/text";
import { SubmissionPreview } from "@/components/SubmissionPreview";
import { formatWarsaw, sourceLabel, statusLabel } from "./format";

const STATUS_CLASS = {
  LOCKED: styles.statusLocked,
  ACTIVE: styles.statusActive,
  PENDING_REVIEW: styles.statusPending,
  DONE: styles.statusDone,
} as const;

function result(task: BoardTask): string | null {
  const parts = [
    task.resultDistanceM != null ? `${formatKm(task.resultDistanceM)} km` : null,
    task.resultSeconds != null ? formatDuration(task.resultSeconds) : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : null;
}

// Tablica 28 zadań + cofnięcie ostatniego zaliczenia (dwustopniowo, bez window.confirm).
export function TaskTable({ tasks }: { tasks: BoardTask[] }) {
  const lastDone = tasks.filter((t) => t.status === "DONE").at(-1);

  return (
    <>
      <ol className={styles.taskList}>
        {tasks.map((t) => {
          const res = result(t);
          return (
            <li key={t.id} className={styles.taskRow} data-status={t.status}>
              <span className={styles.taskNo}>{t.id}</span>
              <div className={styles.taskBody}>
                <span className={styles.taskTitle}>
                  {t.status === "PENDING_REVIEW" ? <a href={`#task-${t.id}`}>{t.title}</a> : t.title}
                </span>
                {t.status === "DONE" && (
                  <span className={styles.taskMeta}>
                    {sourceLabel(t.source)}
                    {res && ` · ${res}`}
                    {t.completedAt && ` · ${formatWarsaw(t.completedAt)}`}
                  </span>
                )}
                {t.history && t.history.length > 0 && (
                  <details className={styles.history}>
                    <summary className={styles.historySummary}>
                      Zobacz {t.history.length === 1 ? "zgłoszenie" : `zgłoszenia (${t.history.length})`}
                    </summary>
                    <ol className={styles.historyList}>
                      {t.history.map((s) => (
                        <li key={s.id} className={styles.historyItem}>
                          <SubmissionPreview submission={s} admin />
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
              <span className={`${styles.status} ${STATUS_CLASS[t.status]}`}>{statusLabel(t.status)}</span>
            </li>
          );
        })}
      </ol>

      {lastDone ? (
        <details className={styles.undo}>
          <summary className={styles.secondary}>Cofnij ostatnie zaliczenie</summary>
          <form action={undoAction} className={styles.undoForm}>
            <input type="hidden" name="taskId" value={lastDone.id} />
            <p className={styles.small}>
              Koperta {lastDone.id} („{lastDone.title}”) wróci do otwartych
              {lastDone.id < TASK_COUNT ? `, a koperta ${lastDone.id + 1} znowu się zamknie.` : "."}
            </p>
            <button type="submit" className={styles.danger}>
              Na pewno — cofnij kopertę {lastDone.id}
            </button>
          </form>
        </details>
      ) : (
        <p className={styles.small}>Nic jeszcze nie zaliczono — nie ma czego cofać.</p>
      )}
    </>
  );
}
