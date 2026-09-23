"use client";

import { useActionState } from "react";
import { loginAdmin, type LoginState } from "./actions";
import styles from "./login.module.css";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAdmin, initialState);

  return (
    <form action={formAction} className={styles.form}>
      <label htmlFor="password" className={styles.label}>
        Hasło
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        autoFocus
        className={styles.input}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "password-error" : undefined}
      />
      {state.error && (
        <p id="password-error" role="alert" className={styles.error}>
          {state.error}
        </p>
      )}
      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "SPRAWDZAM…" : "WEJDŹ DO PANELU"}
      </button>
    </form>
  );
}
