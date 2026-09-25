import { supabase } from '../supabase';
import { translateAuthError } from './authErrors';
import type { Plan, PlanDbRow, PlanRows } from './plan';
import { plansFromRows } from './plan';
import type { LoggedSet } from './progression';
import type { ExerciseListItem, Store } from './storage';
import type { WorkoutPayload } from './workout';

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
  increment_kg: number;
  equipment_kg: number | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
}

export async function fetchExercises(): Promise<Result<ExerciseListItem[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_exercises')
    .select('id, name_de, increment_kg, equipment_kg, primary_muscles, secondary_muscles')
    .is('archived_at', null)
    .order('name_de');
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as ExerciseRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      id: r.id,
      name: r.name_de,
      incrementKg: Number(r.increment_kg),
      equipmentKg: r.equipment_kg === null ? null : Number(r.equipment_kg),
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
}

/** Sätze des letzten abgeschlossenen Trainings dieser Übung (View fit_last_sets). */
export async function fetchLastSets(exerciseId: string): Promise<Result<LoggedSet[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_last_sets')
    .select('type, weight_kg, reps, rir')
    .eq('exercise_id', exerciseId)
    .order('set_number');
  if (error) return fail(error.message);
  const rows = (data ?? []) as unknown as LastSetRow[];
  return {
    ok: true,
    data: rows.map((r) => ({
      type: r.type,
      weightKg: Number(r.weight_kg),
      reps: r.reps,
      rir: r.rir,
    })),
  };
}

export async function fetchPlans(
  namesById: Record<string, string | undefined>,
): Promise<Result<Plan[]>> {
  if (!supabase) return fail(NOT_CONFIGURED);
  const { data, error } = await supabase
    .from('fit_plans')
    .select(
      'id, name, archived_at, fit_plan_days(id, name, position, archived_at, ' +
        'fit_plan_exercises(id, exercise_id, position, sets, rep_min, rep_max, target_rir, rest_seconds, archived_at))',
    )
    .is('archived_at', null)
    .order('created_at');
  if (error) return fail(error.message);
  return { ok: true, data: plansFromRows((data ?? []) as unknown as PlanDbRow[], namesById) };
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
