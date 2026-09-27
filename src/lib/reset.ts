/**
 * Testdaten zurücksetzen: löscht nur Trainings, Sätze, Verlauf und Fußball-Einträge.
 * Pläne, Vorlagen und eigene Übungen bleiben immer erhalten, damit beim Testen nicht
 * versehentlich die eigentliche Planung verloren geht. Der Übungskatalog
 * (source <> 'custom') bleibt ohnehin unberührt.
 */

export interface ResetStep {
  table: string;
  /** Nur Zeilen mit diesem Spaltenwert löschen (sonst alle Zeilen des Nutzers). */
  only?: { column: string; value: string };
}

export function resetSteps(): ResetStep[] {
  return [{ table: 'fit_workouts' }, { table: 'fit_football_sessions' }];
}

/** Wort, das zur Bestätigung eingetippt werden muss. */
export const CONFIRM_WORD = 'LÖSCHEN';

export function isConfirmed(text: string): boolean {
  const t = text.trim().toLocaleUpperCase('de-DE');
  return t === CONFIRM_WORD || t === 'LOESCHEN';
}
