import { plural } from "@/lib/text";
import styles from "./Hero.module.css";

export function Hero({ name, total }: { name: string; total: number }) {
  return (
    <div className={styles.hero}>
      <h1 className={styles.title}>
        Sto lat, <span className={styles.name}>{name}</span>!<br />
        Zanim zdmuchniesz…
      </h1>
      <p className={styles.lead}>
        Masz {total} {plural(total, "kopertę", "koperty", "kopert")} z zadaniami. Każda otwiera się dopiero po
        zaliczeniu poprzedniej. Gdy tort będzie gotowy, rozpakujesz prezent.
      </p>
    </div>
  );
}
