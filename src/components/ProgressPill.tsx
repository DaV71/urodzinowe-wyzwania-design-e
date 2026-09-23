import styles from "./ProgressPill.module.css";

export function ProgressPill({ done, total }: { done: number; total: number }) {
  return (
    <p className={styles.pill}>
      Zapalone: {done} / {total}
    </p>
  );
}
