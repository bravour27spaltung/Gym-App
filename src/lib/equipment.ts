/**
 * Gerätearten. Die Schlüssel entsprechen den Bezeichnungen der offenen
 * Übungsdatenbank free-exercise-db. Das ist eine Eigenschaft der Übung
 * (womit sie ausgeführt wird), kein Gewicht.
 */
export const EQUIPMENT = [
  { key: 'barbell', label: 'Langhantel' },
  { key: 'dumbbell', label: 'Kurzhantel' },
  { key: 'cable', label: 'Kabelzug' },
  { key: 'machine', label: 'Maschine' },
  { key: 'body only', label: 'Körpergewicht' },
  { key: 'kettlebells', label: 'Kettlebell' },
  { key: 'e-z curl bar', label: 'SZ-Stange' },
  { key: 'bands', label: 'Widerstandsband' },
  { key: 'medicine ball', label: 'Medizinball' },
  { key: 'exercise ball', label: 'Gymnastikball' },
  { key: 'foam roll', label: 'Faszienrolle' },
  { key: 'other', label: 'Sonstiges' },
] as const;

const LABELS: Record<string, string> = Object.fromEntries(EQUIPMENT.map((e) => [e.key, e.label]));

/** Deutscher Name; unbekannte Schlüssel bleiben unverändert sichtbar. */
export function equipmentLabel(key: string): string {
  return LABELS[key] ?? key;
}
