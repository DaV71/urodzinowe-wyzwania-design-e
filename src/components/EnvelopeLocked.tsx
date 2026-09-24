import { IconLock } from "./icons";
import styles from "./EnvelopeLocked.module.css";

type EnvelopeLockedProps = {
  // Bez numeru (widok bez dostępu) etykieta nie zdradza, która to koperta.
  n?: number;
  message?: string;
};

// Tytuł zaklejonej koperty nigdy nie trafia do przeglądarki — tylko "??? ??? ???".
export function EnvelopeLocked({ n, message }: EnvelopeLockedProps) {
  return (
    <article className={styles.envelope}>
      <div className={styles.flap} aria-hidden="true" />
      <span className={styles.seal}>
        <IconLock size={16} strokeWidth={2.5} />
      </span>
      <div className={styles.text}>
        <span className={styles.label}>{n != null ? `Koperta ${n} · zaklejona` : "Koperta · zaklejona"}</span>
        <span className={styles.title}>??? ??? ???</span>
        {message && <p className={styles.message}>{message}</p>}
      </div>
    </article>
  );
}
