import { supabase } from '../supabase';
import { translateAuthError } from './authErrors';
import type { Plan, PlanDbRow, PlanRows } from './plan';
import { resetSteps } from './reset';
import { plansFromRows } from './plan';
import type { StretchPayload, StretchPlan, StretchSide } from './stretch';
import { STRETCH_CATALOG, STRETCH_PLAN_CATALOG } from './stretchCatalog';
import type { FootballKind, FootballPayload, FootballSource } from './football';
import type { RecoveryPayload, RecoverySource } from './recovery';
import type { HistWorkout } from './stats';
import type {
  ExerciseListItem,
  HistFootballSession,
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
  let res = await load('type, weight_kg, reps, rir, equipment_kg');
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
    fit_sets: { type: 'warmup' | 'working'; weight_kg: number | string; reps: number; set_number: number }[];
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
  let data: unknown[] | null = null;
  let lastError = '';
  for (const cols of variants) {
    const res = await supabase
      .from('fit_workouts')
      .select(
        `${cols}fit_workout_exercises(exercise_id, position, equipment_kg, fit_sets(type, weight_kg, reps, set_number))`,
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
            .map((s) => ({ type: s.type, weightKg: Number(s.weight_kg), reps: s.reps })),
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
    if (error) return fail(`${table}: ${error.message}`);
  }
  return { ok: true, data: null };
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
export async function flushOutbox(store: Store): Promise<{ sent: number; pending: number }> {
  const items = store.loadOutbox();
  const remaining = [];
  let sent = 0;
  for (const item of items) {
    const res = await syncPayload(item);
    if (res.ok) sent += 1;
    else remaining.push(item);
  }
  if (sent > 0) store.saveOutbox(remaining);
  return { sent, pending: remaining.length };
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
}

export async function fetchStretchExercises(): Promise<Result<StretchExerciseListItem[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_stretch_exercises')
    .select('id, name_de, muscles, default_hold_seconds')
    .is('archived_at', null)
    .order('name_de');
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as StretchExerciseRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name_de,
      muscles: r.muscles ?? [],
      defaultHoldSeconds: r.default_hold_seconds === null ? null : Number(r.default_hold_seconds),
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
    hold_seconds: number;
    sets: number;
  }[];
}

/** Abgeschlossene Stretching-Sessions mit ihren Übungen, neueste zuerst. */
export async function fetchStretchHistory(limit = 150): Promise<Result<HistStretchSession[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  // "calories"/"avg_heart_rate" gibt es erst seit Migration 0011; ohne sie auf die
  // ältere Spaltenliste ausweichen, damit der Verlauf trotzdem lädt.
  const variants = [
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
export async function flushStretchOutbox(store: Store): Promise<{ sent: number; pending: number }> {
  const items = store.loadStretchOutbox();
  const remaining = [];
  let sent = 0;
  for (const item of items) {
    const res = await syncStretchPayload(item);
    if (res.ok) sent += 1;
    else remaining.push(item);
  }
  if (sent > 0) store.saveStretchOutbox(remaining);
  return { sent, pending: remaining.length };
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
    hold_seconds: number;
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
  const { data, error } = await supabase
    .from('fit_stretch_plans')
    .select(
      'id, name, archived_at, ' +
        'fit_stretch_plan_items(id, stretch_exercise_id, position, side, hold_seconds, sets, archived_at)',
    )
    .is('archived_at', null)
    .order('created_at');
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as StretchPlanDbRow[];
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
          sets: it.sets,
        })),
    })),
  };
}

/**
 * Importiert den mitgelieferten Katalog häufiger Dehnübungen und fertiger Vorlagen
 * (Knopf in der App statt SQL-Skript). Feste IDs im Katalog machen die Übungen und
 * Vorlagen selbst idempotent (Upsert); die Vorlagen-Einträge werden je Vorlage neu
 * geschrieben, ein erneuter Import ersetzt sie also sauber statt sie zu verdoppeln.
 */
export async function importStretchCatalog(): Promise<Result<{ exercises: number; plans: number }>> {
  if (!supabase) return fail(NOT_CONFIGURED);

  const exerciseRows = STRETCH_CATALOG.map((s) => ({
    id: s.id,
    name_de: s.name,
    muscles: s.muscles,
    default_hold_seconds: s.holdSeconds,
  }));
  if (exerciseRows.length > 0) {
    const { error } = await supabase.from('fit_stretch_exercises').upsert(exerciseRows, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_exercises: ${error.message}`);
  }

  const planRows = STRETCH_PLAN_CATALOG.map((p) => ({ id: p.id, name: p.name }));
  if (planRows.length > 0) {
    const { error } = await supabase.from('fit_stretch_plans').upsert(planRows, { onConflict: 'id' });
    if (error) return fail(`fit_stretch_plans: ${error.message}`);
  }

  for (const plan of STRETCH_PLAN_CATALOG) {
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
      hold_seconds:
        it.holdSeconds ?? STRETCH_CATALOG.find((s) => s.id === it.stretchId)?.holdSeconds ?? 30,
      sets: it.sets ?? 1,
    }));
    const { error: insError } = await supabase.from('fit_stretch_plan_items').insert(itemRows);
    if (insError) return fail(`fit_stretch_plan_items: ${insError.message}`);
  }

  return { ok: true, data: { exercises: exerciseRows.length, plans: planRows.length } };
}


// ---------------------------------------------------------------------------
// Fußball: eigener, einfacher Bereich (eine Zeile pro Einheit/Spiel, kein Draft).

interface FootballRow {
  id: string;
  played_on: string;
  started_at: string | null;
  kind: FootballKind;
  minutes: number;
  rpe: number;
  note: string | null;
  distance_km: number | null;
  calories: number | null;
  avg_heart_rate: number | null;
  source: FootballSource;
}

/** Fußball-Einträge, neueste zuerst. */
export async function fetchFootballHistory(limit = 200): Promise<Result<HistFootballSession[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_football_sessions')
    .select(
      'id, played_on, started_at, kind, minutes, rpe, note, distance_km, calories, avg_heart_rate, source',
    )
    .order('played_on', { ascending: false })
    .limit(limit);
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as FootballRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      playedOn: r.played_on,
      startedAt: r.started_at,
      kind: r.kind,
      minutes: r.minutes,
      rpe: r.rpe,
      note: r.note,
      distanceKm: r.distance_km === null ? null : Number(r.distance_km),
      calories: r.calories,
      avgHeartRate: r.avg_heart_rate,
      source: r.source,
    })),
  };
}

/**
 * Schreibt einen Fußball-Eintrag. Upsert über die Client-ID, ein Sync-Versuch kann
 * deshalb gefahrlos wiederholt werden.
 */
export async function syncFootballPayload(p: FootballPayload): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_football_sessions').upsert([p.session], { onConflict: 'id' });
  if (error) return fail(`fit_football_sessions: ${error.message}`);
  return { ok: true, data: null };
}

/** Versucht alle Fußball-Einträge im Ausgangskorb zu senden; Fehlgeschlagene bleiben liegen. */
export async function flushFootballOutbox(store: Store): Promise<{ sent: number; pending: number }> {
  const items = store.loadFootballOutbox();
  const remaining: FootballPayload[] = [];
  let sent = 0;
  for (const item of items) {
    const res = await syncFootballPayload(item);
    if (res.ok) sent += 1;
    else remaining.push(item);
  }
  if (sent > 0) store.saveFootballOutbox(remaining);
  return { sent, pending: remaining.length };
}

/** Löscht einen Fußball-Eintrag endgültig. */
export async function deleteFootballSession(id: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_football_sessions').delete().eq('id', id);
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

/** Ergänzt Distanz/Kalorien/Ø Puls eines bestehenden Fußball-Eintrags; nur übergebene Felder werden gesetzt. */
export async function updateFootballHealth(
  id: string,
  patch: { distanceKm?: number; calories?: number; avgHeartRate?: number },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number | string> = { source: 'apple_health' };
  if (patch.distanceKm !== undefined) row.distance_km = patch.distanceKm;
  if (patch.calories !== undefined) row.calories = patch.calories;
  if (patch.avgHeartRate !== undefined) row.avg_heart_rate = patch.avgHeartRate;
  const { error } = await supabase.from('fit_football_sessions').update(row).eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}

/** Ergänzt HRV/Ruhepuls/Schlafdauer eines bestehenden Recovery-Eintrags; nur übergebene Felder werden gesetzt. */
export async function updateRecoveryHealth(
  id: string,
  patch: { hrvMs?: number; restingHr?: number; sleepHours?: number },
): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const row: Record<string, number | string> = { source: 'apple_health' };
  if (patch.hrvMs !== undefined) row.hrv_ms = patch.hrvMs;
  if (patch.restingHr !== undefined) row.resting_hr = patch.restingHr;
  if (patch.sleepHours !== undefined) row.sleep_hours = patch.sleepHours;
  const { error } = await supabase.from('fit_recovery_entries').update(row).eq('id', id);
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
  source: RecoverySource;
}

/** Recovery-Einträge, neueste zuerst. */
export async function fetchRecoveryHistory(limit = 200): Promise<Result<HistRecoveryEntry[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_recovery_entries')
    .select(
      'id, date, perceived_recovery, soreness, stress, sleep_quality, note, hrv_ms, resting_hr, sleep_hours, source',
    )
    .order('date', { ascending: false })
    .limit(limit);
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
export async function flushRecoveryOutbox(store: Store): Promise<{ sent: number; pending: number }> {
  const items = store.loadRecoveryOutbox();
  const remaining: RecoveryPayload[] = [];
  let sent = 0;
  for (const item of items) {
    const res = await syncRecoveryPayload(item);
    if (res.ok) sent += 1;
    else remaining.push(item);
  }
  if (sent > 0) store.saveRecoveryOutbox(remaining);
  return { sent, pending: remaining.length };
}

/** Löscht einen Recovery-Eintrag endgültig. */
export async function deleteRecoveryEntry(id: string): Promise<Result<null>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { error } = await supabase.from('fit_recovery_entries').delete().eq('id', id);
  if (error) return fail(error.message);
  return { ok: true, data: null };
}
