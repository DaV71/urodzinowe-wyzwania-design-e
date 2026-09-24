import { formatWarsaw } from "@/components/admin/format";
import type { SubmissionView } from "@/lib/progress";
import { formatDuration, formatKm } from "@/lib/text";
import styles from "./SubmissionPreview.module.css";

const STATUS_LABEL: Record<SubmissionView["status"], string> = {
  PENDING: "czeka",
  APPROVED: "zatwierdzone",
  REJECTED: "odrzucone",
};

type Props = {
  submission: SubmissionView;
  /** Admin widzi dodatkowo status, powód odrzucenia i ostrzeżenia. */
  admin?: boolean;
};

// Podgląd jednego zgłoszenia: kiedy, dystans/czas, zdjęcia (klik = pełny rozmiar), notatka.
export function SubmissionPreview({ submission: s, admin = false }: Props) {
  const facts = [
    s.distanceM != null ? `${formatKm(s.distanceM)} km` : null,
    s.durationS != null ? formatDuration(s.durationS) : null,
  ].filter((x): x is string => x !== null);

  return (
    <div className={styles.preview} data-status={s.status}>
      <p className={styles.meta}>
        {admin && <span className={styles.status}>{STATUS_LABEL[s.status]}</span>}
        <span>Wysłane {formatWarsaw(s.createdAt)}</span>
        {facts.length > 0 && <span className={styles.facts}>{facts.join(" · ")}</span>}
      </p>

      {s.photos.length > 0 ? (
        <ul className={styles.photos}>
          {s.photos.map((path, i) => (
            <li key={path}>
              <a href={`/api/uploads/${path}`} target="_blank" rel="noopener" className={styles.photoLink}>
                <img src={`/api/uploads/${path}`} alt={`Zdjęcie ${i + 1}`} className={styles.photo} loading="lazy" />
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.muted}>Bez zdjęcia.</p>
      )}

      {s.note && <p className={styles.note}>„{s.note}”</p>}

      {admin && s.status === "REJECTED" && s.reviewNote && (
        <p className={styles.reject}>Powód odrzucenia: {s.reviewNote}</p>
      )}
      {admin && s.warnings.length > 0 && (
        <ul className={styles.warnings}>
          {s.warnings.map((w) => (
            <li key={w} className={styles.warning}>
              {w}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
