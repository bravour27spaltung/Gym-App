/**
 * Daten zurücksetzen (zum Testen der App). Die Reihenfolge der Schritte ist wichtig:
 * Trainings und Pläne verweisen auf Übungen, eigene Übungen dürfen deshalb erst danach
 * gelöscht werden. Sätze, Trainings-Übungen, Plantage und Planübungen fallen über die
 * Fremdschlüssel (on delete cascade) mit ihrem Training bzw. Plan weg.
 *
 * Der Übungskatalog (source <> 'custom') bleibt in jedem Fall erhalten.
 */

export type ResetScope = 'training' | 'all';

export interface ResetStep {
  table: string;
  /** Nur Zeilen mit diesem Spaltenwert löschen (sonst alle Zeilen des Nutzers). */
  only?: { column: string; value: string };
}

const TRAINING: ResetStep[] = [{ table: 'fit_workouts' }, { table: 'fit_football_sessions' }];

const PLANS_AND_CUSTOM: ResetStep[] = [
  { table: 'fit_plans' },
  { table: 'fit_exercises', only: { column: 'source', value: 'custom' } },
];

export function resetSteps(scope: ResetScope): ResetStep[] {
  return scope === 'all' ? [...TRAINING, ...PLANS_AND_CUSTOM] : [...TRAINING];
}

/** Wort, das zur Bestätigung eingetippt werden muss. */
export const CONFIRM_WORD = 'LÖSCHEN';

export function isConfirmed(text: string): boolean {
  const t = text.trim().toLocaleUpperCase('de-DE');
  return t === CONFIRM_WORD || t === 'LOESCHEN';
}
