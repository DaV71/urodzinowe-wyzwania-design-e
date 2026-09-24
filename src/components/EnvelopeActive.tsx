import type { BoardTask } from "@/lib/progress";
import { IconDumbbell } from "./icons";
import { SubmitForm } from "./SubmitForm";
import styles from "./EnvelopeActive.module.css";

const TZ = "Europe/Warsaw";

// "24 września o 14:05" (czas polski niezależnie od strefy serwera).
function formatSent(date: Date): string {
  const day = date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", timeZone: TZ });
  const time = date.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  return `${day} o ${time}`;
}

// Powód bez końcowej kropki — zdanie i tak kończy się "Spróbuj jeszcze raz."
const trimReason = (reason: string) => reason.trim().replace(/[.!\s]+$/, "");

// Koperta otwarta (ACTIVE) lub czekająca na Dawida (PENDING_REVIEW).
export function EnvelopeActive({ task }: { task: BoardTask }) {
  const waiting = task.status === "PENDING_REVIEW";
  const photos = task.pending?.photos ?? [];

  return (
    <article className={styles.envelope} aria-label={`Koperta ${task.id}`}>
      <div className={styles.head}>
        <span className={styles.pill}>
          Koperta {task.id} · {waiting ? "czeka na Dawida" : "otwarta"}
        </span>
        <IconDumbbell className={styles.icon} />
      </div>
      <h3 className={styles.title}>{task.title}</h3>
      <p className={styles.description}>{task.description}</p>

      {!waiting && task.lastRejectReason && (
        <p className={styles.rejected} role="note">
          Dawid odrzucił: {trimReason(task.lastRejectReason)}. Spróbuj jeszcze raz.
        </p>
      )}

      {waiting && (
        <>
          <p className={styles.waiting}>
            {task.pending ? `Zgłoszenie wysłane ${formatSent(task.pending.createdAt)}.` : "Zgłoszenie wysłane."} Świeczka
            zapali się po potwierdzeniu.
          </p>
          {photos.length > 0 && (
            <ul className={styles.thumbs} aria-label="Wysłane zdjęcia">
              {photos.map((path, i) => (
                <li key={path}>
                  <a href={`/api/uploads/${path}`} target="_blank" rel="noopener" className={styles.thumbLink}>
                    <img src={`/api/uploads/${path}`} alt={`Zdjęcie ${i + 1}`} className={styles.thumb} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Ten sam klucz w obu stanach: po wysłaniu formularz zostaje zamontowany i pokazuje potwierdzenie. */}
      <SubmitForm
        key={`form-${task.id}`}
        taskId={task.id}
        proof={task.proof ?? "PHOTO"}
        proofHint={task.proofHint ?? ""}
        askDistance={task.askDistance ?? false}
        askDuration={task.askDuration ?? false}
        maxPhotos={task.maxPhotos ?? 1}
        waiting={waiting}
      />
    </article>
  );
}
