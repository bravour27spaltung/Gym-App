import { roundToStep } from './weight';

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

export interface WarmupOptions {
  /** Arbeitsgewicht (eingegebenes Gewicht, ohne Stangen-/Maschinengewicht). */
  workingWeightKg: number;
  /**
   * Stangen- oder Maschinengewicht. Die Prozente beziehen sich auf die
   * Gesamtlast; vorgeschlagen wird das einzugebende Gewicht ohne Eigengewicht.
   */
  equipmentKg?: number | null;
  /** Kleinste sinnvolle Stufe der Übung, Vielfaches von 0,25 kg. */
  stepKg: number;
  /**
   * 'full' für die erste schwere Grundübung der Einheit,
   * 'short' für spätere Übungen, bei denen die Muskulatur schon warm ist.
   */
  level?: 'full' | 'short';
}

const RAMPS = {
  full: [
    { pct: 0.5, reps: 8 },
    { pct: 0.7, reps: 5 },
    { pct: 0.85, reps: 3 },
  ],
  short: [{ pct: 0.6, reps: 6 }],
} as const;

/**
 * Schlägt Aufwärmsätze vor. Die Prozente sind eine verbreitete Praxis-Faustregel,
 * keine aus Studien abgeleitete Norm. Deshalb sind die Sätze nur ein Vorschlag,
 * den du im Training anpassen kannst.
 */
export function suggestWarmup(opts: WarmupOptions): WarmupSet[] {
  const { workingWeightKg, stepKg, level = 'full' } = opts;
  if (workingWeightKg <= 0) return [];
  const equipment = opts.equipmentKg ?? 0;
  const totalWork = workingWeightKg + equipment;

  const out: WarmupSet[] = [];
  for (const { pct, reps } of RAMPS[level]) {
    const w = roundToStep(totalWork * pct - equipment, stepKg);
    if (w <= 0 || w >= workingWeightKg) continue;
    if (out.length > 0 && out[out.length - 1].weightKg === w) continue;
    out.push({ weightKg: w, reps });
  }
  return out;
}
