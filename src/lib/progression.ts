import { fromQuarters, toQuarters } from './weight';

/**
 * Double Progression.
 *
 * Regel (nach Vorgabe):
 *  - Es gibt einen Wiederholungsbereich [min, max].
 *  - Das Wiederholungsziel ist immer die Obergrenze des Bereichs, egal ob
 *    gerade gehalten oder gesteigert wird: Man zielt jedes Mal auf die
 *    Obergrenze, das tatsächliche Ergebnis entscheidet dann, ob beim nächsten
 *    Mal das Gewicht steigt.
 *  - Gesteigert wird, wenn in MEHR ALS EINEM Arbeitssatz die obere Grenze
 *    erreicht wurde. Weitere Sätze darunter (z. B. 12 / 12 / 11) sind egal.
 *  - Wie viel schwerer, entscheidest du selbst: Es gibt keinen festen
 *    Gewichtssprung. Bei "Steigern" bleibt das bisherige Arbeitsgewicht als
 *    Vorbelegung stehen, das neue Gewicht wählst du im Satz.
 *  - Die RIR-Angabe beeinflusst den Vorschlag nicht, wird aber gespeichert.
 *  - Sonst: Gewicht halten und weiter auf die Obergrenze zielen.
 *
 * Hinweis zur Evidenz: Double Progression ist eine Praxisregel und selbst
 * nicht in Studien getestet. Sie setzt progressive Überlastung um.
 */

export interface LoggedSet {
  type: 'warmup' | 'working';
  weightKg: number;
  reps: number;
  /** Wiederholungen in Reserve; 0 = Muskelversagen. null = nicht erfasst. */
  rir: number | null;
}

export interface ProgressionInput {
  sets: LoggedSet[];
  repMin: number;
  repMax: number;
}

export type ProgressionAction = 'increase' | 'hold' | 'no-data';

export interface ProgressionSuggestion {
  action: ProgressionAction;
  weightKg: number | null;
  targetReps: number | null;
  reason: string;
}

export function suggestProgression(input: ProgressionInput): ProgressionSuggestion {
  const { repMin, repMax } = input;
  if (repMin > repMax) throw new Error('repMin darf nicht größer als repMax sein');

  const working = input.sets.filter((s) => s.type === 'working');
  if (working.length === 0) {
    return {
      action: 'no-data',
      weightKg: null,
      targetReps: repMax,
      reason: `Keine Arbeitssätze vom letzten Training vorhanden. Ziel: ${repMax} Wiederholungen (Obergrenze).`,
    };
  }

  // Das Arbeitsgewicht ist das höchste Gewicht der Arbeitssätze.
  const workWeightQ = Math.max(...working.map((s) => toQuarters(s.weightKg)));
  const workWeight = fromQuarters(workWeightQ);
  const atWorkWeight = working.filter((s) => toQuarters(s.weightKg) === workWeightQ);

  const atTop = atWorkWeight.filter((s) => s.reps >= repMax);

  if (atTop.length > 1) {
    return {
      action: 'increase',
      weightKg: workWeight,
      targetReps: repMax,
      reason:
        `${atTop.length} Sätze mit ${repMax} oder mehr Wiederholungen: ` +
        `Gewicht erhöhen (du wählst das neue Gewicht). Ziel bleibt bei ` +
        `${repMax} Wiederholungen.`,
    };
  }

  let reason: string;
  if (atTop.length === 1) {
    reason =
      `Obere Grenze nur in einem Satz erreicht. Für die Steigerung sind mehr ` +
      `als ein Satz nötig. Gewicht halten, weiter auf ${repMax} Wiederholungen zielen.`;
  } else {
    reason = `Obere Grenze (${repMax}) noch nicht erreicht. Gewicht halten, ${repMax} Wiederholungen anstreben.`;
  }

  return { action: 'hold', weightKg: workWeight, targetReps: repMax, reason };
}

/** Höchstes Gewicht der Arbeitssätze (das Arbeitsgewicht des letzten Trainings); null ohne Daten. */
export function lastWorkingWeightKg(sets: LoggedSet[]): number | null {
  const working = sets.filter((s) => s.type === 'working');
  if (working.length === 0) return null;
  return Math.max(...working.map((s) => s.weightKg));
}

export function lastWorkingSetCount(sets: LoggedSet[]): number {
  return sets.filter((s) => s.type === 'working').length;
}
