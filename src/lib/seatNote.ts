/**
 * Sitzeinstellung / Notiz je Übung (z. B. "Sitz 4, Rückenlehne 3").
 *
 * Sie gehört zur Übung und nicht zum Plan: Sie gilt dann auch im freien Training, in Vorlagen und
 * bei Übungen, die erst im Training hinzugefügt werden. Lokal liegt sie im Zwischenspeicher, in der
 * Datenbank in fit_exercise_notes (Migration 0022).
 */

/** Notiz je Übungs-ID. */
export type SeatNotes = Record<string, string>;

/**
 * Server-Stand plus noch nicht gesendete lokale Änderungen. Lokal gewinnt; eine leere Notiz im
 * Ausgangskorb heißt "gelöscht" und entfernt den Eintrag.
 */
export function mergeSeatNotes(server: SeatNotes, pending: SeatNotes): SeatNotes {
  const out: SeatNotes = { ...server };
  for (const [exerciseId, note] of Object.entries(pending)) {
    if (note.trim() === '') delete out[exerciseId];
    else out[exerciseId] = note.trim();
  }
  return out;
}

/**
 * Notiz beim Start einer Übung: die gespeicherte Sitzeinstellung der Übung zuerst (sie wurde
 * zuletzt direkt am Gerät gepflegt), sonst die Notiz aus dem Plan. Leer = keine Notiz.
 */
export function resolveSeatNote(seat: string | undefined, plan: string | undefined): string | undefined {
  const s = seat?.trim();
  if (s) return s;
  const p = plan?.trim();
  return p ? p : undefined;
}
