/**
 * Muskelgruppen. Die Schlüssel entsprechen den Bezeichnungen der offenen
 * Übungsdatenbank free-exercise-db, damit der spätere Import ohne Umrechnung
 * passt. In der Datenbank stehen die Schlüssel (englisch), angezeigt werden
 * die deutschen Namen.
 */

export const MUSCLES = [
  { key: 'chest', label: 'Brust' },
  { key: 'shoulders', label: 'Schultern' },
  { key: 'triceps', label: 'Trizeps' },
  { key: 'biceps', label: 'Bizeps' },
  { key: 'forearms', label: 'Unterarme' },
  { key: 'lats', label: 'Latissimus' },
  { key: 'middle back', label: 'Oberer Rücken' },
  { key: 'traps', label: 'Trapez' },
  { key: 'lower back', label: 'Unterer Rücken' },
  { key: 'abdominals', label: 'Bauch' },
  { key: 'quadriceps', label: 'Quadrizeps' },
  { key: 'hamstrings', label: 'Beinbeuger' },
  { key: 'glutes', label: 'Gesäß' },
  { key: 'calves', label: 'Waden' },
  { key: 'adductors', label: 'Adduktoren' },
  { key: 'abductors', label: 'Abduktoren' },
  { key: 'neck', label: 'Nacken' },
] as const;

export type MuscleKey = (typeof MUSCLES)[number]['key'];

const LABELS: Record<string, string> = Object.fromEntries(MUSCLES.map((m) => [m.key, m.label]));

/** Deutscher Name; unbekannte Schlüssel bleiben unverändert sichtbar. */
export function muscleLabel(key: string): string {
  return LABELS[key] ?? key;
}

/**
 * Schaltet einen Muskel in `list` an oder aus. Ein Muskel kann nicht
 * gleichzeitig primär und sekundär sein: Wird er eingeschaltet, fliegt er
 * aus `other` raus.
 */
export function toggleMuscle(
  list: readonly string[],
  other: readonly string[],
  key: string,
): { list: string[]; other: string[] } {
  const on = list.includes(key);
  return {
    list: on ? list.filter((k) => k !== key) : [...list, key],
    other: on ? [...other] : other.filter((k) => k !== key),
  };
}
