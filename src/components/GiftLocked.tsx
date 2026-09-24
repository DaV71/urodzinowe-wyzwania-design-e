import { plural } from "@/lib/text";
import { IconLock } from "./icons";
import styles from "./GiftLocked.module.css";

export function GiftLocked({ left }: { left: number }) {
  return (
    <section className={styles.gift} aria-label="Prezent główny">
      <div className={styles.ribbonV} aria-hidden="true" />
      <div className={styles.ribbonH} aria-hidden="true" />
      <span className={styles.lock}>
        <IconLock className={styles.lockIcon} />
      </span>
      <div className={styles.text}>
        <span className={styles.label}>Prezent główny</span>
        <span className={styles.count}>
          Jeszcze {left} {plural(left, "koperta", "koperty", "kopert")}
        </span>
        <span className={styles.note}>Wstążka puści, gdy tort będzie gotowy.</span>
      </div>
    </section>
  );
}
