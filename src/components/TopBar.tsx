import styles from "./TopBar.module.css";

export function TopBar({ dateLabel }: { dateLabel: string }) {
  return (
    <div className={styles.bar}>
      <span>{dateLabel}</span>
      <span className={styles.tagline}>Tort trzeba wybiegać</span>
    </div>
  );
}
