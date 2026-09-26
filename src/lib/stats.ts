import { suggestProgression, type LoggedSet } from './progression';
import { totalLoad } from './weight';
import type { Draft, WorkoutPayload } from './workout';

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
    list.push({ type: s.type, weightKg: Number(s.weight_kg), reps: s.reps });
    byWe.set(s.workout_exercise_id, list);
  }
  return {
    id: p.workout.id,
    name: p.workout.name,
    startedAt: p.workout.started_at,
    finishedAt: p.workout.finished_at,
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
    exercises: draft.exercises
      .map((e) => ({
        exerciseId: e.exerciseId,
        equipmentKg: e.equipmentKg,
        sets: e.sets
          .filter((s) => s.done)
          .map((s) => ({ type: s.type, weightKg: s.weightKg, reps: s.reps })),
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
      let next: ExerciseSummary['next'] = null;
      if (range && range.repMin <= range.repMax) {
        const logged: LoggedSet[] = ex.sets.map((s) => ({ type: s.type, weightKg: s.weightKg, reps: s.reps, rir: null }));
        const sug = suggestProgression({ sets: logged, repMin: range.repMin, repMax: range.repMax });
        next = sug.action === 'increase' ? 'increase' : sug.action === 'hold' ? 'hold' : null;
      }
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

  return { workout: current, totals: workoutTotals(current), exercises, records, muscles };
}

/** Name und Muskeln einer Übung für die Anzeige. */
export interface ExerciseMeta {
  name: string;
  primary: string[];
  secondary: string[];
}
