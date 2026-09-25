import type { LoggedSet } from './progression';
import type { ExerciseListItem } from './storage';
import {
  addExercise,
  addWarmups,
  createDraft,
  newId,
  type Draft,
  type NewExerciseRow,
} from './workout';

/**
 * Trainingspläne: Plan -> Tage (z. B. Push, Pull, Lower) -> Übungen.
 * Reine Logik ohne Browser- oder Datenbankzugriff, alle Funktionen geben neue
 * Objekte zurück.
 *
 * Entfernte Einträge werden nicht gelöscht, sondern archiviert (archived = true),
 * damit die Historie vergangener Trainings erhalten bleibt.
 */

export interface PlanExercise {
  id: string;
  exerciseId: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number | null;
  restSeconds: number;
  /** Geplantes Arbeitsgewicht in kg (ohne Stange/Maschine); null = nicht festgelegt. */
  weightKg: number | null;
  /** Stangen-/Maschinengewicht, das zum Gewicht dazukommt; null = keins. */
  equipmentKg: number | null;
  /** true = im Training werden vor den Arbeitssätzen Aufwärmsätze vorgeschlagen. */
  warmup: boolean;
  /** Freitext, z. B. Sitzeinstellung der Maschine; leer = keine Notiz. */
  note: string;
  /** Nur bei eigenen Übungen, die beim Speichern des Plans erst angelegt werden. */
  newExercise: {
    equipment: string | null;
    primaryMuscles: string[];
    secondaryMuscles: string[];
  } | null;
  archived: boolean;
  /** true = noch nie gespeichert, kann beim Entfernen komplett verworfen werden. */
  isNew: boolean;
}

export interface PlanDay {
  id: string;
  name: string;
  exercises: PlanExercise[];
  archived: boolean;
  isNew: boolean;
}

/**
 * 'plan' = Plan mit mehreren Trainingstagen und Rotation (Push -> Pull -> Lower).
 * 'template' = einzelne Vorlage: ein Plan mit genau einem Tag, der Name der Vorlage
 * ist zugleich der Name des Tages.
 */
export type PlanKind = 'plan' | 'template';

export interface Plan {
  id: string;
  kind: PlanKind;
  name: string;
  days: PlanDay[];
  archived: boolean;
  isNew: boolean;
}

export interface PlanExerciseInput {
  exerciseId: string;
  name: string;
  isNew: boolean;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  sets?: number;
  repMin?: number;
  repMax?: number;
  targetRir?: number | null;
  restSeconds?: number;
  warmup?: boolean;
  note?: string;
  weightKg?: number | null;
  equipmentKg?: number | null;
}

export const visibleDays = (plan: Plan): PlanDay[] => plan.days.filter((d) => !d.archived);
export const visibleExercises = (day: PlanDay): PlanExercise[] =>
  day.exercises.filter((e) => !e.archived);

export function newPlan(name = ''): Plan {
  return { id: newId(), kind: 'plan', name, days: [], archived: false, isNew: true };
}

/** Neue einzelne Vorlage: ein Plan mit einem (noch leeren) Tag. */
export function newTemplate(name = ''): Plan {
  const day: PlanDay = { id: newId(), name, exercises: [], archived: false, isNew: true };
  return { id: newId(), kind: 'template', name, days: [day], archived: false, isNew: true };
}

/** Der einzige sichtbare Tag einer Vorlage (bei Plänen der erste Tag). */
export function templateDay(plan: Plan): PlanDay | null {
  return visibleDays(plan)[0] ?? null;
}

/**
 * Übernimmt eine Vorlage als neuen Tag in einen Plan. Es ist eine Kopie: Spätere
 * Änderungen an der Vorlage ändern den Plan nicht und umgekehrt.
 */
export function addDayFromTemplate(plan: Plan, template: Plan): Plan {
  const src = templateDay(template);
  if (!src) return plan;
  const day: PlanDay = {
    id: newId(),
    name: template.name,
    archived: false,
    isNew: true,
    exercises: visibleExercises(src).map((e) => ({
      ...e,
      id: newId(),
      newExercise: null,
      archived: false,
      isNew: true,
    })),
  };
  return { ...plan, days: [...plan.days, day] };
}

/** Kurztext für eine Übung im Plan, z. B. "3 × 8–12 · RIR 2 · 2:00 min". */
export function summarizePlanExercise(e: PlanExercise): string {
  const parts = [`${e.sets} × ${e.repMin === e.repMax ? e.repMin : `${e.repMin}–${e.repMax}`}`];
  if (e.weightKg !== null && e.weightKg > 0) {
    const w = String(e.weightKg).replace('.', ',');
    parts.push(e.equipmentKg ? `${w} kg (+${String(e.equipmentKg).replace('.', ',')})` : `${w} kg`);
  }
  const m = Math.floor(e.restSeconds / 60);
  const s = e.restSeconds % 60;
  parts.push(`${m}:${String(s).padStart(2, '0')} min`);
  if (e.warmup) parts.push('Aufwärmen');
  return parts.join(' · ');
}

export function setPlanName(plan: Plan, name: string): Plan {
  return { ...plan, name };
}

export function addDay(plan: Plan, name = ''): Plan {
  const day: PlanDay = { id: newId(), name, exercises: [], archived: false, isNew: true };
  return { ...plan, days: [...plan.days, day] };
}

function mapDay(plan: Plan, dayId: string, fn: (d: PlanDay) => PlanDay): Plan {
  return { ...plan, days: plan.days.map((d) => (d.id === dayId ? fn(d) : d)) };
}

export function renameDay(plan: Plan, dayId: string, name: string): Plan {
  return mapDay(plan, dayId, (d) => ({ ...d, name }));
}

/** Entfernt einen Tag: nie gespeicherte Tage verschwinden, gespeicherte werden archiviert. */
export function removeDay(plan: Plan, dayId: string): Plan {
  const day = plan.days.find((d) => d.id === dayId);
  if (!day) return plan;
  if (day.isNew) return { ...plan, days: plan.days.filter((d) => d.id !== dayId) };
  return mapDay(plan, dayId, (d) => ({ ...d, archived: true }));
}

/** Verschiebt ein Element um eine Stelle unter den sichtbaren (nicht archivierten). */
function moveVisible<T extends { archived: boolean }>(items: T[], index: number, dir: -1 | 1): T[] {
  const visible = items.map((it, i) => ({ it, i })).filter((x) => !x.it.archived);
  const pos = visible.findIndex((x) => x.i === index);
  const target = pos + dir;
  if (pos === -1 || target < 0 || target >= visible.length) return items;
  const a = visible[pos].i;
  const b = visible[target].i;
  const copy = [...items];
  [copy[a], copy[b]] = [copy[b], copy[a]];
  return copy;
}

export function moveDay(plan: Plan, dayId: string, dir: -1 | 1): Plan {
  const idx = plan.days.findIndex((d) => d.id === dayId);
  const days = moveVisible(plan.days, idx, dir);
  return days === plan.days ? plan : { ...plan, days };
}

export function addPlanExercise(plan: Plan, dayId: string, input: PlanExerciseInput): Plan {
  const ex: PlanExercise = {
    id: newId(),
    exerciseId: input.exerciseId,
    name: input.name,
    sets: input.sets ?? 3,
    repMin: input.repMin ?? 8,
    repMax: input.repMax ?? 12,
    targetRir: input.targetRir ?? null,
    restSeconds: input.restSeconds ?? 120,
    warmup: input.warmup ?? false,
    note: input.note ?? '',
    weightKg: input.weightKg ?? null,
    equipmentKg: input.equipmentKg ?? null,
    newExercise: input.isNew
      ? {
          equipment: input.equipment ?? null,
          primaryMuscles: input.primaryMuscles ?? [],
          secondaryMuscles: input.secondaryMuscles ?? [],
        }
      : null,
    archived: false,
    isNew: true,
  };
  return mapDay(plan, dayId, (d) => ({ ...d, exercises: [...d.exercises, ex] }));
}

export function updatePlanExercise(
  plan: Plan,
  dayId: string,
  exId: string,
  patch: Partial<
    Pick<
      PlanExercise,
      'sets' | 'repMin' | 'repMax' | 'targetRir' | 'restSeconds' | 'warmup' | 'note' | 'weightKg' | 'equipmentKg'
    >
  >,
): Plan {
  return mapDay(plan, dayId, (d) => ({
    ...d,
    exercises: d.exercises.map((e) => (e.id === exId ? { ...e, ...patch } : e)),
  }));
}

export function removePlanExercise(plan: Plan, dayId: string, exId: string): Plan {
  return mapDay(plan, dayId, (d) => {
    const ex = d.exercises.find((e) => e.id === exId);
    if (!ex) return d;
    if (ex.isNew) return { ...d, exercises: d.exercises.filter((e) => e.id !== exId) };
    return { ...d, exercises: d.exercises.map((e) => (e.id === exId ? { ...e, archived: true } : e)) };
  });
}

export function movePlanExercise(plan: Plan, dayId: string, exId: string, dir: -1 | 1): Plan {
  const day = plan.days.find((d) => d.id === dayId);
  if (!day) return plan;
  const exercises = moveVisible(
    day.exercises,
    day.exercises.findIndex((e) => e.id === exId),
    dir,
  );
  return exercises === day.exercises ? plan : mapDay(plan, dayId, (d) => ({ ...d, exercises }));
}

// ---------------------------------------------------------------------------
// Prüfen

/** Liefert verständliche Fehlermeldungen; leere Liste = Plan ist speicherbar. */
export function validatePlan(plan: Plan): string[] {
  const errors: string[] = [];
  const isTemplate = plan.kind === 'template';
  if (plan.name.trim() === '') {
    errors.push(isTemplate ? 'Die Vorlage braucht einen Namen.' : 'Der Plan braucht einen Namen.');
  }
  const days = visibleDays(plan);
  if (days.length === 0) errors.push('Der Plan braucht mindestens einen Trainingstag.');

  days.forEach((day, i) => {
    // Bei einer Vorlage ist der Name der Vorlage zugleich der Tagesname.
    const label = isTemplate
      ? `„${plan.name.trim()}"`
      : day.name.trim() === ''
        ? `Tag ${i + 1}`
        : `„${day.name.trim()}"`;
    if (!isTemplate && day.name.trim() === '') errors.push(`Tag ${i + 1} braucht einen Namen.`);
    const exs = visibleExercises(day);
    if (exs.length === 0) errors.push(`${label} hat noch keine Übung.`);
    if (isTemplate && days.length > 1) errors.push('Eine Vorlage hat genau einen Tag.');
    for (const e of exs) {
      if (!Number.isInteger(e.sets) || e.sets < 1 || e.sets > 10)
        errors.push(`${label}, ${e.name}: Sätze müssen zwischen 1 und 10 liegen.`);
      if (!Number.isInteger(e.repMin) || e.repMin < 1)
        errors.push(`${label}, ${e.name}: Untergrenze der Wiederholungen muss mindestens 1 sein.`);
      if (!Number.isInteger(e.repMax) || e.repMax < e.repMin)
        errors.push(`${label}, ${e.name}: Obergrenze darf nicht unter der Untergrenze liegen.`);
      if (e.targetRir !== null && (!Number.isInteger(e.targetRir) || e.targetRir < 0 || e.targetRir > 5))
        errors.push(`${label}, ${e.name}: Ziel-RIR muss zwischen 0 und 5 liegen.`);
      if (!Number.isInteger(e.restSeconds) || e.restSeconds < 1)
        errors.push(`${label}, ${e.name}: Pause muss größer als 0 sein.`);
      for (const [what, v] of [['Gewicht', e.weightKg], ['Stangen-/Maschinengewicht', e.equipmentKg]] as const) {
        if (v !== null && (!Number.isFinite(v) || v < 0 || v > 999 || Math.abs(v * 4 - Math.round(v * 4)) > 1e-9))
          errors.push(`${label}, ${e.name}: ${what} muss zwischen 0 und 999 kg liegen (in 0,25-kg-Schritten).`);
      }
    }
  });
  return errors;
}

// ---------------------------------------------------------------------------
// Speichern: Plan -> Datenbankzeilen

export interface PlanRows {
  newExercises: NewExerciseRow[];
  plan: { id: string; name: string; kind: PlanKind; archived_at: string | null };
  days: { id: string; plan_id: string; name: string; position: number; archived_at: string | null }[];
  exercises: {
    id: string;
    plan_day_id: string;
    exercise_id: string;
    position: number;
    sets: number;
    rep_min: number;
    rep_max: number;
    target_rir: number | null;
    rest_seconds: number;
    warmup: boolean;
    note: string | null;
    weight_kg: number | null;
    equipment_kg: number | null;
    archived_at: string | null;
  }[];
}

/**
 * Baut die Zeilen für die Datenbank. Nie gespeicherte und gleichzeitig entfernte
 * Einträge werden übersprungen. Alle IDs stammen vom Client, ein erneuter
 * Speicherversuch ist also gefahrlos (Upsert).
 */
export function planToRows(plan: Plan, now: Date): PlanRows {
  const ts = now.toISOString();
  const rows: PlanRows = {
    newExercises: [],
    plan: { id: plan.id, name: plan.name.trim(), kind: plan.kind, archived_at: plan.archived ? ts : null },
    days: [],
    exercises: [],
  };
  const seenNew = new Set<string>();

  plan.days.forEach((day, di) => {
    if (day.archived && day.isNew) return;
    rows.days.push({
      id: day.id,
      plan_id: plan.id,
      name: plan.kind === 'template' ? plan.name.trim() : day.name.trim(),
      position: di + 1,
      archived_at: day.archived ? ts : null,
    });
    day.exercises.forEach((ex, ei) => {
      if (ex.archived && ex.isNew) return;
      if (ex.newExercise && !ex.archived && !seenNew.has(ex.exerciseId)) {
        seenNew.add(ex.exerciseId);
        rows.newExercises.push({
          id: ex.exerciseId,
          source: 'custom',
          name_de: ex.name,
          equipment: ex.newExercise.equipment,
          primary_muscles: ex.newExercise.primaryMuscles,
          secondary_muscles: ex.newExercise.secondaryMuscles,
        });
      }
      rows.exercises.push({
        id: ex.id,
        plan_day_id: day.id,
        exercise_id: ex.exerciseId,
        position: ei + 1,
        sets: ex.sets,
        rep_min: ex.repMin,
        rep_max: ex.repMax,
        target_rir: ex.targetRir,
        rest_seconds: ex.restSeconds,
        warmup: ex.warmup,
        note: ex.note.trim() === '' ? null : ex.note.trim(),
        weight_kg: ex.weightKg,
        equipment_kg: ex.equipmentKg,
        archived_at: ex.archived ? ts : null,
      });
    });
  });
  return rows;
}

// ---------------------------------------------------------------------------
// Laden: Datenbankzeilen -> Plan

export interface PlanDbRow {
  id: string;
  /** Fehlt in Datenbanken, die noch ohne Vorlagen angelegt wurden. */
  kind?: PlanKind | null;
  name: string;
  archived_at: string | null;
  fit_plan_days: {
    id: string;
    name: string;
    position: number;
    archived_at: string | null;
    fit_plan_exercises: {
      id: string;
      exercise_id: string;
      position: number;
      sets: number;
      rep_min: number;
      rep_max: number;
      target_rir: number | null;
      rest_seconds: number | null;
      warmup?: boolean | null;
      note?: string | null;
      weight_kg?: number | string | null;
      equipment_kg?: number | string | null;
      archived_at: string | null;
    }[];
  }[];
}

/**
 * Wandelt geladene Zeilen in Pläne um. Archivierte Pläne, Tage und Übungen
 * fallen weg, alles wird nach `position` sortiert. Übungsnamen stammen aus der
 * Übungsliste (`namesById`).
 */
export function plansFromRows(rows: PlanDbRow[], namesById: Record<string, string | undefined>): Plan[] {
  return rows
    .filter((p) => p.archived_at === null)
    .map((p) => ({
      id: p.id,
      kind: p.kind ?? 'plan',
      name: p.name,
      archived: false,
      isNew: false,
      days: [...p.fit_plan_days]
        .filter((d) => d.archived_at === null)
        .sort((a, b) => a.position - b.position)
        .map((d) => ({
          id: d.id,
          name: d.name,
          archived: false,
          isNew: false,
          exercises: [...d.fit_plan_exercises]
            .filter((e) => e.archived_at === null)
            .sort((a, b) => a.position - b.position)
            .map((e) => ({
              id: e.id,
              exerciseId: e.exercise_id,
              name: namesById[e.exercise_id] ?? 'Unbekannte Übung',
              sets: e.sets,
              repMin: e.rep_min,
              repMax: e.rep_max,
              targetRir: e.target_rir,
              restSeconds: e.rest_seconds ?? 120,
              warmup: e.warmup ?? false,
              note: e.note ?? '',
              weightKg: e.weight_kg == null ? null : Number(e.weight_kg),
              equipmentKg: e.equipment_kg == null ? null : Number(e.equipment_kg),
              newExercise: null,
              archived: false,
              isNew: false,
            })),
        })),
    }));
}

/** Nach erfolgreichem Speichern: alles gilt als gespeichert, Archiviertes verschwindet aus der Ansicht. */
export function markSaved(plan: Plan): Plan {
  return {
    ...plan,
    isNew: false,
    days: plan.days
      .filter((d) => !d.archived)
      .map((d) => ({
        ...d,
        isNew: false,
        exercises: d.exercises
          .filter((e) => !e.archived)
          .map((e) => ({ ...e, isNew: false, newExercise: null })),
      })),
  };
}

// ---------------------------------------------------------------------------
// Training aus einem Plantag starten

/**
 * Erzeugt einen Trainingsentwurf aus einem Plantag. Gewichtsschritt und
 * Stangengewicht kommen aus der Übungsliste, die Sätze des letzten Trainings
 * aus `lastSets` (Vorbelegung und Progressionsvorschlag).
 */
export function draftFromPlanDay(
  day: PlanDay,
  exercisesById: Record<string, ExerciseListItem | undefined>,
  lastSets: Record<string, LoggedSet[] | undefined>,
  now: Date,
  /** Stangen-/Maschinengewicht des letzten Trainings je Übung (Vorbelegung). */
  lastEquipment: Record<string, number | null | undefined> = {},
): Draft {
  let draft = createDraft(day.name.trim(), day.id, now);
  let first = true;
  for (const e of visibleExercises(day)) {
    const known = exercisesById[e.exerciseId];
    draft = addExercise(draft, {
      exerciseId: e.exerciseId,
      name: known?.name ?? e.name,
      isNew: e.newExercise !== null,
      repMin: e.repMin,
      repMax: e.repMax,
      plannedSets: e.sets,
      targetRir: e.targetRir,
      restSeconds: e.restSeconds,
      equipment: e.newExercise?.equipment ?? null,
      weightKg: e.weightKg,
      equipmentKg: e.equipmentKg ?? lastEquipment[e.exerciseId] ?? null,
      primaryMuscles: known?.primaryMuscles ?? e.newExercise?.primaryMuscles,
      secondaryMuscles: known?.secondaryMuscles ?? e.newExercise?.secondaryMuscles,
      lastSets: lastSets[e.exerciseId] ?? [],
      note: e.note.trim() === '' ? undefined : e.note.trim(),
    });
    if (e.warmup) {
      // Die erste Übung mit Aufwärmen bekommt die volle Rampe, spätere einen kurzen Satz.
      const added = draft.exercises[draft.exercises.length - 1];
      draft = addWarmups(draft, added.id, first ? 'full' : 'short');
      first = false;
    }
  }
  return draft;
}
