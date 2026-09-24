import styles from "@/app/admin/page.module.css";

// Kody zadań; przy druku (@media print w page.module.css) zostaje tylko ta sekcja.
export function CodesList({ codes }: { codes: { taskId: number; code: string; title?: string }[] }) {
  return (
    <ol className={styles.codes}>
      {codes.map((c) => (
        <li key={c.taskId} className={styles.codeRow}>
          <span className={styles.codeNo}>{c.taskId}</span>
          <span className={styles.codeTitle}>{c.title}</span>
          <code className={styles.code}>{c.code}</code>
        </li>
      ))}
    </ol>
  );
}
