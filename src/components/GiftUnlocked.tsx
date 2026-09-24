import { IconGift } from "./icons";
import styles from "./GiftUnlocked.module.css";

// Bez przycisku "Od nowa" — reset tylko w panelu admina (SPEC D4).
export function GiftUnlocked({ title, description }: { title: string; description: string }) {
  return (
    <section className={styles.gift} aria-label="Prezent główny">
      <IconGift className={styles.icon} />
      <div className={styles.text}>
        <span className={styles.label}>Tort gotowy · prezent rozpakowany</span>
        <span className={styles.title}>{title}</span>
        <span className={styles.description}>{description}</span>
      </div>
    </section>
  );
}
