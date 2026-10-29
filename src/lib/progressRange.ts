/**
 * Zeitraum-Auswahl und prozentuale Veränderung für die Verlaufs-Ansichten (1RM, Last, ...).
 *
 * Der Zeitraum schneidet die Einheiten erst zu, nachdem die Reihe komplett aufgebaut ist. So kann
 * die Veränderung gegen den Stand direkt VOR dem Zeitraum rechnen: In der Wochenansicht heißt das
 * "diese Woche gegenüber der letzten Einheit davor" und nicht "erste gegen letzte Einheit der
 * Woche" (das wäre bei ein bis zwei Einheiten pro Woche meist leer oder irreführend).
 */

export type ProgressRange = 'week' | 'month' | 'year' | 'all';

export const PROGRESS_RANGES: { key: ProgressRange; label: string; days: number | null }[] = [
  { key: 'week', label: 'Woche', days: 7 },
  { key: 'month', label: 'Monat', days: 30 },
  { key: 'year', label: 'Jahr', days: 365 },
  { key: 'all', label: 'Gesamt', days: null },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Beginn des Zeitraums in ms (Date.now()-Zeit); null = kein Zuschnitt ("Gesamt"). */
export function rangeStart(range: ProgressRange, now: number): number | null {
  const days = PROGRESS_RANGES.find((r) => r.key === range)?.days ?? null;
  return days === null ? null : now - days * DAY_MS;
}

export interface SeriesPoint {
  at: number;
  value: number;
}

/** Veränderung von `from` nach `to` in Prozent; null, wenn der Ausgangswert nicht größer als 0 ist. */
export function pctChange(from: number, to: number): number | null {
  if (!(from > 0) || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

/** Ergänzt je Punkt die prozentuale Veränderung zur Einheit davor (der erste Punkt hat keine). */
export function withPctToPrevious<T extends SeriesPoint>(points: T[]): (T & { pctPrev: number | null })[] {
  const sorted = [...points].sort((a, b) => a.at - b.at);
  return sorted.map((p, i) => ({ ...p, pctPrev: i === 0 ? null : pctChange(sorted[i - 1].value, p.value) }));
}

export interface RangeChange<T extends SeriesPoint> {
  /** Ausgangspunkt der Veränderung (zeigt das Datum "seit ..."). */
  base: T;
  last: T;
  abs: number;
  pct: number | null;
}

/**
 * Veränderung im Zeitraum: letzter Wert im Zeitraum gegenüber dem letzten Wert vor dem Zeitraum.
 * Gibt es davor keinen (z. B. bei "Gesamt"), zählt der erste Wert im Zeitraum. Liegt nur ein Wert vor,
 * gibt es keine Veränderung (null).
 */
export function rangeChange<T extends SeriesPoint>(full: T[], start: number | null): RangeChange<T> | null {
  const sorted = [...full].sort((a, b) => a.at - b.at);
  const inRange = start === null ? sorted : sorted.filter((p) => p.at >= start);
  const last = inRange[inRange.length - 1];
  if (!last) return null;
  const before = start === null ? undefined : [...sorted].reverse().find((p) => p.at < start);
  const base = before ?? inRange[0];
  if (base === last) return null;
  return { base, last, abs: last.value - base.value, pct: pctChange(base.value, last.value) };
}
