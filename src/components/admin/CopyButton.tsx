"use client";

import { useState } from "react";
import styles from "@/app/admin/page.module.css";

// Pole z linkiem + kopiowanie do schowka (fallback: zaznaczenie tekstu do ręcznego skopiowania).
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");

  async function copy(input: HTMLInputElement | null) {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      input?.select();
      setState("manual");
    }
  }

  return (
    <div className={styles.copy}>
      <input
        id="start-link"
        readOnly
        value={value}
        aria-label={label}
        className={styles.input}
        onFocus={(e) => e.currentTarget.select()}
      />
      <button
        type="button"
        className={styles.secondary}
        onClick={(e) => copy(e.currentTarget.parentElement?.querySelector("input") ?? null)}
      >
        {state === "copied" ? "Skopiowano" : "Kopiuj"}
      </button>
      <span role="status" className={styles.small}>
        {state === "manual" ? "Schowek niedostępny — link zaznaczony, skopiuj ręcznie." : ""}
      </span>
    </div>
  );
}
