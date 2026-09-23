import { plural } from "@/lib/text";
import styles from "./Cake.module.css";

type CakeProps = { done: number; total: number; age: number };

// Tort-progres: `total` świeczek w jednym rzędzie; świeczka i płonie, gdy i < done.
export function Cake({ done, total, age }: CakeProps) {
  const label = `Tort na ${age}. urodziny: zapalone ${done} z ${total} ${plural(total, "świeczki", "świeczek", "świeczek")}`;
  return (
    <div className={styles.cake} role="img" aria-label={label}>
      <div className={styles.candles}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < done ? `${styles.candle} ${styles.lit}` : styles.candle}>
            <span className={styles.flameSlot}>
              <span className={styles.flame} />
            </span>
            <span className={styles.wick} />
            <span className={styles.body} />
          </span>
        ))}
      </div>
      <div className={styles.layerTop} />
      <div className={styles.layerMiddle}>{age}</div>
      <div className={styles.layerBottom} />
      <div className={styles.base} />
    </div>
  );
}
