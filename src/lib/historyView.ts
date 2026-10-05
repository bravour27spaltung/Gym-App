import { exercisePoints, workoutTotals, type ExerciseMeta, type HistWorkout } from './stats';

/** Einheiten eines Kalendermonats mit Summen für den Monatskopf. */
export interface MonthGroup {
  /** "2026-10" (lokale Zeit), nur als stabiler Schlüssel. */
  key: string;
  /** "Oktober 2026" */
  label: string;
  workouts: HistWorkout[];
  sessions: number;
  workingSets: number;
  volumeKg: number;
}

const monthKey = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Gruppiert nach Monat des Trainingsbeginns; Monate und Einheiten darin neueste zuerst. */
export function groupWorkoutsByMonth(workouts: HistWorkout[]): MonthGroup[] {
  const groups = new Map<string, MonthGroup>();
  const sorted = [...workouts].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  for (const w of sorted) {
    const d = new Date(w.startedAt);
    const key = monthKey(d);
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }),
        workouts: [],
        sessions: 0,
        workingSets: 0,
        volumeKg: 0,
      };
      groups.set(key, g);
    }
    const t = workoutTotals(w);
    g.workouts.push(w);
    g.sessions += 1;
    g.workingSets += t.workingSets;
    g.volumeKg += t.volumeKg;
  }
  return [...groups.values()];
}

/** Zeile der Übungsliste. */
export interface ExerciseRow {
  id: string;
  name: string;
  sessions: number;
  lastAt: number;
  /** Hauptmuskel, unter dem die Übung gruppiert wird ('' = ohne Muskelangabe). */
  muscle: string;
  /** Kennzahl je Einheit, älteste zuerst, höchstens `TREND_POINTS` Werte. */
  trend: number[];
  /** Einheit der Kennzahl: geschätztes 1RM / höchste Last in kg, sonst Wiederholungen. */
  unit: 'kg' | 'reps';
  last: number | null;
  /** Letzter Wert minus vorletzter Wert, null bei nur einem Wert. */
  delta: number | null;
}

export const TREND_POINTS = 8;

/** Eine Zeile je Übung mit mindestens einem Arbeitssatz, neueste zuerst. */
export function exerciseRows(workouts: HistWorkout[], meta: Record<string, ExerciseMeta | undefined>): ExerciseRow[] {
  const ids = new Set<string>();
  for (const w of workouts) for (const ex of w.exercises) ids.add(ex.exerciseId);
  const rows: ExerciseRow[] = [];
  for (const id of ids) {
    const pts = exercisePoints(workouts, id);
    if (pts.length === 0) continue;
    const useRm = pts.some((p) => p.best1RM !== null);
    const useLoad = !useRm && pts.some((p) => p.topLoadKg > 0);
    const unit: 'kg' | 'reps' = useRm || useLoad ? 'kg' : 'reps';
    const values = pts.map((p) => (useRm ? p.best1RM : useLoad ? p.topLoadKg : p.reps)).filter((v): v is number => v !== null && v > 0);
    const trend = values.slice(-TREND_POINTS);
    const m = meta[id];
    rows.push({
      id,
      name: m?.name ?? 'Übung',
      sessions: pts.length,
      lastAt: pts[pts.length - 1].at,
      muscle: m?.primary[0] ?? '',
      trend,
      unit,
      last: trend.length > 0 ? trend[trend.length - 1] : null,
      delta: trend.length > 1 ? trend[trend.length - 1] - trend[trend.length - 2] : null,
    });
  }
  return rows.sort((a, b) => b.lastAt - a.lastAt);
}

/** Filtert nach Namensteil (ohne Beachtung von Groß-/Kleinschreibung); leere Eingabe lässt alles durch. */
export function filterExerciseRows(rows: ExerciseRow[], query: string): ExerciseRow[] {
  const q = query.trim().toLocaleLowerCase('de-DE');
  return q === '' ? rows : rows.filter((r) => r.name.toLocaleLowerCase('de-DE').includes(q));
}

export interface ExerciseGroup {
  /** Muskelschlüssel, '' für Übungen ohne Hauptmuskel. */
  muscle: string;
  rows: ExerciseRow[];
}

/**
 * Gruppiert nach Hauptmuskel. Gruppen alphabetisch nach Anzeigename (`labelOf`), die Gruppe ohne
 * Muskel zuletzt; innerhalb einer Gruppe bleibt die Reihenfolge (zuletzt trainiert zuerst).
 */
export function groupExercisesByMuscle(rows: ExerciseRow[], labelOf: (muscle: string) => string): ExerciseGroup[] {
  const map = new Map<string, ExerciseRow[]>();
  for (const r of rows) map.set(r.muscle, [...(map.get(r.muscle) ?? []), r]);
  return [...map.entries()]
    .map(([muscle, list]) => ({ muscle, rows: list }))
    .sort((a, b) => {
      if (a.muscle === '' || b.muscle === '') return a.muscle === '' ? 1 : -1;
      return labelOf(a.muscle).localeCompare(labelOf(b.muscle), 'de');
    });
}
