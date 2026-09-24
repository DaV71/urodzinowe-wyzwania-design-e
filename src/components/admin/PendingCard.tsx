import { approveAction, rejectAction } from "@/app/admin/actions";
import styles from "@/app/admin/page.module.css";
import type { getPendingSubmissions } from "@/lib/progress";
import { formatDuration, formatKm } from "@/lib/text";
import { formatReference, formatWarsaw } from "./format";

export type PendingSubmission = Awaited<ReturnType<typeof getPendingSubmissions>>[number];

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

// Karta zgłoszenia do zatwierdzenia (kotwica #task-N).
export function PendingCard({ sub }: { sub: PendingSubmission }) {
  const n = sub.taskId;
  const photos = asStrings(sub.photos);
  const warnings = asStrings(sub.warnings);
  const ref = sub.reference ? formatReference(sub.reference, sub.durationS, sub.task.minImprovementS) : null;

  return (
    <article id={`task-${n}`} className={styles.pendingCard} aria-labelledby={`task-${n}-title`}>
      <div className={styles.cardHead}>
        <span className={styles.pill}>Koperta {n}</span>
        <span className={styles.meta}>
          {formatWarsaw(sub.createdAt)} · {sub.minutesAfterUnlock} min po odblokowaniu
        </span>
      </div>
      <h3 id={`task-${n}-title`} className={styles.cardTitle}>
        {sub.task.title}
      </h3>

      {(sub.distanceM != null || sub.durationS != null) && (
        <dl className={styles.metrics}>
          {sub.distanceM != null && (
            <div>
              <dt>Dystans</dt>
              <dd>{formatKm(sub.distanceM)} km</dd>
            </div>
          )}
          {sub.durationS != null && (
            <div>
              <dt>Czas</dt>
              <dd>{formatDuration(sub.durationS)}</dd>
            </div>
          )}
        </dl>
      )}

      {ref && <p className={ref.ok ? styles.refOk : styles.refBad}>{ref.text}</p>}

      {photos.length > 0 && (
        <ul className={styles.thumbs} aria-label="Zdjęcia ze zgłoszenia">
          {photos.map((path, i) => (
            <li key={path}>
              <a href={`/api/uploads/${path}`} target="_blank" rel="noopener" className={styles.thumbLink}>
                <img src={`/api/uploads/${path}`} alt={`Zdjęcie ${i + 1} z koperty ${n}`} className={styles.thumb} />
              </a>
            </li>
          ))}
        </ul>
      )}

      {sub.note && <p className={styles.note}>„{sub.note}”</p>}

      {warnings.length > 0 && (
        <ul className={styles.warnings} aria-label="Uwagi">
          {warnings.map((w) => (
            <li key={w} className={styles.warning}>
              {w}
            </li>
          ))}
        </ul>
      )}

      <form action={approveAction}>
        <input type="hidden" name="taskId" value={n} />
        <button type="submit" className={styles.primary}>
          Zatwierdź — zapal świeczkę
        </button>
      </form>

      <details className={styles.reject}>
        <summary className={styles.secondary}>Odrzuć</summary>
        <form action={rejectAction} className={styles.rejectForm}>
          <input type="hidden" name="taskId" value={n} />
          <label htmlFor={`reason-${n}`} className={styles.label}>
            Powód (zobaczy go w kopercie)
          </label>
          <textarea
            id={`reason-${n}`}
            name="reason"
            rows={2}
            maxLength={500}
            required
            placeholder="np. Na screenie nie widać dystansu"
            className={styles.textarea}
          />
          <button type="submit" className={styles.danger}>
            Odrzuć zgłoszenie
          </button>
        </form>
      </details>
    </article>
  );
}
