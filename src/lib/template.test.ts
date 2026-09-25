import { describe, expect, it } from 'vitest';
import {
  addDayFromTemplate,
  addPlanExercise,
  draftFromPlanDay,
  markSaved,
  newPlan,
  newTemplate,
  planToRows,
  plansFromRows,
  setPlanName,
  summarizePlanExercise,
  templateDay,
  updatePlanExercise,
  validatePlan,
  visibleDays,
  visibleExercises,
  type Plan,
} from './plan';

const now = new Date('2026-09-25T10:00:00.000Z');

function filledTemplate(): Plan {
  let t = setPlanName(newTemplate(), 'Oberkörper A');
  const day = templateDay(t)!;
  t = addPlanExercise(t, day.id, { exerciseId: 'bench', name: 'Bankdrücken', isNew: false });
  t = addPlanExercise(t, day.id, {
    exerciseId: 'row',
    name: 'Rudern',
    isNew: false,
    sets: 4,
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSeconds: 150,
    warmup: true,
    note: 'Sitz auf Stufe 4',
  });
  return t;
}

describe('Vorlagen', () => {
  it('legt eine Vorlage als Plan mit genau einem Tag an', () => {
    const t = newTemplate('Push');
    expect(t.kind).toBe('template');
    expect(visibleDays(t)).toHaveLength(1);
    expect(newPlan().kind).toBe('plan');
  });

  it('verlangt Namen und mindestens eine Übung, meldet aber keinen Tagesnamen', () => {
    expect(validatePlan(newTemplate())).toEqual([
      'Die Vorlage braucht einen Namen.',
      '„" hat noch keine Übung.',
    ]);
    expect(validatePlan(filledTemplate())).toEqual([]);
  });

  it('schreibt den Vorlagennamen als Tagesnamen und merkt sich die Art', () => {
    const rows = planToRows(filledTemplate(), now);
    expect(rows.plan.kind).toBe('template');
    expect(rows.days).toHaveLength(1);
    expect(rows.days[0].name).toBe('Oberkörper A');
  });

  it('speichert Aufwärmen und Notiz; eine leere Notiz wird zu null', () => {
    const rows = planToRows(filledTemplate(), now);
    expect(rows.exercises[0]).toMatchObject({ warmup: false, note: null });
    expect(rows.exercises[1]).toMatchObject({ warmup: true, note: 'Sitz auf Stufe 4' });
    const t = filledTemplate();
    const day = templateDay(t)!;
    const changed = updatePlanExercise(t, day.id, day.exercises[0].id, { note: '  Griff eng  ', warmup: true });
    expect(planToRows(changed, now).exercises[0]).toMatchObject({ warmup: true, note: 'Griff eng' });
  });

  it('lädt Zeilen ohne kind, warmup und note wie bisher (Plan ohne Aufwärmen, ohne Notiz)', () => {
    const [p] = plansFromRows(
      [
        {
          id: 'p1',
          name: 'Alt',
          archived_at: null,
          fit_plan_days: [
            {
              id: 'd1',
              name: 'A',
              position: 1,
              archived_at: null,
              fit_plan_exercises: [
                { id: 'x1', exercise_id: 'e1', position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: null, rest_seconds: null, archived_at: null },
              ],
            },
          ],
        },
      ],
      { e1: 'Bankdrücken' },
    );
    expect(p.kind).toBe('plan');
    expect(p.days[0].exercises[0]).toMatchObject({ warmup: false, note: '' });
  });

  it('lädt eine gespeicherte Vorlage mit Aufwärmen und Notiz', () => {
    const [p] = plansFromRows(
      [
        {
          id: 't1',
          kind: 'template',
          name: 'Vorlage',
          archived_at: null,
          fit_plan_days: [
            {
              id: 'd1',
              name: 'Vorlage',
              position: 1,
              archived_at: null,
              fit_plan_exercises: [
                { id: 'x1', exercise_id: 'e1', position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: 1, rest_seconds: 90, warmup: true, note: 'Bank 3', archived_at: null },
              ],
            },
          ],
        },
      ],
      { e1: 'Bankdrücken' },
    );
    expect(p.kind).toBe('template');
    expect(p.days[0].exercises[0]).toMatchObject({ warmup: true, note: 'Bank 3' });
  });
});

describe('Vorlage in einen Plan kopieren', () => {
  it('übernimmt Übungen und Werte als neuen Tag mit neuen IDs', () => {
    const saved = markSaved(filledTemplate());
    let plan = setPlanName(newPlan(), 'Split');
    plan = addDayFromTemplate(plan, saved);
    const day = visibleDays(plan)[0];
    expect(day.name).toBe('Oberkörper A');
    expect(day.isNew).toBe(true);
    const copied = visibleExercises(day);
    const source = visibleExercises(templateDay(saved)!);
    expect(copied.map((e) => e.name)).toEqual(['Bankdrücken', 'Rudern']);
    expect(copied[1]).toMatchObject({ sets: 4, repMin: 6, repMax: 10, targetRir: 2, restSeconds: 150, warmup: true, note: 'Sitz auf Stufe 4' });
    expect(copied.every((e, i) => e.id !== source[i].id && e.isNew && e.newExercise === null)).toBe(true);
    expect(day.id).not.toBe(templateDay(saved)!.id);
  });

  it('ändert die Vorlage nicht, wenn man den kopierten Tag bearbeitet', () => {
    const saved = markSaved(filledTemplate());
    let plan = addDayFromTemplate(setPlanName(newPlan(), 'X'), saved);
    const day = visibleDays(plan)[0];
    plan = updatePlanExercise(plan, day.id, day.exercises[0].id, { sets: 9 });
    expect(visibleExercises(templateDay(saved)!)[0].sets).toBe(3);
  });

  it('ändert nichts, wenn die Vorlage keinen Tag hat', () => {
    const empty: Plan = { ...newTemplate('leer'), days: [] };
    const plan = setPlanName(newPlan(), 'X');
    expect(addDayFromTemplate(plan, empty)).toBe(plan);
  });
});

describe('Kurzfassung', () => {
  it('zeigt Sätze, Bereich, RIR, Pause und Aufwärmen', () => {
    const day = templateDay(filledTemplate())!;
    expect(summarizePlanExercise(day.exercises[0])).toBe('3 × 8–12 · 2:00 min');
    expect(summarizePlanExercise(day.exercises[1])).toBe('4 × 6–10 · RIR 2 · 2:30 min · Aufwärmen');
  });

  it('zeigt bei gleicher Unter- und Obergrenze nur eine Zahl', () => {
    const day = templateDay(filledTemplate())!;
    expect(summarizePlanExercise({ ...day.exercises[0], repMin: 5, repMax: 5 })).toBe('3 × 5 · 2:00 min');
  });
});

describe('Training aus Vorlage', () => {
  const last = {
    row: [
      { type: 'working' as const, weightKg: 60, reps: 10, rir: 1 },
      { type: 'working' as const, weightKg: 60, reps: 9, rir: 1 },
    ],
  };

  it('übernimmt die Notiz in die Übung', () => {
    const t = markSaved(filledTemplate());
    const d = draftFromPlanDay(templateDay(t)!, {}, last, now);
    expect(d.exercises[0].note).toBeUndefined();
    expect(d.exercises[1].note).toBe('Sitz auf Stufe 4');
  });

  it('plant Aufwärmsätze nur ein, wenn es im Plan steht und ein Gewicht bekannt ist', () => {
    const t = markSaved(filledTemplate());
    const d = draftFromPlanDay(templateDay(t)!, {}, last, now);
    expect(d.exercises[0].sets.some((s) => s.type === 'warmup')).toBe(false);
    const row = d.exercises[1];
    const warm = row.sets.filter((s) => s.type === 'warmup');
    expect(warm.length).toBeGreaterThan(0);
    // Aufwärmsätze stehen vor den Arbeitssätzen und sind leichter.
    expect(row.sets.slice(0, warm.length).every((s) => s.type === 'warmup')).toBe(true);
    expect(warm.every((s) => s.weightKg < 60)).toBe(true);
  });

  it('lässt Aufwärmen ohne bekanntes Gewicht aus, statt 0-kg-Sätze zu erzeugen', () => {
    const t = markSaved(filledTemplate());
    const d = draftFromPlanDay(templateDay(t)!, {}, {}, now);
    expect(d.exercises[1].sets.every((s) => s.type === 'working')).toBe(true);
  });

  it('übernimmt die Muskelgruppen aus dem Übungskatalog in den Entwurf', () => {
    const t = markSaved(filledTemplate());
    const d = draftFromPlanDay(
      templateDay(t)!,
      { bench: { id: 'bench', name: 'Bankdrücken', primaryMuscles: ['chest'], secondaryMuscles: ['triceps'] } },
      {},
      now,
    );
    expect(d.exercises[0].primaryMuscles).toEqual(['chest']);
    expect(d.exercises[0].secondaryMuscles).toEqual(['triceps']);
  });
});
