import type { HealthRecord, HealthWindowSummary } from './appleHealthImport';
import { summarizeWindow } from './appleHealthImport';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistStretchSession } from './storage';

/**
 * Bereichsübergreifender Apple-Health-Import: findet zu Training, Stretching und
 * Fußball die Einträge, denen noch Health-Werte (Kalorien, Ø Herzfrequenz, bei Fußball
 * auch Distanz) fehlen, und gleicht sie anhand ihres bekannten Zeitfensters mit einem
 * einmal geparsten Health-Export ab. Reine Logik, kein Browser-/DB-Zugriff.
 *
 * Training und Stretching haben durch die Live-Aufzeichnung ein exaktes
 * Start-/Endzeitfenster; Fußball nur, wenn beim Eintrag eine Startzeit angegeben wurde.
 */

export type HealthImportKind = 'workout' | 'stretch' | 'football';

interface ExistingValues {
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
}

export interface HealthImportCandidate {
  kind: HealthImportKind;
  id: string;
  label: string;
  fromMs: number;
  toMs: number;
  /** Bereits vorhandene Werte; ein Import überschreibt nie ein bereits gesetztes Feld. */
  existing: ExistingValues;
}

function isMissingSomething(existing: ExistingValues, includeDistance: boolean): boolean {
  return existing.calories === null || existing.avgHeartRate === null || (includeDistance && existing.distanceKm === null);
}

/** Trainings, Stretching-Sessions und Fußball-Einträge, denen noch Health-Werte fehlen. */
export function buildHealthImportCandidates(
  workouts: HistWorkout[],
  stretches: HistStretchSession[],
  footballs: HistFootballSession[],
): HealthImportCandidate[] {
  const candidates: HealthImportCandidate[] = [];

  for (const w of workouts) {
    if (!w.finishedAt) continue;
    const existing: ExistingValues = { distanceKm: null, calories: w.calories ?? null, avgHeartRate: w.avgHeartRate ?? null };
    if (!isMissingSomething(existing, false)) continue;
    candidates.push({
      kind: 'workout',
      id: w.id,
      label: w.name,
      fromMs: new Date(w.startedAt).getTime(),
      toMs: new Date(w.finishedAt).getTime(),
      existing,
    });
  }

  for (const s of stretches) {
    if (!s.finishedAt) continue;
    const existing: ExistingValues = { distanceKm: null, calories: s.calories ?? null, avgHeartRate: s.avgHeartRate ?? null };
    if (!isMissingSomething(existing, false)) continue;
    candidates.push({
      kind: 'stretch',
      id: s.id,
      label: 'Stretching',
      fromMs: new Date(s.startedAt).getTime(),
      toMs: new Date(s.finishedAt).getTime(),
      existing,
    });
  }

  for (const f of footballs) {
    if (!f.startedAt) continue; // ohne Startzeit ist kein Zeitfenster bekannt
    const existing: ExistingValues = { distanceKm: f.distanceKm, calories: f.calories, avgHeartRate: f.avgHeartRate };
    if (!isMissingSomething(existing, true)) continue;
    const fromMs = new Date(f.startedAt).getTime();
    candidates.push({
      kind: 'football',
      id: f.id,
      label: 'Fußball',
      fromMs,
      toMs: fromMs + f.minutes * 60_000,
      existing,
    });
  }

  return candidates.sort((a, b) => b.fromMs - a.fromMs);
}

export interface HealthImportPatch {
  distanceKm?: number;
  calories?: number;
  avgHeartRate?: number;
}

export interface HealthImportMatch {
  candidate: HealthImportCandidate;
  summary: HealthWindowSummary;
  /** Nur die Felder, die vorher fehlten und sich jetzt befüllen lassen. */
  patch: HealthImportPatch;
}

/**
 * Wertet für jeden Kandidaten das Zeitfenster gegen die (einmal geparsten) Health-Records
 * aus. Ein bereits vorhandener Wert wird nie überschrieben, auch wenn der Export für das
 * Fenster einen abweichenden Wert liefert.
 */
export function matchHealthImportCandidates(
  records: HealthRecord[],
  candidates: HealthImportCandidate[],
): HealthImportMatch[] {
  return candidates.map((c) => {
    const summary = summarizeWindow(records, c.fromMs, c.toMs);
    const patch: HealthImportPatch = {};
    if (c.existing.distanceKm === null && summary.distanceKm !== null) patch.distanceKm = summary.distanceKm;
    if (c.existing.calories === null && summary.calories !== null) patch.calories = summary.calories;
    if (c.existing.avgHeartRate === null && summary.avgHeartRate !== null) patch.avgHeartRate = summary.avgHeartRate;
    return { candidate: c, summary, patch };
  });
}

/** Nur Treffer, bei denen sich tatsächlich mindestens ein Feld befüllen ließ. */
export function withData(matches: HealthImportMatch[]): HealthImportMatch[] {
  return matches.filter((m) => Object.keys(m.patch).length > 0);
}
