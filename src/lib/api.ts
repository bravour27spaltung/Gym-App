import { supabase } from '../supabase';
import { translateAuthError } from './authErrors';
import type { Plan, PlanDbRow, PlanPatch, PlanRows } from './plan';
import type { SeatNotes } from './seatNote';
import { resetSteps } from './reset';
import { plansFromRows } from './plan';
import type { StretchPayload, StretchPlan, StretchPlanPayload, StretchSide } from './stretch';
import { STRETCH_CATALOG, STRETCH_PLAN_CATALOG, type CatalogPlanItem } from './stretchCatalog';
import { parseCardioActivity, type CardioActivity, type CardioPayload, type CardioSource } from './cardio';
import type { FootballKind } from './football';
import { hrPointsFromArchive, type HrPoint } from './zones';
import type { WatchRangeRecord } from './footballWatch';
import { summarizeArchive, type ArchiveLookup, type ArchiveRow } from './healthArchive';
import type { RecoveryPayload, RecoverySource } from './recovery';
import type { RecoveryInboxRow } from './recoveryInbox';
import type { HistWorkout } from './stats';
import type {
  ExerciseListItem,
  HistCardioSession,
  HistRecoveryEntry,
  HistStretchSession,
  LastInfo,
  Store,
  StretchExerciseListItem,
} from './storage';
import { newId } from './workout';
import type { Feedback, WorkoutPayload } from './workout';

/** Dünne Schicht um Supabase. Fehler werden zurückgegeben, nicht geworfen. */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

const NOT_CONFIGURED = 'Supabase ist nicht konfiguriert (.env fehlt).';

function fail<T>(message: string): Result<T> {
  return { ok: false, error: message };
}

export async function getSessionEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

export async function signIn(email: string, password: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? fail(translateAuthError(error.message)) : { ok: true, data: null };
}

/**
 * Schickt eine E-Mail mit Anmeldelink und Code. shouldCreateUser: false verhindert,
 * dass über dieses Formular neue Konten entstehen.
 */
export async function sendLoginLink(email: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
  });
  return error ? fail(translateAuthError(error.message)) : { ok: true, data: null };
}

/** Meldet mit dem Code aus der E-Mail an (nötig für die App vom iPhone-Home-Bildschirm). */
export async function verifyLoginCode(email: string, token: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
  return error ? fail(translateAuthError(error.message)) : { ok: true, data: null };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

interface ExerciseRow {
  id: string;
  name_de: string;
  equipment: string | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
}

export async function fetchExercises(): Promise<Result<ExerciseListItem[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_exercises')
    .select('id, name_de, equipment, primary_muscles, secondary_muscles')
    .is('archived_at', null)
    .order('name_de');
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as ExerciseRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name_de,
      equipment: r.equipment,
      primaryMuscles: r.primary_muscles ?? [],
      secondaryMuscles: r.secondary_muscles ?? [],
    })),
  };
}

interface LastSetRow {
  type: 'warmup' | 'working';
  weight_kg: number;
  reps: number;
  rir: number | null;
  equipment_kg?: number | null;
  /** Fehlt in Datenbanken ohne Migration 0019. */
  duration_seconds?: number | null;
}

/**
 * Sätze und Stangen-/Maschinengewicht des letzten abgeschlossenen Trainings dieser Übung
 * (View fit_last_sets). Kennt die View die Spalte equipment_kg noch nicht (Migration 0005
 * fehlt), wird ohne sie geladen, damit die Sätze trotzdem ankommen.
 */
export async function fetchLastSets(exerciseId: string): Promise<Result<LastInfo>> {
  const client = supabase;
  if (!client) return fail(NOT_CONFIGURED);
  const load = (columns: string) =>
    client.from('fit_last_sets').select(columns).eq('exercise_id', exerciseId).order('set_number');
  let res = await load('type, weight_kg, reps, rir, equipment_kg, duration_seconds');
  if (res.error) res = await load('type, weight_kg, reps, rir, equipment_kg');
  if (res.error) res = await load('type, weight_kg, reps, rir');
  if (res.error) return fail(res.error.message);
  const rows = (res.data ?? []) as unknown as LastSetRow[];
  const eq = rows.find((r) => r.equipment_kg !== null && r.equipment_kg !== undefined)?.equipment_kg;
  return {
    ok: true,
    data: {
      sets: rows.map((r) => ({
        type: r.type,
        weightKg: Number(r.weight_kg),
        reps: r.reps,
        ...(r.duration_seconds != null ? { durationSeconds: r.duration_seconds } : {}),
        rir: r.rir,
      })),
      equipmentKg: eq === null || eq === undefined ? null : Number(eq),
    },
  };
}

interface HistoryRow {
  id: string;
  name: string;
  started_at: string;
  finished_at: string | null;
  /** Fehlt in Datenbanken ohne Migration 0007. */
  feedback?: Feedback | null;
  /** Fehlt in Datenbanken ohne Migration 0011. */
  calories?: number | null;
  avg_heart_rate?: number | null;
  fit_workout_exercises: {
    exercise_id: string;
    position: number;
    equipment_kg: number | string | null;
    fit_sets: {
      type: 'warmup' | 'working';
      weight_kg: number | string;
      reps: number;
      set_number: number;
      /** Fehlt in Datenbanken ohne Migration 0019. */
      duration_seconds?: number | null;
    }[];
  }[];
}

/**
 * Abgeschlossene Trainings mit allen Übungen und Sätzen, neueste zuerst. Die Zeilen sind
 * klein (einige Sätze je Übung); 150 Trainings reichen für gut ein Jahr bei drei Einheiten
 * pro Woche.
 */
export async function fetchHistory(limit = 150): Promise<Result<HistWorkout[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // "feedback" gibt es erst seit Migration 0007, "calories"/"avg_heart_rate" erst seit
  // Migration 0011; ohne sie auf die älteren Spalten ausweichen, damit der Verlauf
  // trotzdem lädt, auch wenn eine Migration noch nicht ausgeführt wurde.
  const variants = [
    'id, name, started_at, finished_at, feedback, calories, avg_heart_rate, ',
    'id, name, started_at, finished_at, feedback, ',
    'id, name, started_at, finished_at, ',
  ];
  // Zusätzlich gibt es die Satz-Spalte "duration_seconds" erst seit Migration 0019: zuerst mit,
  // dann ohne probieren.
  const setCols = [
    'type, weight_kg, reps, set_number, duration_seconds',
    'type, weight_kg, reps, set_number',
  ];
  const combos = setCols.flatMap((sc) => variants.map((cols) => ({ cols, sc })));
  let data: unknown[] | null = null;
  let lastError = '';
  for (const { cols, sc } of combos) {
    const res = await supabase
      .from('fit_workouts')
      .select(
        `${cols}fit_workout_exercises(exercise_id, position, equipment_kg, fit_sets(${sc}))`,
      )
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (!res.error) {
      data = res.data;
      break;
    }
    lastError = res.error.message;
  }
  if (data === null) return fail(lastError);
  const rows = data as unknown as HistoryRow[];
  return {
    ok: true,
    data: rows.map((w) => ({
      id: w.id,
      name: w.name,
      startedAt: w.started_at,
      finishedAt: w.finished_at,
      feedback: w.feedback ?? null,
      calories: w.calories ?? null,
      avgHeartRate: w.avg_heart_rate ?? null,
      exercises: [...w.fit_workout_exercises]
        .sort((a, b) => a.position - b.position)
        .map((e) => ({
          exerciseId: e.exercise_id,
          equipmentKg: e.equipment_kg === null ? null : Number(e.equipment_kg),
          sets: [...e.fit_sets]
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => ({
              type: s.type,
              weightKg: Number(s.weight_kg),
              reps: s.reps,
              ...(s.duration_seconds != null ? { durationSeconds: s.duration_seconds } : {}),
            })),
        })),
    })),
  };
}

export async function fetchPlans(
  namesById: Record<string, string | undefined>,
): Promise<Result<Plan[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // Neueste Spalten zuerst. Fehlt eine Migration, wird mit dem älteren Spaltensatz geladen,
  // damit die Pläne trotzdem erscheinen (Speichern meldet dann klar, was fehlt).
  const variants = [
    ['kind, ', ', warmup, warmup_sets, note, weight_kg, equipment_kg'],
    ['kind, ', ', warmup, note, weight_kg, equipment_kg'],
    ['kind, ', ', warmup, note'],
    ['', ''],
  ] as const;
  let lastError = '';
  for (const [planCols, exCols] of variants) {
    const { data, error } = await supabase
      .from('fit_plans')
      .select(
        `id, ${planCols}name, archived_at, fit_plan_days(id, name, position, archived_at, ` +
          `fit_plan_exercises(id, exercise_id, position, sets, rep_min, rep_max, target_rir, rest_seconds${exCols}, archived_at))`,
      )
      .is('archived_at', null)
      .order('created_at');
    if (!error) {
      return { ok: true, data: plansFromRows((data ?? []) as unknown as PlanDbRow[], namesById) };
    }
    lastError = error.message;
  }
  return fail(lastError);
}

/** Schreibt einen Plan: neue Übungen, Plan, Tage, Übungen (Upsert über die Client-IDs). */
export async function savePlanRows(rows: PlanRows): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const steps: [string, unknown[]][] = [
    ['fit_exercises', rows.newExercises],
    ['fit_plans', [rows.plan]],
    ['fit_plan_days', rows.days],
    ['fit_plan_exercises', rows.exercises],
  ];
  for (const [table, list] of steps) {
    if (list.length === 0) continue;
    const { error } = await supabase.from(table).upsert(list, { onConflict: 'id' });
    if (error) return fail(table === 'fit_plan_exercises' ? planRowsError(error.message) : `${table}: ${error.message}`);
  }
  return { ok: true, data: null };
}

/** Meldet eine fehlende Migration 0023 verständlich, sonst die Rohmeldung der Datenbank. */
function planRowsError(message: string): string {
  return /warmup_sets/i.test(message)
    ? 'Aufwärmsätze im Plan: Migration 0023 fehlt in Supabase (Spalte warmup_sets in fit_plan_exercises).'
    : `fit_plan_exercises: ${message}`;
}

/**
 * Schickt im Training geänderte Satzzahlen/Aufwärmen/Notizen an die Planübungen. Es werden nur die
 * betroffenen Felder dieser Zeilen geschrieben (kein Upsert des ganzen Plans), ein Wiederholen
 * ist gefahrlos. Fehlgeschlagene bleiben liegen; ein Fehler blockiert nie das Speichern des
 * Trainings, weil das in einem eigenen Ausgangskorb liegt.
 */
export async function flushPlanPatches(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const items = store.loadPlanPatches();
  if (items.length === 0) return { sent: 0, pending: 0, error: null };
  if (!supabase) return { sent: 0, pending: items.length, error: NOT_CONFIGURED };
  const remaining: PlanPatch[] = [];
  let sent = 0;
  let error: string | null = null;
  for (const item of items) {
    const fields: {
      sets?: number;
      warmup?: boolean;
      warmup_sets?: { weight_kg: number; reps: number }[];
      note?: string | null;
    } = {};
    if (item.sets !== undefined) fields.sets = item.sets;
    if (item.warmup !== undefined) fields.warmup = item.warmup;
    if (item.warmupSets !== undefined) {
      fields.warmup_sets = item.warmupSets.map((w) => ({ weight_kg: w.weightKg, reps: w.reps }));
    }
    if (item.note !== undefined) fields.note = item.note.trim() === '' ? null : item.note.trim();
    let { error: err } = await supabase.from('fit_plan_exercises').update(fields).eq('id', item.planExerciseId);
    if (err && fields.warmup_sets !== undefined && /warmup_sets/i.test(err.message)) {
      // Migration 0023 fehlt: Sätze, Aufwärmen und Notiz gehen trotzdem durch, die Meldung sagt, was fehlt.
      const rest = { ...fields };
      delete rest.warmup_sets;
      error = planRowsError(err.message);
      err = null;
      if (Object.keys(rest).length > 0) {
        ({ error: err } = await supabase.from('fit_plan_exercises').update(rest).eq('id', item.planExerciseId));
      }
    }
    if (err) {
      remaining.push(item);
      error = `fit_plan_exercises: ${err.message}`;
      console.error(`flushPlanPatches: ${err.message}`);
    } else sent += 1;
  }
  if (sent > 0) store.savePlanPatches(remaining);
  return { sent, pending: remaining.length, error };
}

/** Meldet eine fehlende Migration 0022 verständlich, sonst die Rohmeldung der Datenbank. */
function seatNotesError(message: string): string {
  return /schema cache|does not exist|42P01|PGRST205/i.test(message)
    ? 'Sitzeinstellungen: Migration 0022 fehlt in Supabase (Tabelle fit_exercise_notes).'
    : `fit_exercise_notes: ${message}`;
}

/** Alle gespeicherten Sitzeinstellungen, je Übungs-ID. */
export async function fetchSeatNotes(): Promise<Result<SeatNotes>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase.from('fit_exercise_notes').select('exercise_id, note');
  if (error) return fail(seatNotesError(error.message));
  const rows = (data ?? []) as unknown as { exercise_id: string; note: string }[];
  return { ok: true, data: Object.fromEntries(rows.map((r) => [r.exercise_id, r.note])) };
}

/**
 * Schickt geänderte Sitzeinstellungen an die Datenbank (Upsert je Übung, leer = löschen). Ein
 * Wiederholen ist gefahrlos. Fehlgeschlagene bleiben im Ausgangskorb; wurde eine Notiz währenddessen
 * erneut geändert, bleibt der neuere Stand stehen.
 */
export async function flushSeatNotes(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const queued = store.loadSeatNotesOutbox();
  const ids = Object.keys(queued);
  if (ids.length === 0) return { sent: 0, pending: 0, error: null };
  if (!supabase) return { sent: 0, pending: ids.length, error: NOT_CONFIGURED };
  const done: string[] = [];
  let error: string | null = null;
  for (const id of ids) {
    const note = queued[id];
    const { error: err } =
      note === ''
        ? await supabase.from('fit_exercise_notes').delete().eq('exercise_id', id)
        : await supabase
            .from('fit_exercise_notes')
            .upsert({ exercise_id: id, note, updated_at: new Date().toISOString() }, { onConflict: 'exercise_id' });
    if (err) {
      error = seatNotesError(err.message);
      console.error(`flushSeatNotes: ${err.message}`);
    } else done.push(id);
  }
  if (done.length > 0) {
    const current = store.loadSeatNotesOutbox();
    for (const id of done) if (current[id] === queued[id]) delete current[id];
    store.saveSeatNotesOutbox(current);
  }
  return { sent: done.length, pending: ids.length - done.length, error };
}

export async function archivePlan(planId: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase
    .from('fit_plans')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', planId);
  return error ? fail(error.message) : { ok: true, data: null };
}

/** Plantag des zuletzt gespeicherten Plan-Trainings (für die Rotation). */
export async function fetchLastPlanDayId(): Promise<Result<string | null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_workouts')
    .select('plan_day_id')
    .not('plan_day_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as { plan_day_id: string | null }[];
  return { ok: true, data: rows[0]?.plan_day_id ?? null };
}

/**
 * Schreibt ein Training in dieser Reihenfolge: neue Übungen, Training,
 * Trainings-Übungen, Sätze. Upsert über die Client-IDs, ein Wiederholen nach
 * einem Abbruch erzeugt deshalb keine Doppelten.
 */
export async function syncPayload(p: WorkoutPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);

  const steps: [string, unknown[]][] = [
    ['fit_exercises', p.newExercises],
    ['fit_workouts', [p.workout]],
    ['fit_workout_exercises', p.workoutExercises],
    ['fit_sets', p.sets],
  ];
  for (const [table, rows] of steps) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) return fail(`${table}: ${error.message}`);
  }
  return { ok: true, data: null };
}

/** Versucht alle Trainings im Ausgangskorb zu senden; Fehlgeschlagene bleiben liegen. */
export async function flushOutbox(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const items = store.loadOutbox();
  const remaining = [];
  let sent = 0;
  let error: string | null = null;
  for (const item of items) {
    const res = await syncPayload(item);
    if (res.ok) sent += 1;
    else {
      remaining.push(item);
      error = res.error;
      console.error(`flushOutbox: ${res.error}`);
    }
  }
  if (sent > 0) store.saveOutbox(remaining);
  return { sent, pending: remaining.length, error };
}

/**
 * Löscht nur Trainings, Sätze, Verlauf und Fußball-Einträge des angemeldeten Nutzers
 * dauerhaft (zum Testen). Pläne, Vorlagen, eigene Übungen und der Übungskatalog bleiben
 * erhalten. Bricht beim ersten Fehler ab und nennt die Tabelle.
 */
export async function resetRemoteData(): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  for (const step of resetSteps()) {
    let query = supabase.from(step.table).delete();
    // delete() verlangt einen Filter; "id ist nicht null" trifft alle eigenen Zeilen.
    query = step.only ? query.eq(step.only.column, step.only.value) : query.not('id', 'is', null);
    const { error } = await query;
    if (error) return fail(`${step.table}: ${error.message}`);
  }
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Stretching: eigener Bereich, eigene Tabellen (fit_stretch_*), gleiches Muster wie oben.

interface StretchExerciseRow {
  id: string;
  name_de: string;
  muscles: string[] | null;
  default_hold_seconds: number | null;
  /** Fehlt in Datenbanken ohne Migration 0015. */
  default_reps?: number | null;
  instructions_de?: string[] | null;
}

export async function fetchStretchExercises(): Promise<Result<StretchExerciseListItem[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // "default_reps" gibt es erst seit Migration 0015; ohne sie auf die ältere Spaltenliste
  // ausweichen, damit die App trotzdem lädt.
  let data: unknown[] | null = null;
  let lastError = '';
  for (const cols of [
    'id, name_de, muscles, default_hold_seconds, default_reps, instructions_de',
    'id, name_de, muscles, default_hold_seconds, default_reps',
    'id, name_de, muscles, default_hold_seconds',
  ]) {
    const res = await supabase
      .from('fit_stretch_exercises')
      .select(cols)
      .is('archived_at', null)
      .order('name_de');
    if (!res.error) {
      data = res.data;
      break;
    }
    lastError = res.error.message;
  }
  if (data === null) return fail(lastError);
  const rows = data as unknown as StretchExerciseRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name_de,
      muscles: r.muscles ?? [],
      defaultHoldSeconds: r.default_hold_seconds === null ? null : Number(r.default_hold_seconds),
      defaultReps: r.default_reps == null ? null : Number(r.default_reps),
      instructions: r.instructions_de ?? null,
    })),
  };
}

interface StretchHistoryRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  feeling_before: number | null;
  feeling_after: number | null;
  note: string | null;
  /** Fehlt in Datenbanken ohne Migration 0011. */
  calories?: number | null;
  avg_heart_rate?: number | null;
  fit_stretch_items: {
    stretch_exercise_id: string;
    position: number;
    side: StretchSide;
    hold_seconds: number | null;
    /** Fehlt in Datenbanken ohne Migration 0015. */
    reps?: number | null;
    sets: number;
  }[];
}

/** Abgeschlossene Stretching-Sessions mit ihren Übungen, neueste zuerst. */
export async function fetchStretchHistory(limit = 150): Promise<Result<HistStretchSession[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // "calories"/"avg_heart_rate" gibt es erst seit Migration 0011; ohne sie auf die
  // ältere Spaltenliste ausweichen, damit der Verlauf trotzdem lädt.
  // "reps" gibt es erst seit Migration 0015.
  const variants = [
    'id, started_at, finished_at, feeling_before, feeling_after, note, calories, avg_heart_rate, ' +
      'fit_stretch_items(stretch_exercise_id, position, side, hold_seconds, reps, sets)',
    'id, started_at, finished_at, feeling_before, feeling_after, note, calories, avg_heart_rate, ' +
      'fit_stretch_items(stretch_exercise_id, position, side, hold_seconds, sets)',
    'id, started_at, finished_at, feeling_before, feeling_after, note, ' +
      'fit_stretch_items(stretch_exercise_id, position, side, hold_seconds, sets)',
  ];
  let data: unknown[] | null = null;
  let lastError = '';
  for (const cols of variants) {
    const res = await supabase
      .from('fit_stretch_sessions')
      .select(cols)
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (!res.error) {
      data = res.data;
      break;
    }
    lastError = res.error.message;
  }
  if (data === null) return fail(lastError);
  const rows = data as unknown as StretchHistoryRow[];
  return {
    ok: true,
    data: rows.map((s) => ({
      id: s.id,
      startedAt: s.started_at,
      finishedAt: s.finished_at,
      feelingBefore: s.feeling_before,
      feelingAfter: s.feeling_after,
      note: s.note,
      calories: s.calories ?? null,
      avgHeartRate: s.avg_heart_rate ?? null,
      items: [...s.fit_stretch_items]
        .sort((a, b) => a.position - b.position)
        .map((it) => ({
          stretchExerciseId: it.stretch_exercise_id,
          side: it.side,
          holdSeconds: it.hold_seconds,
          reps: it.reps ?? null,
          sets: it.sets,
        })),
    })),
  };
}

/**
 * Schreibt eine Stretching-Session: neue eigene Dehnübungen, Session, Übungen.
 * Upsert über die Client-IDs, ein Wiederholen nach einem Abbruch erzeugt deshalb
 * keine Doppelten.
 */
export async function syncStretchPayload(p: StretchPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);

  const steps: [string, unknown[]][] = [
    ['fit_stretch_exercises', p.newExercises],
    ['fit_stretch_sessions', [p.session]],
    ['fit_stretch_items', p.items],
  ];
  for (const [table, rows] of steps) {
    if (rows.length === 0) continue;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) return fail(`${table}: ${error.message}`);
  }
  return { ok: true, data: null };
}

/** Versucht alle Stretching-Sessions im Ausgangskorb zu senden; Fehlgeschlagene bleiben liegen. */
export async function flushStretchOutbox(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const items = store.loadStretchOutbox();
  const remaining = [];
  let sent = 0;
  let error: string | null = null;
  for (const item of items) {
    const res = await syncStretchPayload(item);
    if (res.ok) sent += 1;
    else {
      remaining.push(item);
      error = res.error;
      console.error(`flushStretchOutbox: ${res.error}`);
    }
  }
  if (sent > 0) store.saveStretchOutbox(remaining);
  return { sent, pending: remaining.length, error };
}

interface StretchPlanDbRow {
  id: string;
  name: string;
  archived_at: string | null;
  fit_stretch_plan_items: {
    id: string;
    stretch_exercise_id: string;
    position: number;
    side: StretchSide;
    hold_seconds: number | null;
    /** Fehlt in Datenbanken ohne Migration 0015. */
    reps?: number | null;
    sets: number;
    archived_at: string | null;
  }[];
}

/** Archiviert (löscht "weich") eine Dehn-Vorlage; abgeschlossene Sessions bleiben erhalten. */
export async function archiveStretchPlan(planId: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase
    .from('fit_stretch_plans')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', planId);
  return error ? fail(error.message) : { ok: true, data: null };
}

/** Gespeicherte Dehn-Vorlagen mit ihren Übungen, in Anlegereihenfolge. */
export async function fetchStretchPlans(): Promise<Result<StretchPlan[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // "reps" gibt es erst seit Migration 0015; ohne sie auf die ältere Spaltenliste ausweichen.
  let data: unknown[] | null = null;
  let lastError = '';
  for (const itemCols of [
    'id, stretch_exercise_id, position, side, hold_seconds, reps, sets, archived_at',
    'id, stretch_exercise_id, position, side, hold_seconds, sets, archived_at',
  ]) {
    const res = await supabase
      .from('fit_stretch_plans')
      .select(`id, name, archived_at, fit_stretch_plan_items(${itemCols})`)
      .is('archived_at', null)
      .order('created_at');
    if (!res.error) {
      data = res.data;
      break;
    }
    lastError = res.error.message;
  }
  if (data === null) return fail(lastError);
  const rows = data as unknown as StretchPlanDbRow[];
  return {
    ok: true,
    data: rows.map((p) => ({
      id: p.id,
      name: p.name,
      items: [...p.fit_stretch_plan_items]
        .filter((it) => it.archived_at === null)
        .sort((a, b) => a.position - b.position)
        .map((it) => ({
          id: it.id,
          stretchExerciseId: it.stretch_exercise_id,
          side: it.side,
          holdSeconds: it.hold_seconds,
          reps: it.reps ?? null,
          sets: it.sets,
        })),
    })),
  };
}

/**
 * Speichert eine (neue oder bearbeitete) Dehn-Vorlage: neue eigene Übungen, Vorlage,
 * Einträge. Die neuen Einträge werden zuerst geschrieben (Upsert über die Client-IDs),
 * erst danach verschwinden die entfernten – bricht etwas ab, geht keine Vorlage verloren.
 */
export async function syncStretchPlan(p: StretchPlanPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);

  if (p.newExercises.length > 0) {
    const { error } = await supabase.from('fit_stretch_exercises').upsert(p.newExercises, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_exercises: ${error.message}`);
  }
  {
    const { error } = await supabase.from('fit_stretch_plans').upsert([p.plan], { onConflict: 'id' });
    if (error) return fail(`fit_stretch_plans: ${error.message}`);
  }
  {
    const { error } = await supabase.from('fit_stretch_plan_items').upsert(p.items, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_plan_items: ${error.message}`);
  }
  {
    const keep = p.items.map((it) => it.id).join(',');
    const { error } = await supabase
      .from('fit_stretch_plan_items')
      .delete()
      .eq('plan_id', p.plan.id)
      .not('id', 'in', `(${keep})`);
    if (error) return fail(`fit_stretch_plan_items: ${error.message}`);
  }
  return { ok: true, data: null };
}

/** Menge eines Katalog-Vorlageneintrags: eigene Angabe, sonst Standard der Übung (Wdh. oder Haltezeit). */
function catalogAmount(it: CatalogPlanItem): { hold_seconds: number | null; reps: number | null } {
  const ex = STRETCH_CATALOG.find((s) => s.id === it.stretchId);
  const reps = it.reps ?? (it.holdSeconds == null ? ex?.reps : undefined);
  if (reps != null) return { hold_seconds: null, reps };
  return { hold_seconds: it.holdSeconds ?? ex?.holdSeconds ?? 30, reps: null };
}

/**
 * Importiert den mitgelieferten Katalog häufiger Dehnübungen und fertiger Vorlagen
 * (Knopf in der App statt SQL-Skript). Feste IDs im Katalog machen die Übungen und
 * Vorlagen selbst idempotent (Upsert). Vorlagen, die es schon gibt, bleiben unangetastet,
 * damit eigene Änderungen (Name, Reihenfolge, Seiten, Mengen) einen erneuten Import
 * überstehen. Nur mit resetPlans werden ihre Einträge auf den Katalogstand zurückgesetzt.
 */
export async function importStretchCatalog(
  resetPlans = false,
): Promise<Result<{ exercises: number; plans: number }>> {
  if (!supabase) return fail(NOT_CONFIGURED);

  const exerciseRows = STRETCH_CATALOG.map((s) => ({
    id: s.id,
    name_de: s.name,
    muscles: s.muscles,
    default_hold_seconds: s.reps != null ? null : (s.holdSeconds ?? null),
    default_reps: s.reps ?? null,
    instructions_de: s.instructions,
  }));
  if (exerciseRows.length > 0) {
    const { error } = await supabase.from('fit_stretch_exercises').upsert(exerciseRows, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_exercises: ${error.message}`);
  }

  let catalogPlans = STRETCH_PLAN_CATALOG;
  if (!resetPlans) {
    const { data: existing, error } = await supabase
      .from('fit_stretch_plans')
      .select('id')
      .in('id', STRETCH_PLAN_CATALOG.map((p) => p.id));
    if (error) return fail(`fit_stretch_plans: ${error.message}`);
    const have = new Set((existing ?? []).map((r) => (r as { id: string }).id));
    catalogPlans = STRETCH_PLAN_CATALOG.filter((p) => !have.has(p.id));
  }

  const planRows = catalogPlans.map((p) => ({ id: p.id, name: p.name }));
  if (planRows.length > 0) {
    const { error } = await supabase.from('fit_stretch_plans').upsert(planRows, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_plans: ${error.message}`);
  }

  for (const plan of catalogPlans) {
    const { error: delError } = await supabase
      .from('fit_stretch_plan_items')
      .delete()
      .eq('plan_id', plan.id);
    if (delError) return fail(`fit_stretch_plan_items: ${delError.message}`);

    if (plan.items.length === 0) continue;
    const itemRows = plan.items.map((it, i) => ({
      id: newId(),
      plan_id: plan.id,
      stretch_exercise_id: it.stretchId,
      position: i + 1,
      side: it.side,
      ...catalogAmount(it),
      sets: it.sets ?? 1,
    }));
    const { error: insError } = await supabase.from('fit_stretch_plan_items').insert(itemRows);
    if (insError) return fail(`fit_stretch_plan_items: ${insError.message}`);
  }

  return { ok: true, data: { exercises: exerciseRows.length, plans: planRows.length } };
}


// ---------------------------------------------------------------------------
// Fußball: eigener, einfacher Bereich (eine Zeile pro Einheit/Spiel, kein Draft).

interface CardioRow {
  id: string;
  activity: CardioActivity | null;
  played_on: string;
  started_at: string | null;
  kind: FootballKind | null;
  minutes: number;
  rpe: number | null;
  note: string | null;
  distance_km: number | null;
  calories: number | null;
  steps: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  source: CardioSource;
}

/** Cardio-Einträge (Fußball, Laufen, Radfahren), neueste zuerst. */
export async function fetchCardioHistory(limit = 200): Promise<Result<HistCardioSession[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_cardio_sessions')
    .select(
      'id, activity, played_on, started_at, kind, minutes, rpe, note, distance_km, calories, steps, avg_heart_rate, max_heart_rate, source',
    )
    .order('played_on', { ascending: false })
    .limit(limit);
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as CardioRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      activity: parseCardioActivity(r.activity),
      playedOn: r.played_on,
      startedAt: r.started_at,
      kind: r.kind ?? null,
      minutes: r.minutes,
      rpe: r.rpe,
      note: r.note,
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      calories: r.calories,
      steps: r.steps,
      avgHeartRate: r.avg_heart_rate,
      maxHeartRate: r.max_heart_rate,
      source: r.source,
    })),
  };
}

/**
 * Schreibt einen Cardio-Eintrag. Upsert über die Client-ID, ein Sync-Versuch kann
 * deshalb gefahrlos wiederholt werden.
 */
export async function syncCardioPayload(p: CardioPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_cardio_sessions').upsert([p.session], { onConflict: 'id' });
  if (error) return fail(`fit_cardio_sessions: ${error.message}`);
  return { ok: true, data: null };
}

/** Versucht alle Cardio-Einträge im Ausgangskorb zu senden; Fehlgeschlagene bleiben liegen. */
export async function flushCardioOutbox(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const items = store.loadCardioOutbox();
  const remaining: CardioPayload[] = [];
  let sent = 0;
  let error: string | null = null;
  for (const item of items) {
    const res = await syncCardioPayload(item);
    if (res.ok) sent += 1;
    else {
      remaining.push(item);
      error = res.error;
      console.error(`flushCardioOutbox: ${res.error}`);
    }
  }
  if (sent > 0) store.saveCardioOutbox(remaining);
  return { sent, pending: remaining.length, error };
}

interface WatchRangeRow {
  from_at: string;
  to_at: string;
  received_at: string;
  hr_samples: number;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  steps: number | null;
  distance_km: number | string | null;
  energy_kcal: number | null;
}

const WATCH_RANGE_COLUMNS =
  'from_at, to_at, received_at, hr_samples, avg_heart_rate, max_heart_rate, steps, distance_km, energy_kcal';

function toWatchRange(r: WatchRangeRow): WatchRangeRecord {
  return {
    fromAt: r.from_at,
    toAt: r.to_at,
    receivedAt: r.received_at,
    hrSamples: r.hr_samples,
    avgHeartRate: r.avg_heart_rate,
    maxHeartRate: r.max_heart_rate,
    steps: r.steps,
    distanceKm: r.distance_km === null ? null : Number(r.distance_km),
    energyKcal: r.energy_kcal ?? null,
  };
}

/**
 * Apple-Watch-Ergebnis für genau diesen Zeitraum (befüllt die Edge Function football-import), oder
 * null, wenn dafür nichts angekommen ist. Von/Bis müssen mit dem übereinstimmen, was die App dem
 * Kurzbefehl übergeben hat (Sekundengenauigkeit, UTC).
 */
export async function fetchWatchRange(fromMs: number, toMs: number): Promise<Result<WatchRangeRecord | null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_watch_ranges')
    .select(WATCH_RANGE_COLUMNS)
    .eq('from_at', new Date(fromMs).toISOString())
    .eq('to_at', new Date(toMs).toISOString())
    .order('received_at', { ascending: false })
    .limit(1);
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as WatchRangeRow[];
  return { ok: true, data: rows.length > 0 ? toWatchRange(rows[0]) : null };
}

/**
 * Pulswerte des Health-Archivs für einen Zeitraum (für die Pulszonen einer Einheit), älteste zuerst.
 * Leer, wenn für den Zeitraum nichts archiviert ist.
 */
export async function fetchArchiveHr(fromMs: number, toMs: number): Promise<Result<HrPoint[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const PAGE = 1000;
  const points: HrPoint[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .from('fit_health_samples')
      .select('kind,start_at,end_at,value')
      .eq('kind', 'hr')
      .lt('start_at', new Date(toMs).toISOString())
      .gte('end_at', new Date(fromMs).toISOString())
      .order('start_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return fail(error.message);
    const batch = (data ?? []) as unknown as Array<{ kind: string; start_at: string; end_at: string; value: number | string }>;
    points.push(...hrPointsFromArchive(batch));
    if (batch.length < PAGE) break;
  }
  return { ok: true, data: points };
}

/** Das zuletzt eingegangene Apple-Watch-Ergebnis überhaupt (für die Fehlersuche), oder null. */
export async function fetchLatestWatchRange(): Promise<Result<WatchRangeRecord | null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_watch_ranges')
    .select(WATCH_RANGE_COLUMNS)
    .order('received_at', { ascending: false })
    .limit(1);
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as WatchRangeRow[];
  return { ok: true, data: rows.length > 0 ? toWatchRange(rows[0]) : null };
}

/**
 * Werte für einen Zeitraum aus dem Health-Archiv (fit_health_samples, Migration 0022): Samples, die den Zeitraum
 * überlappen, plus der Zeitpunkt des neuesten archivierten Pulses (für die Erklärung, falls nichts da ist).
 */
export async function fetchArchiveLookup(fromMs: number, toMs: number): Promise<Result<ArchiveLookup>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const PAGE = 1000;
  const rows: ArchiveRow[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await supabase
      .from('fit_health_samples')
      .select('kind,start_at,end_at,value,source')
      .lt('start_at', new Date(toMs).toISOString())
      .gte('end_at', new Date(fromMs).toISOString())
      .order('start_at', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return fail(error.message);
    const batch = (data ?? []) as unknown as ArchiveRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  const { data: last, error: lastError } = await supabase
    .from('fit_health_samples')
    .select('start_at')
    .eq('kind', 'hr')
    .order('start_at', { ascending: false })
    .limit(1);
  if (lastError) return fail(lastError.message);
  const lastHrAt = last && last.length > 0 ? ((last[0] as { start_at: string }).start_at) : null;
  return { ok: true, data: { summary: summarizeArchive(rows, fromMs, toMs), lastHrAt } };
}

/** Löscht einen Cardio-Eintrag endgültig. */
export async function deleteCardioSession(id: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_cardio_sessions').delete().eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}


// ---------------------------------------------------------------------------
// Bereichsübergreifender Apple-Health-Import: schreibt nachträglich Kalorien/Puls
// (bei Fußball auch Distanz) in bereits bestehende Einträge. Siehe lib/healthImport.ts
// für die Zuordnungslogik (welcher Eintrag bekommt welche Werte).

/** Ergänzt Kalorien/Ø Puls eines bestehenden Trainings; nur übergebene Felder werden gesetzt. */
export async function updateWorkoutHealth(
  id: string,
  patch: { calories?: number; avgHeartRate?: number },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number> = {};
  if (patch.calories !== undefined) row.calories = patch.calories;
  if (patch.avgHeartRate !== undefined) row.avg_heart_rate = patch.avgHeartRate;
  if (Object.keys(row).length === 0) return { ok: true, data: null };
  const { error } = await supabase.from('fit_workouts').update(row).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

/** Ergänzt Kalorien/Ø Puls einer bestehenden Stretching-Session; nur übergebene Felder werden gesetzt. */
export async function updateStretchHealth(
  id: string,
  patch: { calories?: number; avgHeartRate?: number },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number> = {};
  if (patch.calories !== undefined) row.calories = patch.calories;
  if (patch.avgHeartRate !== undefined) row.avg_heart_rate = patch.avgHeartRate;
  if (Object.keys(row).length === 0) return { ok: true, data: null };
  const { error } = await supabase.from('fit_stretch_sessions').update(row).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

/** Ergänzt Distanz/Kalorien/Ø Puls eines bestehenden Cardio-Eintrags; nur übergebene Felder werden gesetzt. */
export async function updateCardioHealth(
  id: string,
  patch: { distanceKm?: number; calories?: number; avgHeartRate?: number },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number | string> = { source: 'apple_health' };
  if (patch.distanceKm !== undefined) row.distance_km = patch.distanceKm;
  if (patch.calories !== undefined) row.calories = patch.calories;
  if (patch.avgHeartRate !== undefined) row.avg_heart_rate = patch.avgHeartRate;
  const { error } = await supabase.from('fit_cardio_sessions').update(row).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

/** Ergänzt HRV/Ruhepuls/Schlafdauer eines bestehenden Recovery-Eintrags; nur übergebene Felder werden gesetzt. */
export async function updateRecoveryHealth(
  id: string,
  patch: {
    hrvMs?: number;
    restingHr?: number;
    sleepHours?: number;
    sleepStart?: string;
    sleepEnd?: string;
    deepSleepMin?: number;
    remSleepMin?: number;
  },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number | string> = { source: 'apple_health' };
  if (patch.hrvMs !== undefined) row.hrv_ms = patch.hrvMs;
  if (patch.restingHr !== undefined) row.resting_hr = patch.restingHr;
  if (patch.sleepHours !== undefined) row.sleep_hours = patch.sleepHours;
  if (patch.sleepStart !== undefined) row.sleep_start = patch.sleepStart;
  if (patch.sleepEnd !== undefined) row.sleep_end = patch.sleepEnd;
  if (patch.deepSleepMin !== undefined) row.deep_sleep_min = patch.deepSleepMin;
  if (patch.remSleepMin !== undefined) row.rem_sleep_min = patch.remSleepMin;
  let { error } = await supabase.from('fit_recovery_entries').update(row).eq('id', id);
  if (error && /(deep|rem)_sleep_min/.test(error.message)) {
    // Migration 0018 noch nicht ausgeführt: ohne Tief-/REM-Minuten weiter.
    delete row.deep_sleep_min;
    delete row.rem_sleep_min;
    ({ error } = await supabase.from('fit_recovery_entries').update(row).eq('id', id));
  }
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

/** Eingang mit Apple-Health-Werten, die vor dem Tageseintrag ankamen (Migration 0017). */
export async function fetchRecoveryInbox(): Promise<Result<RecoveryInboxRow[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  let { data, error } = await supabase
    .from('fit_recovery_health_inbox')
    .select('date, hrv_ms, resting_hr, sleep_hours, sleep_start, sleep_end, deep_sleep_min, rem_sleep_min')
    .order('date', { ascending: false })
    .limit(14);
  if (error && /(deep|rem)_sleep_min/.test(error.message)) {
    // Migration 0018 noch nicht ausgeführt: Eingang ohne Tief-/REM-Minuten lesen.
    const fallback = await supabase
      .from('fit_recovery_health_inbox')
      .select('date, hrv_ms, resting_hr, sleep_hours, sleep_start, sleep_end')
      .order('date', { ascending: false })
      .limit(14);
    data = fallback.data as typeof data;
    error = fallback.error;
  }
  if (error) return fail(error.message); // z. B. Migration 0017 noch nicht ausgeführt
  const rows = (data ?? []) as unknown as {
    date: string; hrv_ms: number | string | null; resting_hr: number | null;
    sleep_hours: number | string | null; sleep_start: string | null; sleep_end: string | null;
    deep_sleep_min?: number | null; rem_sleep_min?: number | null;
  }[];
  return {
    ok: true,
    data: rows.map((r) => ({
      date: r.date,
      hrvMs: r.hrv_ms === null ? null : Number(r.hrv_ms),
      restingHr: r.resting_hr,
      sleepHours: r.sleep_hours === null ? null : Number(r.sleep_hours),
      sleepStart: r.sleep_start,
      sleepEnd: r.sleep_end,
      deepSleepMin: r.deep_sleep_min ?? null,
      remSleepMin: r.rem_sleep_min ?? null,
    })),
  };
}

export async function deleteRecoveryInboxRow(date: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_recovery_health_inbox').delete().eq('date', date);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

// ---------------------------------------------------------------------------
// Recovery: eigener, einfacher Bereich (eine Zeile pro Tag, kein Draft), gleiches
// Muster wie Fußball.

interface RecoveryRow {
  id: string;
  date: string;
  perceived_recovery: number;
  soreness: number | null;
  stress: number | null;
  sleep_quality: number | null;
  note: string | null;
  hrv_ms: number | string | null;
  resting_hr: number | null;
  sleep_hours: number | string | null;
  /** Erst seit Migration 0016 vorhanden. */
  sleep_start?: string | null;
  sleep_end?: string | null;
  /** Erst seit Migration 0018 vorhanden. */
  deep_sleep_min?: number | null;
  rem_sleep_min?: number | null;
  source: RecoverySource;
}

/** Recovery-Einträge, neueste zuerst. */
export async function fetchRecoveryHistory(limit = 200): Promise<Result<HistRecoveryEntry[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const baseColumns =
    'id, date, perceived_recovery, soreness, stress, sleep_quality, note, hrv_ms, resting_hr, sleep_hours, source';
  let res: { data: unknown; error: { message: string } | null } = await supabase
    .from('fit_recovery_entries')
    .select(`${baseColumns}, sleep_start, sleep_end, deep_sleep_min, rem_sleep_min`)
    .order('date', { ascending: false })
    .limit(limit);
  if (res.error && /(deep|rem)_sleep_min/.test(res.error.message)) {
    // Migration 0018 noch nicht ausgeführt: weiter ohne Tief-/REM-Minuten.
    res = await supabase
      .from('fit_recovery_entries')
      .select(`${baseColumns}, sleep_start, sleep_end`)
      .order('date', { ascending: false })
      .limit(limit);
  }
  if (res.error && /sleep_(start|end)/.test(res.error.message)) {
    // Migration 0016 noch nicht ausgeführt: weiter ohne Schlafzeit statt den Bereich zu sperren.
    res = await supabase
      .from('fit_recovery_entries')
      .select(baseColumns)
      .order('date', { ascending: false })
      .limit(limit);
  }
  const { data, error } = res;
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as RecoveryRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      date: r.date,
      perceivedRecovery: r.perceived_recovery,
      soreness: r.soreness,
      stress: r.stress,
      sleepQuality: r.sleep_quality,
      note: r.note,
      hrvMs: r.hrv_ms === null ? null : Number(r.hrv_ms),
      restingHr: r.resting_hr,
      sleepHours: r.sleep_hours === null ? null : Number(r.sleep_hours),
      sleepStart: r.sleep_start ?? null,
      sleepEnd: r.sleep_end ?? null,
      deepSleepMin: r.deep_sleep_min ?? null,
      remSleepMin: r.rem_sleep_min ?? null,
      source: r.source,
    })),
  };
}

/**
 * Schreibt einen Recovery-Eintrag. Upsert über die Client-ID, ein Sync-Versuch kann
 * deshalb gefahrlos wiederholt werden. Existiert für den Tag bereits ein Eintrag
 * (unique user_id+date), meldet Supabase einen Konflikt statt still zu überschreiben –
 * Korrektur erfolgt wie bei Fußball durch Löschen und Neuanlegen.
 */
export async function syncRecoveryPayload(p: RecoveryPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_recovery_entries').upsert([p.entry], { onConflict: 'id' });
  if (error) return fail(`fit_recovery_entries: ${error.message}`);
  return { ok: true, data: null };
}

/** Versucht alle Recovery-Einträge im Ausgangskorb zu senden; Fehlgeschlagene bleiben liegen. */
export async function flushRecoveryOutbox(store: Store): Promise<{ sent: number; pending: number; error: string | null }> {
  const items = store.loadRecoveryOutbox();
  const remaining: RecoveryPayload[] = [];
  let sent = 0;
  let error: string | null = null;
  for (const item of items) {
    const res = await syncRecoveryPayload(item);
    if (res.ok) sent += 1;
    else {
      remaining.push(item);
      error = res.error;
      console.error(`flushRecoveryOutbox: ${res.error}`);
    }
  }
  if (sent > 0) store.saveRecoveryOutbox(remaining);
  return { sent, pending: remaining.length, error };
}

/** Löscht einen Recovery-Eintrag endgültig. */
export async function deleteRecoveryEntry(id: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_recovery_entries').delete().eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}
