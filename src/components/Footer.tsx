import styles from "./Footer.module.css";

export function Footer({ from }: { from: string }) {
  return <footer className={styles.footer}>Z miłością i lekkim sadyzmem — {from}</footer>;
}
