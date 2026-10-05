import type { HealthRecord, HealthWindowSummary } from './appleHealthImport';
import { summarizeWindow } from './appleHealthImport';
import { sleepNightForDate } from './sleep';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistRecoveryEntry, HistStretchSession } from './storage';

/**
 * Bereichsübergreifender Apple-Health-Import: findet zu Training, Stretching, Fußball
 * und Recovery die Einträge, denen noch Health-Werte fehlen (Kalorien/Ø Herzfrequenz;
 * bei Fußball zusätzlich Distanz; bei Recovery HRV/Ruhepuls/Schlafdauer), und gleicht
 * sie anhand ihres bekannten Zeitfensters mit einem einmal geparsten Health-Export ab.
 * Reine Logik, kein Browser-/DB-Zugriff.
 *
 * Training und Stretching haben durch die Live-Aufzeichnung ein exaktes
 * Start-/Endzeitfenster; Fußball nur, wenn beim Eintrag eine Startzeit angegeben wurde.
 * Recovery hat kein Sessionfenster, sondern einen Tag (siehe recoveryWindowForDate).
 */

export type HealthImportKind = 'workout' | 'stretch' | 'football' | 'recovery';

interface ExistingValues {
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  /** Nur bei Recovery-Kandidaten gesetzt (siehe buildHealthImportCandidates). */
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepHours?: number | null;
  deepSleepMin?: number | null;
  remSleepMin?: number | null;
}

/**
 * Tagesfenster für Recovery-Werte: vom Vorabend (18 Uhr lokal) bis zum späten Vormittag
 * des Tages (12 Uhr lokal). Deckt damit sowohl den nächtlichen Schlaf als auch eine
 * morgendliche HRV-/Ruhepuls-Messung der Uhr ab, ohne ein exaktes "Aufwachfenster" zu
 * kennen (das Health nicht meldet). Bewusst grosszügig statt exakt, siehe
 * summarizeWindow.
 */
export function recoveryWindowForDate(dateIso: string): { fromMs: number; toMs: number } {
  const dayStartMs = new Date(`${dateIso}T00:00:00`).getTime();
  return { fromMs: dayStartMs - 6 * 3_600_000, toMs: dayStartMs + 12 * 3_600_000 };
}

export interface HealthImportCandidate {
  kind: HealthImportKind;
  id: string;
  label: string;
  fromMs: number;
  toMs: number;
  /** Nur bei Recovery: Tag des Eintrags (Aufwachdatum), für die Nacht-Zuordnung. */
  date?: string;
  /** Bereits vorhandene Werte; ein Import überschreibt nie ein bereits gesetztes Feld. */
  existing: ExistingValues;
}

function isMissingSomething(existing: ExistingValues, includeDistance: boolean): boolean {
  return existing.calories === null || existing.avgHeartRate === null || (includeDistance && existing.distanceKm === null);
}

/**
 * Trainings, Stretching-Sessions, Fußball- und Recovery-Einträge, denen noch
 * Health-Werte fehlen. `recoveries` ist optional (Default: keine), damit bestehende
 * Aufrufstellen ohne Recovery-Bereich unverändert funktionieren.
 */
export function buildHealthImportCandidates(
  workouts: HistWorkout[],
  stretches: HistStretchSession[],
  footballs: HistFootballSession[],
  recoveries: HistRecoveryEntry[] = [],
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

  for (const r of recoveries) {
    // Schlafwerte aus der früheren Fenster-Methode (Import ohne gespeicherte Schlafzeit) sind
    // unzuverlässig: sie konnten den Teil vor Mitternacht verlieren oder die Vornacht
    // mitzählen. Sie gelten daher als fehlend und werden bei einem erneuten Import durch den
    // Nachtwert ersetzt. Manuell eingetragene Schlafzeiten bleiben unangetastet.
    const legacySleep = r.sleepHours !== null && (r.sleepStart ?? null) === null && r.source === 'apple_health';
    const existing: ExistingValues = {
      distanceKm: null,
      calories: null,
      avgHeartRate: null,
      hrvMs: r.hrvMs,
      restingHr: r.restingHr,
      sleepHours: legacySleep ? null : r.sleepHours,
      deepSleepMin: r.deepSleepMin ?? null,
      remSleepMin: r.remSleepMin ?? null,
    };
    if (existing.hrvMs !== null && existing.restingHr !== null && existing.sleepHours !== null) continue;
    const { fromMs, toMs } = recoveryWindowForDate(r.date);
    candidates.push({ kind: 'recovery', id: r.id, label: 'Recovery', fromMs, toMs, date: r.date, existing });
  }

  return candidates.sort((a, b) => b.fromMs - a.fromMs);
}

export interface HealthImportPatch {
  distanceKm?: number;
  calories?: number;
  avgHeartRate?: number;
  hrvMs?: number;
  restingHr?: number;
  sleepHours?: number;
  /** Beginn und Ende der Nacht (ISO), die zu `sleepHours` gehört. */
  sleepStart?: string;
  sleepEnd?: string;
  /** Minuten in Tief- bzw. REM-Schlaf der Nacht. */
  deepSleepMin?: number;
  remSleepMin?: number;
}

export interface HealthImportMatch {
  candidate: HealthImportCandidate;
  summary: HealthWindowSummary;
  /** Nur die Felder, die vorher fehlten und sich jetzt befüllen lassen. */
  patch: HealthImportPatch;
}

export interface RecoveryDaySummary {
  hrvMs: number | null;
  restingHr: number | null;
  sleepHours: number | null;
  sleepStartMs: number | null;
  sleepEndMs: number | null;
  deepSleepMin: number | null;
  remSleepMin: number | null;
}

/** Wie lange nach dem Aufwachen noch Messwerte zur Nacht zählen (Morgenmessung der Uhr). */
const POST_WAKE_MS = 60 * 60_000;

/**
 * Health-Werte für einen Recovery-Tag (= Aufwachdatum):
 *  - Schlaf: die Hauptnacht, die an diesem Tag endet (siehe sleep.ts), also inklusive des
 *    Teils vor Mitternacht.
 *  - HRV: Mittelwert der Messungen innerhalb der Nacht (bis 1 h nach dem Aufwachen). Nächtliche
 *    Werte sind weniger störanfällig als Tagesmessungen (Bewegung, Stress, Koffein). Gibt es
 *    keine Nacht, greift das großzügige Tagesfenster (recoveryWindowForDate).
 *  - Ruhepuls: Mittelwert im Tagesfenster; die Uhr legt dafür einen Tageswert ab.
 */
export function summarizeRecoveryDay(records: HealthRecord[], dateIso: string): RecoveryDaySummary {
  const { fromMs, toMs } = recoveryWindowForDate(dateIso);
  const windowSummary = summarizeWindow(records, fromMs, toMs);
  const night = sleepNightForDate(
    records
      .filter((r) => r.type === 'HKCategoryTypeIdentifierSleepAnalysis' && r.endMs !== undefined)
      .map((r) => ({ startMs: r.startMs, endMs: r.endMs as number, isWatch: r.isWatch, stage: r.stage })),
    dateIso,
  );
  const nocturnalHrv = night ? summarizeWindow(records, night.startMs, night.endMs + POST_WAKE_MS).hrvMs : null;
  return {
    hrvMs: nocturnalHrv ?? windowSummary.hrvMs,
    restingHr: windowSummary.restingHr,
    sleepHours: night?.hours ?? null,
    sleepStartMs: night?.startMs ?? null,
    sleepEndMs: night?.endMs ?? null,
    deepSleepMin: night?.deepMin ?? null,
    remSleepMin: night?.remMin ?? null,
  };
}

function matchRecovery(records: HealthRecord[], c: HealthImportCandidate): HealthImportMatch {
  const day = summarizeRecoveryDay(records, c.date as string);
  const summary: HealthWindowSummary = {
    distanceKm: null,
    calories: null,
    avgHeartRate: null,
    hrvMs: day.hrvMs,
    restingHr: day.restingHr,
    sleepHours: day.sleepHours,
  };
  const patch: HealthImportPatch = {};
  if (c.existing.hrvMs === null && day.hrvMs !== null) patch.hrvMs = day.hrvMs;
  if (c.existing.restingHr === null && day.restingHr !== null) patch.restingHr = day.restingHr;
  if (c.existing.sleepHours === null && day.sleepHours !== null && day.sleepStartMs !== null && day.sleepEndMs !== null) {
    patch.sleepHours = day.sleepHours;
    patch.sleepStart = new Date(day.sleepStartMs).toISOString();
    patch.sleepEnd = new Date(day.sleepEndMs).toISOString();
  }
  if ((c.existing.deepSleepMin ?? null) === null && day.deepSleepMin !== null) patch.deepSleepMin = day.deepSleepMin;
  if ((c.existing.remSleepMin ?? null) === null && day.remSleepMin !== null) patch.remSleepMin = day.remSleepMin;
  return { candidate: c, summary, patch };
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
    if (c.kind === 'recovery' && c.date) return matchRecovery(records, c);
    const summary = summarizeWindow(records, c.fromMs, c.toMs);
    const patch: HealthImportPatch = {};
    if (c.existing.distanceKm === null && summary.distanceKm !== null) patch.distanceKm = summary.distanceKm;
    if (c.existing.calories === null && summary.calories !== null) patch.calories = summary.calories;
    if (c.existing.avgHeartRate === null && summary.avgHeartRate !== null) patch.avgHeartRate = summary.avgHeartRate;
    // HRV/Ruhepuls/Schlaf gibt es nur bei Recovery-Kandidaten (existing dort nie
    // undefined, siehe buildHealthImportCandidates); bei anderen Arten bleibt
    // existing.hrvMs etc. undefined, die strikte null-Prüfung greift dort also nie.
    if (c.existing.hrvMs === null && summary.hrvMs !== null) patch.hrvMs = summary.hrvMs;
    if (c.existing.restingHr === null && summary.restingHr !== null) patch.restingHr = summary.restingHr;
    if (c.existing.sleepHours === null && summary.sleepHours !== null) patch.sleepHours = summary.sleepHours;
    return { candidate: c, summary, patch };
  });
}

/** Nur Treffer, bei denen sich tatsächlich mindestens ein Feld befüllen ließ. */
export function withData(matches: HealthImportMatch[]): HealthImportMatch[] {
  return matches.filter((m) => Object.keys(m.patch).length > 0);
}
