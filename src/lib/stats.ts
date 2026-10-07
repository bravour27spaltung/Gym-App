import { suggestProgression, type LoggedSet } from './progression';
import { totalLoad } from './weight';
import type { Draft, Feedback, WorkoutPayload } from './workout';

/**
 * Auswertungen aus abgeschlossenen Trainings. Reine Logik ohne Browser- oder Datenbankzugriff.
 *
 * Was gemessen und was geschätzt ist:
 *  - Gemessen: Sätze, Wiederholungen, Gewicht, Volumen (Gesamtlast x Wiederholungen).
 *  - Geschätzt: das 1RM (Formel nach Epley). Schätzformeln sind am genauesten bei wenigen
 *    Wiederholungen; die Abweichung wächst mit der Wiederholungszahl. Deshalb wird über
 *    ONE_RM_MAX_REPS Wiederholungen gar nicht geschätzt.
 *  - Satzzahl pro Muskel: Hauptmuskel zählt 1, Hilfsmuskel 0,5 je Arbeitssatz. Das ist eine
 *    verbreitete Zählweise, keine belegte Norm.
 */

export interface HistSet {
  type: 'warmup' | 'working';
  weightKg: number;
  reps: number;
  /** Zeit-Satz (z. B. Plank): gehaltene Sekunden; dann ist reps = 0. */
  durationSeconds?: number | null;
}

export interface HistExercise {
  exerciseId: string;
  /** Stangen-/Maschinengewicht dieser Übung im Training. */
  equipmentKg: number | null;
  sets: HistSet[];
}

export interface HistWorkout {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  exercises: HistExercise[];
  /** Wie lief's? Freiwillig beim Speichern beantwortet; null = keine Angabe. */
  feedback?: Feedback | null;
  /** Nachträglich per Apple-Health-Import befüllt; sonst nicht gesetzt/null. */
  calories?: number | null;
  avgHeartRate?: number | null;
}

/** Über dieser Wiederholungszahl wird das 1RM nicht mehr geschätzt (zu ungenau). */
export const ONE_RM_MAX_REPS = 12;

/**
 * Richtwert für harte Sätze je Muskel und Woche (Hypertrophie): Meta-Analyse mit
 * Dosis-Wirkungs-Zusammenhang, Schoenfeld, Ogborn & Krieger 2017, J Sports Sci 35(11).
 * Evidenz: mittel (Auswertung von Studien mit vielen Einzelstudien, aber sehr kurzen Laufzeiten
 * und mit abnehmendem Zusatznutzen bei höherem Volumen).
 */
export const WEEKLY_SETS_REFERENCE = { min: 10, max: 20 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Einzelne Sätze und Übungen

/** Geschätztes 1RM nach Epley; null, wenn Gewicht 0 ist oder zu viele Wiederholungen. */
export function estimate1RM(loadKg: number, reps: number): number | null {
  if (!(loadKg > 0) || !Number.isInteger(reps) || reps < 1 || reps > ONE_RM_MAX_REPS) return null;
  if (reps === 1) return loadKg;
  return Math.round(loadKg * (1 + reps / 30) * 10) / 10;
}

export interface TopSet {
  weightKg: number;
  loadKg: number;
  reps: number;
  oneRm: number | null;
}

export interface ExerciseStats {
  workingSets: number;
  reps: number;
  /** Summe aus Gesamtlast x Wiederholungen aller Arbeitssätze. */
  volumeKg: number;
  /** Höchste Gesamtlast eines Arbeitssatzes. */
  topLoadKg: number;
  /** Bestes geschätztes 1RM aller Arbeitssätze; null, wenn keins schätzbar ist. */
  best1RM: number | null;
  /** Der "beste" Satz: höchstes 1RM, sonst höchste Last, sonst meiste Wiederholungen. */
  topSet: TopSet | null;
}

export function exerciseStats(ex: HistExercise): ExerciseStats {
  const working = ex.sets.filter((s) => s.type === 'working');
  let volumeKg = 0;
  let reps = 0;
  let top: TopSet | null = null;
  let topLoadKg = 0;
  let best1RM: number | null = null;

  const better = (a: TopSet, b: TopSet): boolean => {
    if (a.oneRm !== null && b.oneRm !== null) return a.oneRm > b.oneRm;
    if (a.oneRm !== null || b.oneRm !== null) return a.oneRm !== null;
    if (a.loadKg !== b.loadKg) return a.loadKg > b.loadKg;
    return a.reps > b.reps;
  };

  for (const s of working) {
    const loadKg = totalLoad(s.weightKg, ex.equipmentKg);
    volumeKg += loadKg * s.reps;
    reps += s.reps;
    topLoadKg = Math.max(topLoadKg, loadKg);
    const oneRm = estimate1RM(loadKg, s.reps);
    if (oneRm !== null) best1RM = Math.max(best1RM ?? 0, oneRm);
    const cand: TopSet = { weightKg: s.weightKg, loadKg, reps: s.reps, oneRm };
    if (top === null || better(cand, top)) top = cand;
  }
  return { workingSets: working.length, reps, volumeKg: Math.round(volumeKg * 100) / 100, topLoadKg, best1RM, topSet: top };
}

// ---------------------------------------------------------------------------
// Ganze Trainings

export interface WorkoutTotals {
  exercises: number;
  workingSets: number;
  reps: number;
  volumeKg: number;
  durationMin: number | null;
}

export function durationMinutes(w: HistWorkout): number | null {
  if (!w.finishedAt) return null;
  const ms = new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? Math.max(1, Math.round(ms / 60000)) : null;
}

export function workoutTotals(w: HistWorkout): WorkoutTotals {
  let workingSets = 0;
  let reps = 0;
  let volumeKg = 0;
  let exercises = 0;
  for (const ex of w.exercises) {
    const st = exerciseStats(ex);
    if (st.workingSets > 0) exercises += 1;
    workingSets += st.workingSets;
    reps += st.reps;
    volumeKg += st.volumeKg;
  }
  return { exercises, workingSets, reps, volumeKg: Math.round(volumeKg), durationMin: durationMinutes(w) };
}

/** Neueste zuerst. */
export function sortNewestFirst(list: HistWorkout[]): HistWorkout[] {
  return [...list].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

// ---------------------------------------------------------------------------
// Historie einer einzelnen Satz-Position

export interface SetHistoryEntry {
  /** Trainingsbeginn (ISO), zur Anzeige des Datums. */
  at: string;
  reps: number;
  weightKg: number;
  /** Zeit-Satz: gehaltene Sekunden; dann ist reps = 0. */
  durationSeconds?: number | null;
}

/**
 * Bisherige Werte für genau diese Satz-Position (z. B. der 2. Arbeitssatz) derselben
 * Übung, aus abgeschlossenen Trainings; neueste zuerst. `indexInType` ist 1-basiert und
 * zählt nur Sätze desselben Typs (Aufwärmen bzw. Arbeitssatz). Trainings, die an dieser
 * Position keinen Satz dieses Typs haben (z. B. weniger Sätze gemacht), werden
 * übersprungen, nicht als Lücke gezählt.
 */
export function setSlotHistory(
  workouts: HistWorkout[],
  exerciseId: string,
  type: 'warmup' | 'working',
  indexInType: number,
  limit = 5,
): SetHistoryEntry[] {
  const out: SetHistoryEntry[] = [];
  for (const w of sortNewestFirst(workouts)) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const set = ex.sets.filter((s) => s.type === type)[indexInType - 1];
    if (!set) continue;
    out.push({
      at: w.startedAt,
      reps: set.reps,
      weightKg: set.weightKg,
      ...(set.durationSeconds != null ? { durationSeconds: set.durationSeconds } : {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verlauf einer Übung im Training (kompakte Liste der letzten Trainings)

export interface ExerciseSession {
  workoutId: string;
  /** Trainingsbeginn (ISO). */
  at: string;
  /** Arbeitssätze dieses Trainings in Reihenfolge. */
  sets: HistSet[];
  /** Höchstes Gewicht der Arbeitssätze (ohne Stange/Maschine). */
  topWeightKg: number;
  /** Änderung des höchsten Gewichts gegenüber dem Training davor; null beim ältesten bekannten. */
  deltaKg: number | null;
}

/**
 * Die letzten Trainings, in denen die Übung mit mindestens einem Arbeitssatz vorkam,
 * neueste zuerst. Das Delta bezieht sich auf das jeweils vorherige Training (auch dann,
 * wenn dieses wegen `limit` nicht mehr in der Liste steht).
 */
export function exerciseSessions(workouts: HistWorkout[], exerciseId: string, limit = 5): ExerciseSession[] {
  const all: Omit<ExerciseSession, 'deltaKg'>[] = [];
  for (const w of sortNewestFirst(workouts)) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const sets = ex.sets.filter((s) => s.type === 'working');
    if (sets.length === 0) continue;
    all.push({ workoutId: w.id, at: w.startedAt, sets, topWeightKg: Math.max(...sets.map((s) => s.weightKg)) });
  }
  return all.slice(0, limit).map((s, i) => {
    const prev = all[i + 1];
    return { ...s, deltaKg: prev ? Math.round((s.topWeightKg - prev.topWeightKg) * 100) / 100 : null };
  });
}

// ---------------------------------------------------------------------------
// Verlauf einer Übung

export interface ExercisePoint {
  workoutId: string;
  /** Zeitpunkt des Trainings (ms). */
  at: number;
  name: string;
  volumeKg: number;
  topLoadKg: number;
  best1RM: number | null;
  topSet: TopSet | null;
  workingSets: number;
  /** Wiederholungen aller Arbeitssätze. */
  reps: number;
}

/** Ein Punkt je Training, in dem die Übung mit mindestens einem Arbeitssatz vorkommt; älteste zuerst. */
export function exercisePoints(workouts: HistWorkout[], exerciseId: string): ExercisePoint[] {
  const points: ExercisePoint[] = [];
  for (const w of workouts) {
    const ex = w.exercises.find((e) => e.exerciseId === exerciseId);
    if (!ex) continue;
    const st = exerciseStats(ex);
    if (st.workingSets === 0) continue;
    points.push({
      workoutId: w.id,
      at: new Date(w.startedAt).getTime(),
      name: w.name,
      volumeKg: st.volumeKg,
      topLoadKg: st.topLoadKg,
      best1RM: st.best1RM,
      topSet: st.topSet,
      workingSets: st.workingSets,
      reps: st.reps,
    });
  }
  return points.sort((a, b) => a.at - b.at);
}

/**
 * Geschätztes 1RM (Epley, nur bis ONE_RM_MAX_REPS Wiederholungen) je Training der letzten
 * `weeks` Wochen, älteste zuerst. Gibt es in diesem Zeitraum weniger als zwei Werte, werden
 * stattdessen die letzten `fallback` Werte genommen, damit auch bei seltenem Training ein
 * Verlauf sichtbar ist.
 */
export function recentOneRmSeries(
  workouts: HistWorkout[],
  exerciseId: string,
  now: number,
  weeks = 8,
  fallback = 6,
): ExercisePoint[] {
  const all = exercisePoints(workouts, exerciseId).filter((p) => p.best1RM !== null);
  const inWindow = all.filter((p) => p.at >= now - weeks * 7 * DAY_MS);
  return inWindow.length >= 2 ? inWindow : all.slice(-fallback);
}

// ---------------------------------------------------------------------------
// Kraftverlauf pro Körperpartie

export interface MusclePoint {
  workoutId: string;
  at: number;
  /** Übung, deren Satz an diesem Tag für diesen Muskel maßgeblich war (bester Wert). */
  exerciseId: string;
  topLoadKg: number;
  best1RM: number | null;
  topSet: TopSet | null;
}

/**
 * Ein Punkt je Training, in dem der Muskel als Hauptmuskel einer ausgeführten Übung
 * vorkommt (Hilfsmuskel-Übungen zählen hier nicht, sonst wäre der Verlauf kaum
 * vergleichbar). Maßgeblich ist die Übung mit der höchsten Gesamtlast an diesem Tag;
 * ältestes zuerst. Ein grober Näherungswert, kein direkt gemessener "Muskelkraft"-Wert:
 * verschiedene Übungen für denselben Muskel sind nicht 1:1 vergleichbar.
 */
export function musclePoints(
  workouts: HistWorkout[],
  muscle: string,
  muscleOf: (exerciseId: string) => MuscleInfo,
): MusclePoint[] {
  const points: MusclePoint[] = [];
  for (const w of workouts) {
    let best: (TopSet & { exerciseId: string }) | null = null;
    for (const ex of w.exercises) {
      if (!muscleOf(ex.exerciseId).primary.includes(muscle)) continue;
      const st = exerciseStats(ex);
      if (st.workingSets === 0 || !st.topSet) continue;
      if (best === null || st.topSet.loadKg > best.loadKg) best = { ...st.topSet, exerciseId: ex.exerciseId };
    }
    if (best) {
      points.push({
        workoutId: w.id,
        at: new Date(w.startedAt).getTime(),
        exerciseId: best.exerciseId,
        topLoadKg: best.loadKg,
        best1RM: best.oneRm,
        topSet: best,
      });
    }
  }
  return points.sort((a, b) => a.at - b.at);
}

/** Alle Muskeln, die in den Trainings mindestens einmal als Hauptmuskel vorkamen. */
export function trainedMuscles(workouts: HistWorkout[], muscleOf: (exerciseId: string) => MuscleInfo): string[] {
  const set = new Set<string>();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      if (exerciseStats(ex).workingSets === 0) continue;
      for (const m of muscleOf(ex.exerciseId).primary) set.add(m);
    }
  }
  return [...set];
}

// ---------------------------------------------------------------------------
// Bestwerte

export interface RecordHit {
  exerciseId: string;
  kind: 'load' | 'e1rm';
  value: number;
  previous: number;
}

/**
 * Bestwerte dieses Trainings gegenüber allen früheren. Ohne frühere Einheit mit der Übung
 * gibt es keinen "Bestwert" (alles wäre einer). Gewicht = höchste Gesamtlast eines
 * Arbeitssatzes; 1RM = bestes geschätztes 1RM.
 */
export function findRecords(current: HistWorkout, before: HistWorkout[]): RecordHit[] {
  const hits: RecordHit[] = [];
  for (const ex of current.exercises) {
    const cur = exerciseStats(ex);
    if (cur.workingSets === 0) continue;
    const prior = before
      .filter((w) => w.id !== current.id)
      .flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.exerciseId))
      .map(exerciseStats)
      .filter((s) => s.workingSets > 0);
    if (prior.length === 0) continue;
    const prevLoad = Math.max(...prior.map((s) => s.topLoadKg));
    const prevRm = Math.max(0, ...prior.map((s) => s.best1RM ?? 0));
    if (prevLoad > 0 && cur.topLoadKg > prevLoad) {
      hits.push({ exerciseId: ex.exerciseId, kind: 'load', value: cur.topLoadKg, previous: prevLoad });
    }
    if (cur.best1RM !== null && prevRm > 0 && cur.best1RM > prevRm + 0.05) {
      hits.push({ exerciseId: ex.exerciseId, kind: 'e1rm', value: cur.best1RM, previous: prevRm });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Zeitfenster, Muskelvolumen

export interface WindowTotals {
  sessions: number;
  workingSets: number;
  volumeKg: number;
}

/** Summen der Trainings mit from <= Beginn < to. */
export function windowTotals(workouts: HistWorkout[], from: Date, to: Date): WindowTotals {
  let sessions = 0;
  let workingSets = 0;
  let volumeKg = 0;
  for (const w of workouts) {
    const t = new Date(w.startedAt).getTime();
    if (t < from.getTime() || t >= to.getTime()) continue;
    const tot = workoutTotals(w);
    if (tot.workingSets === 0) continue;
    sessions += 1;
    workingSets += tot.workingSets;
    volumeKg += tot.volumeKg;
  }
  return { sessions, workingSets, volumeKg };
}

export interface MuscleInfo {
  primary: string[];
  secondary: string[];
}

export interface MuscleSets {
  muscle: string;
  sets: number;
}

/**
 * Arbeitssätze je Muskel im Zeitfenster. Hauptmuskeln zählen 1 je Satz, Hilfsmuskeln 0,5.
 * Absteigend nach Sätzen sortiert.
 */
export function muscleSets(
  workouts: HistWorkout[],
  from: Date,
  to: Date,
  muscleOf: (exerciseId: string) => MuscleInfo,
): MuscleSets[] {
  const acc = new Map<string, number>();
  for (const w of workouts) {
    const t = new Date(w.startedAt).getTime();
    if (t < from.getTime() || t >= to.getTime()) continue;
    for (const ex of w.exercises) {
      const n = ex.sets.filter((s) => s.type === 'working').length;
      if (n === 0) continue;
      const info = muscleOf(ex.exerciseId);
      for (const m of info.primary) acc.set(m, (acc.get(m) ?? 0) + n);
      for (const m of info.secondary) {
        if (!info.primary.includes(m)) acc.set(m, (acc.get(m) ?? 0) + n * 0.5);
      }
    }
  }
  return [...acc.entries()]
    .map(([muscle, sets]) => ({ muscle, sets }))
    .sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
}

export interface WeakSpot {
  muscle: string;
  /** Sätze dieses Muskels in den letzten 7 Tagen. */
  sets: number;
}

/**
 * Der Muskel mit den wenigsten Sätzen der letzten 7 Tage, sofern er schon einmal
 * trainiert wurde und unter dem Richtwert (WEEKLY_SETS_REFERENCE.min) liegt; sonst null.
 * Für einen kurzen Hinweis beim Trainingsstart, kein Ersatz für die volle Übersicht.
 */
export function weakestMuscle(
  workouts: HistWorkout[],
  now: Date,
  muscleOf: (exerciseId: string) => MuscleInfo,
): WeakSpot | null {
  const trained = trainedMuscles(workouts, muscleOf);
  if (trained.length === 0) return null;
  const win = lastDays(now, 7);
  const week = new Map(muscleSets(workouts, win.from, win.to, muscleOf).map((m) => [m.muscle, m.sets]));
  const under = trained
    .map((m) => ({ muscle: m, sets: week.get(m) ?? 0 }))
    .filter((m) => m.sets < WEEKLY_SETS_REFERENCE.min)
    .sort((a, b) => a.sets - b.sets);
  return under[0] ?? null;
}

/** Die letzten `days` Tage bis einschließlich `end` (Ende ist exklusiv um eine Millisekunde erweitert). */
export function lastDays(end: Date, days: number): { from: Date; to: Date } {
  const to = new Date(end.getTime() + 1);
  return { from: new Date(end.getTime() + 1 - days * DAY_MS), to };
}

// ---------------------------------------------------------------------------
// Umwandlungen

/** Wandelt einen noch nicht gesendeten Trainings-Datensatz in einen Verlaufseintrag um. */
export function payloadToHist(p: WorkoutPayload): HistWorkout {
  const byWe = new Map<string, HistSet[]>();
  for (const s of [...p.sets].sort((a, b) => a.set_number - b.set_number)) {
    const list = byWe.get(s.workout_exercise_id) ?? [];
    list.push({
      type: s.type,
      weightKg: Number(s.weight_kg),
      reps: s.reps,
      ...(s.duration_seconds != null ? { durationSeconds: s.duration_seconds } : {}),
    });
    byWe.set(s.workout_exercise_id, list);
  }
  return {
    id: p.workout.id,
    name: p.workout.name,
    startedAt: p.workout.started_at,
    finishedAt: p.workout.finished_at,
    feedback: p.workout.feedback,
    exercises: [...p.workoutExercises]
      .sort((a, b) => a.position - b.position)
      .map((we) => ({
        exerciseId: we.exercise_id,
        equipmentKg: we.equipment_kg === null ? null : Number(we.equipment_kg),
        sets: byWe.get(we.id) ?? [],
      })),
  };
}

/** Das gerade beendete Training aus dem Entwurf; nur abgehakte Sätze zählen. */
export function draftToHist(draft: Draft, finishedAt: Date): HistWorkout {
  return {
    id: draft.id,
    name: draft.name,
    startedAt: draft.startedAt,
    finishedAt: finishedAt.toISOString(),
    feedback: draft.feedback ?? null,
    exercises: draft.exercises
      .map((e) => ({
        exerciseId: e.exerciseId,
        equipmentKg: e.equipmentKg,
        sets: e.sets
          .filter((s) => s.done)
          .map((s) => ({
            type: s.type,
            weightKg: s.weightKg,
            reps: s.durationSeconds != null ? 0 : s.reps,
            ...(s.durationSeconds != null ? { durationSeconds: s.durationSeconds } : {}),
          })),
      }))
      .filter((e) => e.sets.length > 0),
  };
}

/** Datenbank-Stand plus noch nicht gesendete Trainings, ohne Doppelte, neueste zuerst. */
export function mergeHistory(db: HistWorkout[], pending: WorkoutPayload[]): HistWorkout[] {
  const byId = new Map<string, HistWorkout>();
  for (const w of db) byId.set(w.id, w);
  for (const p of pending) byId.set(p.workout.id, payloadToHist(p));
  return sortNewestFirst([...byId.values()]);
}

// ---------------------------------------------------------------------------
// Auswertung nach dem Training

export interface SummaryContext {
  nameOf: (exerciseId: string) => string;
  muscleOf: (exerciseId: string) => MuscleInfo;
  /** Wiederholungsbereich der Übung aus dem Plan; null, wenn unbekannt. */
  rangeOf: (exerciseId: string) => { repMin: number; repMax: number } | null;
}

/** Double-Progression-Vorschlag (increase/hold) aus geloggten Sätzen und Wiederholungsbereich. */
export function nextAction(
  sets: HistSet[],
  range: { repMin: number; repMax: number } | null,
): 'increase' | 'hold' | null {
  if (!range || range.repMin > range.repMax) return null;
  const logged: LoggedSet[] = sets.map((s) => ({
    type: s.type,
    weightKg: s.weightKg,
    reps: s.reps,
    durationSeconds: s.durationSeconds ?? null,
    rir: null,
  }));
  const sug = suggestProgression({ sets: logged, repMin: range.repMin, repMax: range.repMax });
  return sug.action === 'increase' ? 'increase' : sug.action === 'hold' ? 'hold' : null;
}

export interface ExerciseSummary {
  exerciseId: string;
  name: string;
  workingSets: number;
  reps: number;
  volumeKg: number;
  topSet: TopSet | null;
  /** Letzte frühere Einheit mit dieser Übung; null bei der ersten. */
  previous: { at: string; volumeKg: number; topSet: TopSet | null } | null;
  /** Veränderung des Volumens gegenüber der letzten Einheit in Prozent; null ohne Vergleich. */
  volumeDeltaPct: number | null;
  records: RecordHit[];
  /** Empfehlung für das nächste Mal (Double Progression); null ohne Wiederholungsbereich. */
  next: 'increase' | 'hold' | null;
}

export interface MuscleLine {
  muscle: string;
  /** Arbeitssätze in diesem Training. */
  workout: number;
  /** Arbeitssätze in den letzten 7 Tagen einschließlich dieses Trainings. */
  week: number;
}

export interface WorkoutSummary {
  workout: HistWorkout;
  totals: WorkoutTotals;
  exercises: ExerciseSummary[];
  records: RecordHit[];
  muscles: MuscleLine[];
  /** Das auffälligste Ergebnis dieses Trainings in einem Satz; null ohne Vergleichswert. */
  highlight: string | null;
  /** Die klarste Möglichkeit fürs nächste Training in einem Satz; null ohne Wiederholungsbereich. */
  focus: string | null;
}

function fmtKgShort(kg: number): string {
  return `${String(kg).replace('.', ',')} kg`;
}

/** Bestwert mit der größten relativen Verbesserung, sonst die größte Volumensteigerung. */
function pickHighlight(
  records: RecordHit[],
  exercises: ExerciseSummary[],
  nameOf: (exerciseId: string) => string,
): string | null {
  if (records.length > 0) {
    const rel = (r: RecordHit) => (r.previous > 0 ? (r.value - r.previous) / r.previous : 0);
    const best = records.reduce((b, r) => (rel(r) > rel(b) ? r : b));
    const kind = best.kind === 'load' ? 'Höchste Last' : 'Geschätztes 1RM';
    return `${nameOf(best.exerciseId)}: neuer Bestwert – ${kind} ${fmtKgShort(best.value)} (vorher ${fmtKgShort(best.previous)}).`;
  }
  const improved = exercises
    .filter((e) => e.volumeDeltaPct !== null && e.volumeDeltaPct > 0)
    .sort((a, b) => (b.volumeDeltaPct ?? 0) - (a.volumeDeltaPct ?? 0))[0];
  return improved ? `${improved.name}: Volumen +${improved.volumeDeltaPct} % zum letzten Mal.` : null;
}

/** Die Übung mit der klarsten Steigerungschance; sonst die mit dem geringsten Fortschritt beim Halten. */
function pickFocus(exercises: ExerciseSummary[]): string | null {
  const canIncrease = [...exercises].filter((e) => e.next === 'increase').sort((a, b) => b.volumeKg - a.volumeKg)[0];
  if (canIncrease) return `${canIncrease.name}: nächstes Mal das Gewicht steigern.`;
  const stuck = [...exercises]
    .filter((e) => e.next === 'hold')
    .sort((a, b) => (a.volumeDeltaPct ?? 0) - (b.volumeDeltaPct ?? 0))[0];
  return stuck ? `${stuck.name}: Gewicht halten, eine Wiederholung mehr anstreben.` : null;
}

export function summarizeWorkout(
  current: HistWorkout,
  before: HistWorkout[],
  ctx: SummaryContext,
): WorkoutSummary {
  const others = sortNewestFirst(before.filter((w) => w.id !== current.id));
  const records = findRecords(current, others);

  const exercises: ExerciseSummary[] = current.exercises
    .map((ex) => ({ ex, st: exerciseStats(ex) }))
    .filter(({ st }) => st.workingSets > 0)
    .map(({ ex, st }) => {
      const prevW = others.find((w) => w.exercises.some((e) => e.exerciseId === ex.exerciseId && exerciseStats(e).workingSets > 0));
      const prevEx = prevW?.exercises.find((e) => e.exerciseId === ex.exerciseId);
      const prevSt = prevEx ? exerciseStats(prevEx) : null;
      const range = ctx.rangeOf(ex.exerciseId);
      const next = nextAction(ex.sets, range);
      return {
        exerciseId: ex.exerciseId,
        name: ctx.nameOf(ex.exerciseId),
        workingSets: st.workingSets,
        reps: st.reps,
        volumeKg: st.volumeKg,
        topSet: st.topSet,
        previous: prevW && prevSt ? { at: prevW.startedAt, volumeKg: prevSt.volumeKg, topSet: prevSt.topSet } : null,
        volumeDeltaPct:
          prevSt && prevSt.volumeKg > 0 && st.volumeKg > 0
            ? Math.round(((st.volumeKg - prevSt.volumeKg) / prevSt.volumeKg) * 100)
            : null,
        records: records.filter((r) => r.exerciseId === ex.exerciseId),
        next,
      };
    });

  const end = new Date(current.finishedAt ?? current.startedAt);
  const win = lastDays(end, 7);
  const all = [current, ...others];
  const week = new Map(muscleSets(all, win.from, win.to, ctx.muscleOf).map((m) => [m.muscle, m.sets]));
  const own = muscleSets([current], new Date(0), new Date(8.64e15), ctx.muscleOf);
  const muscles: MuscleLine[] = own.map((m) => ({ muscle: m.muscle, workout: m.sets, week: week.get(m.muscle) ?? m.sets }));

  return {
    workout: current,
    totals: workoutTotals(current),
    exercises,
    records,
    muscles,
    highlight: pickHighlight(records, exercises, ctx.nameOf),
    focus: pickFocus(exercises),
  };
}

/** Name und Muskeln einer Übung für die Anzeige. */
export interface ExerciseMeta {
  name: string;
  primary: string[];
  secondary: string[];
}
