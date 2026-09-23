import styles from "./StageHeader.module.css";

export function StageHeader({ index, name }: { index: number; name: string }) {
  return (
    <h2 className={styles.stage}>
      Etap {index} · {name}
    </h2>
  );
}
