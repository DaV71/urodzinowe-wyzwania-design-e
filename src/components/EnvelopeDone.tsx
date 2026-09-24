import { IconCheck } from "./icons";
import styles from "./EnvelopeDone.module.css";

export function EnvelopeDone({ n, title }: { n: number; title: string }) {
  return (
    <article className={styles.envelope}>
      <span className={styles.badge}>
        <IconCheck size={20} />
      </span>
      <div className={styles.text}>
        <span className={styles.label}>Koperta {n} · zaliczona</span>
        <span className={styles.title}>{title}</span>
      </div>
    </article>
  );
}
