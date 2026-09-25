import { formatKg, fromQuarters, toQuarters } from './weight';

/**
 * Double Progression.
 *
 * Regel (nach Vorgabe):
 *  - Es gibt einen Wiederholungsbereich [min, max].
 *  - Gesteigert wird, wenn in MEHR ALS EINEM Arbeitssatz die obere Grenze
 *    erreicht wurde. Weitere Sätze darunter (z. B. 12 / 12 / 11) sind egal.
 *  - Die RIR-Angabe beeinflusst den Vorschlag nicht, wird aber gespeichert.
 *  - Sonst: Gewicht halten und mehr Wiederholungen anstreben.
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
  /** Gewichtssprung in kg, Vielfaches von 0,25. */
  incrementKg: number;
}

export type ProgressionAction = 'increase' | 'hold' | 'no-data';

export interface ProgressionSuggestion {
  action: ProgressionAction;
  weightKg: number | null;
  targetReps: number | null;
  reason: string;
}

export function suggestProgression(input: ProgressionInput): ProgressionSuggestion {
  const { repMin, repMax, incrementKg } = input;
  if (repMin > repMax) throw new Error('repMin darf nicht größer als repMax sein');
  toQuarters(incrementKg); // validiert das 0,25er-Raster

  const working = input.sets.filter((s) => s.type === 'working');
  if (working.length === 0) {
    return {
      action: 'no-data',
      weightKg: null,
      targetReps: null,
      reason: 'Keine Arbeitssätze vom letzten Training vorhanden.',
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
      weightKg: workWeight + incrementKg,
      targetReps: repMin,
      reason:
        `${atTop.length} Sätze mit ${repMax} oder mehr Wiederholungen: ` +
        `Gewicht um ${formatKg(incrementKg)} erhöhen und wieder bei ` +
        `${repMin} Wiederholungen beginnen.`,
    };
  }

  const best = Math.max(...atWorkWeight.map((s) => s.reps));
  const target = Math.min(best + 1, repMax);

  let reason: string;
  if (atTop.length === 1) {
    reason =
      `Obere Grenze nur in einem Satz erreicht. Für die Steigerung sind mehr ` +
      `als ein Satz nötig. Gewicht halten.`;
  } else {
    reason = `Obere Grenze (${repMax}) noch nicht erreicht. Gewicht halten, ${target} Wiederholungen anstreben.`;
  }

  return { action: 'hold', weightKg: workWeight, targetReps: target, reason };
}
