import { formatWarsaw } from "@/components/admin/format";
import type { SubmissionView } from "@/lib/progress";
import { IconCheck } from "./icons";
import { SubmissionPreview } from "./SubmissionPreview";
import styles from "./EnvelopeDone.module.css";

type Props = {
  n: number;
  title: string;
  completedAt?: Date | null;
  /** "CODE" = zaliczona kodem od Dawida. */
  source?: string | null;
  approved?: SubmissionView | null;
};

// Zaliczona koperta; po rozwinięciu pokazuje, co zostało wysłane i kiedy ją zaliczono.
export function EnvelopeDone({ n, title, completedAt, source, approved }: Props) {
  const how = source === "CODE" ? "kodem od Dawida" : "przez Dawida";
  return (
    <details className={styles.envelope}>
      <summary className={styles.summary}>
        <span className={styles.badge}>
          <IconCheck size={20} />
        </span>
        <span className={styles.text}>
          <span className={styles.label}>Koperta {n} · zaliczona</span>
          <span className={styles.title}>{title}</span>
        </span>
        <span className={styles.toggle} aria-hidden="true" />
        <span className={styles.srOnly}>Pokaż szczegóły</span>
      </summary>
      <div className={styles.details}>
        <p className={styles.when}>
          Zaliczona {how}
          {completedAt ? ` · ${formatWarsaw(completedAt)}` : ""}
        </p>
        {approved ? (
          <SubmissionPreview submission={approved} />
        ) : (
          <p className={styles.when}>Bez zgłoszenia — wystarczył kod.</p>
        )}
      </div>
    </details>
  );
}
