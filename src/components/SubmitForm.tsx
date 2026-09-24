"use client";

import { startTransition, useActionState, useState, type ChangeEvent, type FormEvent } from "react";
import { submitTaskAction, type SubmitState } from "@/app/actions";
import { plural } from "@/lib/text";
import styles from "./SubmitForm.module.css";

type Proof = "PHOTO" | "PHOTO_OPTIONAL" | "NONE";

type SubmitFormProps = {
  taskId: number;
  proof: Proof;
  proofHint: string;
  askDistance: boolean;
  askDuration: boolean;
  maxPhotos: number;
  // Zgłoszenie czeka na Dawida: zostaje tylko potwierdzenie świeżej wysyłki.
  waiting?: boolean;
};

function message(error: string, maxPhotos: number): string {
  switch (error) {
    case "photo_required":
      return "Dołącz zdjęcie — to dowód dla Dawida.";
    case "too_many_photos":
      return `Maksymalnie ${maxPhotos} ${plural(maxPhotos, "zdjęcie", "zdjęcia", "zdjęć")}.`;
    case "bad_code":
      return "Zły kod. Spróbuj jeszcze raz.";
    case "rate_limited":
      return "Za dużo prób. Odczekaj 10 minut.";
    case "type":
    case "size":
      return "Zdjęcie: tylko JPG/PNG/WEBP/HEIC do 10 MB.";
    case "bad_duration":
      return "Czas w formacie mm:ss.";
    case "bad_distance":
      return "Dystans w kilometrach, np. 2,10.";
    case "not_active":
      return "Ta koperta nie czeka już na zgłoszenie. Odśwież stronę.";
    case "forbidden":
      return "Brak dostępu. Otwórz stronę z linku startowego.";
    default:
      return "Coś poszło nie tak. Spróbuj jeszcze raz.";
  }
}

export function SubmitForm({ taskId, proof, proofHint, askDistance, askDuration, maxPhotos, waiting }: SubmitFormProps) {
  const [state, formAction, pending] = useActionState<SubmitState, FormData>(submitTaskAction, null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  // Po revalidatePath koperta przechodzi w "czeka na Dawida"; ten sam komponent (ten sam klucz)
  // zachowuje stan akcji, więc potwierdzenie jest widoczne tylko tuż po wysłaniu.
  if (waiting) {
    return state && "ok" in state ? (
      <p role="status" className={styles.success}>
        Wysłane! Dawid dostał znać.
      </p>
    ) : null;
  }

  const withPhotos = proof !== "NONE";
  const error = localError ?? (state && "error" in state ? message(state.error, maxPhotos) : null);
  const errorId = `submit-error-${taskId}`;

  function onFiles(e: ChangeEvent<HTMLInputElement>) {
    setFileNames(Array.from(e.currentTarget.files ?? [], (f) => f.name));
    setLocalError(null);
  }

  // Wysyłka przez onSubmit (bez `action`): React nie czyści formularza, więc po błędzie pola zostają.
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const code = String(data.get("code") ?? "").trim();
    if (code === "" && fileNames.length > maxPhotos) {
      setLocalError(message("too_many_photos", maxPhotos));
      return;
    }
    setLocalError(null);
    startTransition(() => formAction(data));
  }

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate>
      <input type="hidden" name="taskId" value={taskId} />

      {withPhotos && (
        <>
          <p className={styles.hint}>{proofHint}</p>

          {(askDistance || askDuration) && (
            <div className={styles.row}>
              {askDistance && (
                <label className={styles.field}>
                  <span className={styles.label}>Dystans (km)</span>
                  <input
                    name="distanceKm"
                    inputMode="decimal"
                    placeholder="2,10"
                    autoComplete="off"
                    className={styles.input}
                  />
                </label>
              )}
              {askDuration && (
                <label className={styles.field}>
                  <span className={styles.label}>Czas (mm:ss)</span>
                  <input
                    name="duration"
                    inputMode="numeric"
                    placeholder="12:40"
                    autoComplete="off"
                    className={styles.input}
                  />
                </label>
              )}
            </div>
          )}

          <label className={styles.photos}>
            <input
              type="file"
              name="photos"
              accept="image/*"
              multiple={maxPhotos > 1}
              onChange={onFiles}
              className={styles.fileInput}
            />
            <span aria-hidden="true">+</span>
            {maxPhotos > 1 ? `Dodaj zdjęcia (do ${maxPhotos})` : "Dodaj zdjęcie"}
            {proof === "PHOTO_OPTIONAL" && <span className={styles.optional}>· opcjonalnie</span>}
          </label>
          {fileNames.length > 0 && (
            <ul className={styles.files} aria-label="Wybrane zdjęcia">
              {fileNames.map((name, i) => (
                <li key={`${i}-${name}`}>{name}</li>
              ))}
            </ul>
          )}

          <textarea
            name="note"
            rows={2}
            maxLength={2000}
            placeholder="Notatka dla Dawida (opcjonalnie)"
            aria-label="Notatka dla Dawida"
            className={styles.textarea}
          />
        </>
      )}

      <details className={styles.code}>
        <summary className={styles.summary}>Mam kod od Dawida</summary>
        <input
          name="code"
          placeholder="XXXX-XXXX"
          aria-label="Kod od Dawida"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={12}
          className={`${styles.input} ${styles.codeInput}`}
        />
      </details>

      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}

      <button type="submit" className={styles.button} disabled={pending}>
        {pending ? "Wysyłam…" : "Zrobione — zapal świeczkę"}
      </button>
    </form>
  );
}
