/**
 * Gewichte werden intern als ganze Viertelkilo gerechnet (1 Einheit = 0,25 kg).
 * So gibt es keine Gleitkomma-Fehler, und die Eingabe bleibt auf die Stufen
 * 0 / 0,25 / 0,5 / 0,75 kg hinter dem Komma beschränkt.
 */

export const FRACTIONS = [0, 0.25, 0.5, 0.75] as const;
export type Fraction = (typeof FRACTIONS)[number];

const QUARTER = 0.25;

/** kg -> Viertelkilo (ganzzahlig). Wirft bei Werten, die kein Vielfaches von 0,25 sind. */
export function toQuarters(kg: number): number {
  const q = kg / QUARTER;
  const rounded = Math.round(q);
  if (Math.abs(q - rounded) > 1e-9) {
    throw new Error(`Gewicht ${kg} kg ist kein Vielfaches von 0,25 kg`);
  }
  return rounded;
}

export function fromQuarters(q: number): number {
  return q * QUARTER;
}

/** Ganze Kilo (Einzelschritte) + Bruchteil aus {0, 0,25, 0,5, 0,75}. */
export function composeWeight(wholeKg: number, fraction: Fraction): number {
  if (!Number.isInteger(wholeKg) || wholeKg < 0) {
    throw new Error('Ganze Kilo müssen eine nicht-negative ganze Zahl sein');
  }
  return wholeKg + fraction;
}

export function splitWeight(kg: number): { wholeKg: number; fraction: Fraction } {
  const q = toQuarters(kg);
  const wholeKg = Math.floor(q / 4);
  const fraction = ((q % 4) * QUARTER) as Fraction;
  return { wholeKg, fraction };
}

/** Rundet auf das nächste Vielfache von `step` (in kg, selbst Vielfaches von 0,25). */
export function roundToStep(kg: number, step: number): number {
  const stepQ = toQuarters(step);
  if (stepQ <= 0) throw new Error('Schrittweite muss größer als 0 sein');
  const q = kg / QUARTER;
  return fromQuarters(Math.round(q / stepQ) * stepQ);
}

/**
 * Gesamtlast = eingegebenes Gewicht (Scheiben/Stapel) + optionales Eigengewicht
 * von Stange oder Maschine.
 */
export function totalLoad(weightKg: number, equipmentKg: number | null | undefined): number {
  return weightKg + (equipmentKg ?? 0);
}

/** Deutsche Darstellung, z. B. 62,5 kg oder 60 kg. */
export function formatKg(kg: number): string {
  const text = Number.isInteger(kg)
    ? String(kg)
    : String(kg).replace('.', ',');
  return `${text} kg`;
}
