import { visibleDays, type Plan } from './plan';
import {
  findRecords,
  lastDays,
  muscleSets,
  nextAction,
  sortNewestFirst,
  workoutTotals,
  WEEKLY_SETS_REFERENCE,
  type HistWorkout,
  type MuscleInfo,
  type RecordHit,
} from './stats';

/**
 * Wochenrückblick: erscheint, sobald der letzte Tag der Plan-Rotation abgeschlossen ist
 * (z. B. Push -> Pull -> Lower -> Push, ...). Das Zeitfenster ist bewusst dasselbe wie
 * überall sonst in der App (die letzten 7 Tage bis zum Ende dieses Trainings), keine
 * eigene Kalenderwoche – siehe lastDays() in stats.ts. Reine Logik ohne Browser- oder
 * Datenbankzugriff.
 */

export interface ReviewContext {
  nameOf: (exerciseId: string) => string;
  muscleOf: (exerciseId: string) => MuscleInfo;
  /** Wiederholungsbereich der Übung aus dem Plan; null, wenn unbekannt. */
  rangeOf: (exerciseId: string) => { repMin: number; repMax: number } | null;
}

/** true, wenn dayId der letzte sichtbare Tag der Plan-Rotation ist. */
export function isLastPlanDay(plan: Plan, dayId: string): boolean {
  const days = visibleDays(plan);
  return days.length > 0 && days[days.length - 1].id === dayId;
}

export interface WeeklyTotals {
  sessions: number;
  workingSets: number;
  reps: number;
  volumeKg: number;
  durationMin: number;
}

export interface PlanAdherence {
  planName: string;
  /** Tage in der Rotation dieses Plans. */
  plannedDays: number;
  /** Trainings (egal welcher Art) in den letzten 7 Tagen. */
  doneSessions: number;
}

export interface MuscleReviewLine {
  muscle: string;
  /** Arbeitssätze in den letzten 7 Tagen. */
  sets: number;
  /** Trainings, in denen der Muskel mindestens einen Arbeitssatz hatte. */
  sessions: number;
  /** Einordnung gegenüber dem Richtwert (WEEKLY_SETS_REFERENCE). */
  status: 'under' | 'in' | 'over';
}

export interface ExerciseProgressLine {
  exerciseId: string;
  name: string;
  sessions: number;
  workingSets: number;
  /** Empfehlung aus der jüngsten Einheit dieser Woche; null ohne Wiederholungsbereich. */
  action: 'increase' | 'hold' | null;
}

export interface WeeklyReview {
  from: string;
  to: string;
  totals: WeeklyTotals;
  adherence: PlanAdherence;
  muscles: MuscleReviewLine[];
  exercises: ExerciseProgressLine[];
  records: RecordHit[];
}

function muscleStatus(sets: number): MuscleReviewLine['status'] {
  if (sets < WEEKLY_SETS_REFERENCE.min) return 'under';
  if (sets > WEEKLY_SETS_REFERENCE.max) return 'over';
  return 'in';
}

/** Anzahl Trainings im Zeitfenster, in denen der Muskel (Haupt- oder Hilfsmuskel) mindestens einen Arbeitssatz hatte. */
function muscleFrequency(
  workouts: HistWorkout[],
  from: Date,
  to: Date,
  muscleOf: (exerciseId: string) => MuscleInfo,
): Map<string, number> {
  const freq = new Map<string, number>();
  for (const w of workouts) {
    const t = new Date(w.startedAt).getTime();
    if (t < from.getTime() || t >= to.getTime()) continue;
    const hit = new Set<string>();
    for (const ex of w.exercises) {
      if (ex.sets.filter((s) => s.type === 'working').length === 0) continue;
      const info = muscleOf(ex.exerciseId);
      for (const m of [...info.primary, ...info.secondary]) hit.add(m);
    }
    for (const m of hit) freq.set(m, (freq.get(m) ?? 0) + 1);
  }
  return freq;
}

/**
 * Baut den Wochenrückblick. `allWorkouts` sind alle bekannten Trainings (Datenbank plus
 * noch nicht gesendete, z. B. über mergeHistory), `end` das Ende des gerade
 * abgeschlossenen Trainings, mit dem die Rotation dieses Plans abgeschlossen wurde.
 */
export function buildWeeklyReview(
  plan: Plan,
  allWorkouts: HistWorkout[],
  end: Date,
  ctx: ReviewContext,
): WeeklyReview {
  const { from, to } = lastDays(end, 7);
  const inWindow = allWorkouts.filter((w) => {
    const t = new Date(w.startedAt).getTime();
    return t >= from.getTime() && t < to.getTime() && workoutTotals(w).workingSets > 0;
  });
  const newestFirst = sortNewestFirst(inWindow);

  let workingSets = 0;
  let reps = 0;
  let volumeKg = 0;
  let durationMin = 0;
  for (const w of inWindow) {
    const t = workoutTotals(w);
    workingSets += t.workingSets;
    reps += t.reps;
    volumeKg += t.volumeKg;
    durationMin += t.durationMin ?? 0;
  }

  const muscleLines = muscleSets(inWindow, from, to, ctx.muscleOf);
  const freq = muscleFrequency(allWorkouts, from, to, ctx.muscleOf);
  const muscles: MuscleReviewLine[] = muscleLines.map((m) => ({
    muscle: m.muscle,
    sets: m.sets,
    sessions: freq.get(m.muscle) ?? 0,
    status: muscleStatus(m.sets),
  }));

  // Übungen dieser Woche: je Übung Sätze/Trainings plus Fortschrittsvorschlag anhand der
  // jüngsten Einheit in diesem Fenster (gleiche Regel wie in der Einzel-Auswertung).
  const exerciseIds = [
    ...new Set(
      inWindow.flatMap((w) =>
        w.exercises.filter((e) => e.sets.some((s) => s.type === 'working')).map((e) => e.exerciseId),
      ),
    ),
  ];
  const exercises: ExerciseProgressLine[] = exerciseIds.map((id) => {
    let workingSetsEx = 0;
    let sessions = 0;
    let latestSets: HistWorkout['exercises'][number]['sets'] | null = null;
    for (const w of newestFirst) {
      const ex = w.exercises.find((e) => e.exerciseId === id);
      const working = ex?.sets.filter((s) => s.type === 'working') ?? [];
      if (working.length === 0) continue;
      workingSetsEx += working.length;
      sessions += 1;
      if (!latestSets) latestSets = ex!.sets;
    }
    const action = nextAction(latestSets ?? [], ctx.rangeOf(id));
    return { exerciseId: id, name: ctx.nameOf(id), sessions, workingSets: workingSetsEx, action };
  });
  exercises.sort((a, b) => b.workingSets - a.workingSets || a.name.localeCompare(b.name));

  // Bestwerte dieser Woche: jedes Training in der Woche gegen alles, was zeitlich davor
  // liegt (auch gegen frühere Trainings derselben Woche) – älteste zuerst.
  const oldestFirst = [...inWindow].sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
  const seenThisWeek: HistWorkout[] = [];
  const records: RecordHit[] = [];
  for (const w of oldestFirst) {
    const before = allWorkouts.filter((o) => new Date(o.startedAt).getTime() < new Date(w.startedAt).getTime());
    records.push(...findRecords(w, [...before, ...seenThisWeek]));
    seenThisWeek.push(w);
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: { sessions: inWindow.length, workingSets, reps, volumeKg: Math.round(volumeKg), durationMin },
    adherence: { planName: plan.name, plannedDays: visibleDays(plan).length, doneSessions: inWindow.length },
    muscles,
    exercises,
    records,
  };
}
