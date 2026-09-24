"use client";

import { useState } from "react";
import { resetAction } from "@/app/admin/actions";
import styles from "@/app/admin/page.module.css";

// Reset postępu: przycisk aktywny dopiero po wpisaniu RESET (serwer sprawdza słowo ponownie).
export function DangerZone() {
  const [word, setWord] = useState("");
  const ready = word === "RESET";

  return (
    <form action={resetAction} className={styles.dangerForm}>
      <p className={styles.small}>
        Kasuje wszystkie zgłoszenia i zaliczenia. Otwarta zostaje tylko koperta 1. Dziennik zdarzeń zostaje.
      </p>
      <label htmlFor="reset-confirm" className={styles.label}>
        Wpisz RESET, żeby potwierdzić
      </label>
      <input
        id="reset-confirm"
        name="confirm"
        value={word}
        onChange={(e) => setWord(e.currentTarget.value)}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        className={styles.input}
      />
      <button type="submit" className={styles.danger} disabled={!ready}>
        Resetuj postęp
      </button>
    </form>
  );
}
