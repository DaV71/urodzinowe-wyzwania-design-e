import { plural } from "@/lib/text";
import { splitCandles } from "./cakeLayout";
import styles from "./Cake.module.css";

type CakeProps = { done: number; total: number; age: number };

// Tort-progres: świeczki na trzech poziomach (wierzch + półki niższych warstw); świeczka i płonie, gdy i < done.
export function Cake({ done, total, age }: CakeProps) {
  const label = `Tort na ${age}. urodziny: zapalone ${done} z ${total} ${plural(total, "świeczki", "świeczek", "świeczek")}`;
  const slots = splitCandles(total);

  const candles = (indices: number[]) =>
    indices.map((i) => (
      <span key={i} className={i < done ? `${styles.candle} ${styles.lit}` : styles.candle}>
        <span className={styles.flameSlot}>
          <span className={styles.flame} />
        </span>
        <span className={styles.wick} />
        <span className={styles.body} />
      </span>
    ));

  return (
    <div className={styles.frame} role="img" aria-label={label}>
    <div className={styles.cake}>
      <div className={styles.candlesTop}>{candles(slots.top)}</div>

      <div className={`${styles.level} ${styles.levelTop}`}>
        <div className={`${styles.ledge} ${styles.ledgeLeft}`}>{candles(slots.middle.left)}</div>
        <div className={styles.layerTop} />
        <div className={`${styles.ledge} ${styles.ledgeRight}`}>{candles(slots.middle.right)}</div>
      </div>

      <div className={`${styles.level} ${styles.levelMiddle}`}>
        <div className={`${styles.ledge} ${styles.ledgeLeft}`}>{candles(slots.bottom.left)}</div>
        <div className={styles.layerMiddle}>{age}</div>
        <div className={`${styles.ledge} ${styles.ledgeRight}`}>{candles(slots.bottom.right)}</div>
      </div>

      <div className={styles.layerBottom} />
      <div className={styles.plate} />
    </div>
    </div>
  );
}
