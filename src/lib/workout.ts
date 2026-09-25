import { suggestProgression, type LoggedSet, type ProgressionSuggestion } from './progression';
import { suggestWarmup } from './warmup';

/**
 * Zustand eines laufenden Trainings. Alles hier ist reine Logik ohne Browser-
 * oder Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 * Alle Funktionen geben neue Objekte zurück, nichts wird verändert.
 */

export interface DraftSet {
  id: string;
  type: 'warmup' | 'working';
  weightKg: number;
  reps: number;
  /** Wiederholungen in Reserve; 0 = Muskelversagen; null = nicht erfasst. */
  rir: number | null;
  done: boolean;
}

export interface DraftExercise {
  id: string;
  exerciseId: string;
  name: string;
  /** true = eigene Übung, die beim Abschluss erst in der Datenbank angelegt wird. */
  isNew: boolean;
  repMin: number;
  repMax: number;
  /** Stangen-/Maschinengewicht dieser Übung im Training (optional). */
  equipmentKg: number | null;
  /** Geräteart (z. B. 'barbell'); nur für eigene Übungen nötig. */
  equipment?: string | null;
  /** Notiz aus dem Plan, z. B. Sitzeinstellung. */
  note?: string;
  /** Nur für eigene Übungen (isNew) nötig; ältere Entwürfe haben die Felder nicht. */
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  plannedSets: number;
  /** Ziel-RIR aus dem Plan (nur Anzeige); null = keine Vorgabe. */
  targetRir: number | null;
  restSeconds: number;
  sets: DraftSet[];
  /** Sätze des letzten Trainings dieser Übung (für Vorbelegung und Vorschlag). */
  lastSets: LoggedSet[];
  suggestion: ProgressionSuggestion;
}

export interface Draft {
  id: string;
  name: string;
  planDayId: string | null;
  startedAt: string;
  exercises: DraftExercise[];
  /** Ende der laufenden Pause (Date.now()-Zeit in ms), damit sie ein Neuladen übersteht. */
  restEndsAt?: number | null;
}

export interface ExerciseInput {
  exerciseId: string;
  name: string;
  isNew: boolean;
  repMin?: number;
  repMax?: number;
  equipmentKg?: number | null;
  /** Arbeitsgewicht aus dem Plan; hat Vorrang vor dem Wert vom letzten Training. */
  weightKg?: number | null;
  equipment?: string | null;
  note?: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  plannedSets?: number;
  targetRir?: number | null;
  restSeconds?: number;
  lastSets?: LoggedSet[];
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // Fallback für ältere Browser; reicht für eindeutige Zeilen-IDs einer Einzelperson.
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-a${hex().slice(1)}-${hex()}${hex()}${hex()}`;
}

export function createDraft(name: string, planDayId: string | null, now: Date): Draft {
  return { id: newId(), name, planDayId, startedAt: now.toISOString(), exercises: [] };
}

function mapEx(draft: Draft, exId: string, fn: (e: DraftExercise) => DraftExercise): Draft {
  return { ...draft, exercises: draft.exercises.map((e) => (e.id === exId ? fn(e) : e)) };
}

export function addExercise(draft: Draft, input: ExerciseInput): Draft {
  const repMin = input.repMin ?? 8;
  const repMax = input.repMax ?? 12;
  const plannedSets = input.plannedSets ?? 3;
  const lastSets = input.lastSets ?? [];

  const suggestion = suggestProgression({ sets: lastSets, repMin, repMax });
  const weightKg = input.weightKg ?? suggestion.weightKg ?? 0;
  const reps = suggestion.targetReps ?? repMin;

  const sets: DraftSet[] = Array.from({ length: plannedSets }, () => ({
    id: newId(),
    type: 'working' as const,
    weightKg,
    reps,
    rir: null,
    done: false,
  }));

  const exercise: DraftExercise = {
    id: newId(),
    exerciseId: input.exerciseId,
    name: input.name,
    isNew: input.isNew,
    repMin,
    repMax,
    equipmentKg: input.equipmentKg ?? null,
    equipment: input.equipment ?? null,
    note: input.note,
    primaryMuscles: input.primaryMuscles ?? [],
    secondaryMuscles: input.secondaryMuscles ?? [],
    plannedSets,
    targetRir: input.targetRir ?? null,
    restSeconds: input.restSeconds ?? 120,
    sets,
    lastSets,
    suggestion,
  };
  return { ...draft, exercises: [...draft.exercises, exercise] };
}

export function updateExercise(
  draft: Draft,
  exId: string,
  patch: Partial<Pick<DraftExercise, 'restSeconds' | 'equipmentKg'>>,
): Draft {
  return mapEx(draft, exId, (e) => ({ ...e, ...patch }));
}

/** Kurztext für "Letztes Mal", z. B. "50 kg × 12, 12, 11 · 45 kg × 10". */
export function describeLastSets(sets: LoggedSet[]): string {
  const working = sets.filter((s) => s.type === 'working');
  if (working.length === 0) return '';
  const groups: { weightKg: number; reps: number[] }[] = [];
  for (const s of working) {
    const last = groups[groups.length - 1];
    if (last && last.weightKg === s.weightKg) last.reps.push(s.reps);
    else groups.push({ weightKg: s.weightKg, reps: [s.reps] });
  }
  return groups
    .map((g) => `${String(g.weightKg).replace('.', ',')} kg × ${g.reps.join(', ')}`)
    .join(' · ');
}

export function removeExercise(draft: Draft, exId: string): Draft {
  return { ...draft, exercises: draft.exercises.filter((e) => e.id !== exId) };
}

export function updateSet(
  draft: Draft,
  exId: string,
  setId: string,
  patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'rir' | 'type'>>,
): Draft {
  return mapEx(draft, exId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
  }));
}

export function toggleDone(draft: Draft, exId: string, setId: string): Draft {
  return mapEx(draft, exId, (e) => ({
    ...e,
    sets: e.sets.map((s) => (s.id === setId ? { ...s, done: !s.done } : s)),
  }));
}

/** Neuer Arbeitssatz mit den Werten des letzten Satzes als Startwert. */
export function addSet(draft: Draft, exId: string): Draft {
  return mapEx(draft, exId, (e) => {
    const lastWorking = [...e.sets].reverse().find((s) => s.type === 'working');
    const base = lastWorking ?? {
      weightKg: e.suggestion.weightKg ?? 0,
      reps: e.suggestion.targetReps ?? e.repMin,
    };
    const set: DraftSet = {
      id: newId(),
      type: 'working',
      weightKg: base.weightKg,
      reps: base.reps,
      rir: null,
      done: false,
    };
    return { ...e, sets: [...e.sets, set] };
  });
}

/**
 * Übernimmt das Gewicht eines Satzes auf alle folgenden, noch nicht erledigten
 * Sätze derselben Art (Aufwärmen bzw. Arbeitssatz). Wiederholungen bleiben unverändert.
 */
export function copyWeightToLaterSets(draft: Draft, exId: string, setId: string): Draft {
  return mapEx(draft, exId, (e) => {
    const idx = e.sets.findIndex((s) => s.id === setId);
    if (idx === -1) return e;
    const source = e.sets[idx];
    return {
      ...e,
      sets: e.sets.map((s, i) =>
        i > idx && s.type === source.type && !s.done ? { ...s, weightKg: source.weightKg } : s,
      ),
    };
  });
}

/**
 * Setzt das Gewicht eines Satzes. Folgende, noch nicht erledigte Sätze der gleichen Art
 * ziehen mit, solange sie bisher noch dasselbe Gewicht hatten. Bewusst anders eingestellte
 * Sätze (z. B. Pyramide) bleiben unberührt.
 */
export function updateSetWeight(draft: Draft, exId: string, setId: string, kg: number): Draft {
  return mapEx(draft, exId, (e) => {
    const idx = e.sets.findIndex((s) => s.id === setId);
    if (idx === -1) return e;
    const source = e.sets[idx];
    const old = source.weightKg;
    return {
      ...e,
      sets: e.sets.map((s, i) => {
        if (i === idx) return { ...s, weightKg: kg };
        if (i > idx && s.type === source.type && !s.done && s.weightKg === old) return { ...s, weightKg: kg };
        return s;
      }),
    };
  });
}

export function removeSet(draft: Draft, exId: string, setId: string): Draft {
  return mapEx(draft, exId, (e) => ({ ...e, sets: e.sets.filter((s) => s.id !== setId) }));
}

/**
 * Fügt vorgeschlagene Aufwärmsätze vor den Arbeitssätzen ein. Vorhandene, noch
 * nicht abgehakte Aufwärmsätze werden dabei ersetzt, damit ein zweiter Klick
 * nichts verdoppelt.
 */
export function addWarmups(draft: Draft, exId: string, level: 'full' | 'short'): Draft {
  return mapEx(draft, exId, (e) => {
    const firstWorking = e.sets.find((s) => s.type === 'working');
    if (!firstWorking || firstWorking.weightKg <= 0) return e;
    const warm = suggestWarmup({
      workingWeightKg: firstWorking.weightKg,
      equipmentKg: e.equipmentKg,
      level,
    });
    const kept = e.sets.filter((s) => !(s.type === 'warmup' && !s.done));
    const doneWarmups = kept.filter((s) => s.type === 'warmup');
    const working = kept.filter((s) => s.type === 'working');
    const fresh: DraftSet[] = warm.map((w) => ({
      id: newId(),
      type: 'warmup',
      weightKg: w.weightKg,
      reps: w.reps,
      rir: null,
      done: false,
    }));
    return { ...e, sets: [...doneWarmups, ...fresh, ...working] };
  });
}

/** Abgehakte Sätze einer Übung im Format der Progressionslogik. */
export function doneSetsAsLogged(e: DraftExercise): LoggedSet[] {
  return e.sets
    .filter((s) => s.done)
    .map((s) => ({ type: s.type, weightKg: s.weightKg, reps: s.reps, rir: s.rir }));
}

// ---------------------------------------------------------------------------
// Abschluss: Entwurf -> Datenbankzeilen

export interface NewExerciseRow {
  id: string;
  source: 'custom';
  name_de: string;
  equipment: string | null;
  primary_muscles: string[];
  secondary_muscles: string[];
}

export interface WorkoutPayload {
  newExercises: NewExerciseRow[];
  workout: {
    id: string;
    plan_day_id: string | null;
    name: string;
    started_at: string;
    finished_at: string;
  };
  workoutExercises: {
    id: string;
    workout_id: string;
    exercise_id: string;
    position: number;
    planned_sets: number;
    rep_min: number;
    rep_max: number;
    target_rir: number | null;
    equipment_kg: number | null;
  }[];
  sets: {
    id: string;
    workout_exercise_id: string;
    set_number: number;
    type: 'warmup' | 'working';
    weight_kg: number;
    reps: number;
    rir: number | null;
    done_at: string;
  }[];
}

/**
 * Baut die Zeilen für die Datenbank. Nur abgehakte Sätze werden gespeichert,
 * Übungen ohne abgehakten Satz entfallen. Alle IDs stammen aus dem Entwurf,
 * deshalb kann ein Sync-Versuch gefahrlos wiederholt werden (Upsert).
 */
export function buildPayload(draft: Draft, finishedAt: Date): WorkoutPayload | null {
  const exercises = draft.exercises.filter((e) => e.sets.some((s) => s.done));
  if (exercises.length === 0) return null;

  const finished = finishedAt.toISOString();
  const payload: WorkoutPayload = {
    newExercises: [],
    workout: {
      id: draft.id,
      plan_day_id: draft.planDayId,
      name: draft.name,
      started_at: draft.startedAt,
      finished_at: finished,
    },
    workoutExercises: [],
    sets: [],
  };

  const seenNew = new Set<string>();
  exercises.forEach((e, i) => {
    if (e.isNew && !seenNew.has(e.exerciseId)) {
      seenNew.add(e.exerciseId);
      payload.newExercises.push({
        id: e.exerciseId,
        source: 'custom',
        name_de: e.name,
        equipment: e.equipment ?? null,
        primary_muscles: e.primaryMuscles ?? [],
        secondary_muscles: e.secondaryMuscles ?? [],
      });
    }
    payload.workoutExercises.push({
      id: e.id,
      workout_id: draft.id,
      exercise_id: e.exerciseId,
      position: i + 1,
      planned_sets: e.plannedSets,
      rep_min: e.repMin,
      rep_max: e.repMax,
      target_rir: e.targetRir ?? null,
      equipment_kg: e.equipmentKg,
    });
    e.sets
      .filter((s) => s.done)
      .forEach((s, n) => {
        payload.sets.push({
          id: s.id,
          workout_exercise_id: e.id,
          set_number: n + 1,
          type: s.type,
          weight_kg: s.weightKg,
          reps: s.reps,
          rir: s.rir,
          done_at: finished,
        });
      });
  });
  return payload;
}
