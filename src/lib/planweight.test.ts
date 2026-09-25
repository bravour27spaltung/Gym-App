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
import { lastWorkingSetCount, lastWorkingWeightKg, type LoggedSet } from './progression';

const now = new Date('2026-09-25T10:00:00.000Z');

const last: LoggedSet[] = [
  { type: 'warmup', weightKg: 40, reps: 8, rir: null },
  { type: 'working', weightKg: 80, reps: 10, rir: null },
  { type: 'working', weightKg: 80, reps: 10, rir: null },
  { type: 'working', weightKg: 77.5, reps: 9, rir: null },
];

function withWeight(weightKg: number | null, equipmentKg: number | null = null): Plan {
  let t = setPlanName(newTemplate(), 'Push');
  const day = templateDay(t)!;
  t = addPlanExercise(t, day.id, { exerciseId: 'bench', name: 'Bankdrücken', isNew: false, weightKg, equipmentKg, warmup: true });
  return markSaved(t);
}

describe('Letztes Mal aus den Sätzen', () => {
  it('nimmt das höchste Arbeitsgewicht und zählt nur Arbeitssätze', () => {
    expect(lastWorkingWeightKg(last)).toBe(80);
    expect(lastWorkingSetCount(last)).toBe(3);
  });

  it('meldet ohne Arbeitssätze null bzw. 0', () => {
    expect(lastWorkingWeightKg([])).toBeNull();
    expect(lastWorkingWeightKg([last[0]])).toBeNull();
    expect(lastWorkingSetCount([last[0]])).toBe(0);
  });
});

describe('Gewicht im Plan', () => {
  it('speichert und lädt Gewicht und Stangengewicht', () => {
    const t = withWeight(82.5, 20);
    const rows = planToRows(t, now);
    expect(rows.exercises[0]).toMatchObject({ weight_kg: 82.5, equipment_kg: 20 });
    const [loaded] = plansFromRows(
      [
        {
          id: 'p',
          kind: 'template',
          name: 'Push',
          archived_at: null,
          fit_plan_days: [
            {
              id: 'd',
              name: 'Push',
              position: 1,
              archived_at: null,
              // Postgres liefert numeric je nach Client als Text
              fit_plan_exercises: [
                { id: 'x', exercise_id: 'bench', position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: null, rest_seconds: 120, weight_kg: '82.50', equipment_kg: '20.00', archived_at: null },
              ],
            },
          ],
        },
      ],
      { bench: 'Bankdrücken' },
    );
    expect(loaded.days[0].exercises[0]).toMatchObject({ weightKg: 82.5, equipmentKg: 20 });
  });

  it('lädt ältere Zeilen ohne Gewicht als "nicht festgelegt"', () => {
    const [loaded] = plansFromRows(
      [
        {
          id: 'p',
          name: 'Alt',
          archived_at: null,
          fit_plan_days: [
            { id: 'd', name: 'A', position: 1, archived_at: null, fit_plan_exercises: [{ id: 'x', exercise_id: 'e', position: 1, sets: 3, rep_min: 8, rep_max: 12, target_rir: null, rest_seconds: null, archived_at: null }] },
          ],
        },
      ],
      { e: 'X' },
    );
    expect(loaded.days[0].exercises[0]).toMatchObject({ weightKg: null, equipmentKg: null });
  });

  it('zeigt das Gewicht in der Kurzfassung, mit Stange in Klammern', () => {
    const day = templateDay(withWeight(80, 20))!;
    expect(summarizePlanExercise(day.exercises[0])).toBe('3 × 8–12 · 80 kg (+20) · 2:00 min · Aufwärmen');
    expect(summarizePlanExercise({ ...day.exercises[0], weightKg: 62.5, equipmentKg: null })).toBe('3 × 8–12 · 62,5 kg · 2:00 min · Aufwärmen');
    expect(summarizePlanExercise({ ...day.exercises[0], weightKg: null })).toBe('3 × 8–12 · 2:00 min · Aufwärmen');
  });

  it('lehnt unsinnige Gewichte ab', () => {
    const t = withWeight(80);
    const day = templateDay(t)!;
    const bad = updatePlanExercise(t, day.id, day.exercises[0].id, { weightKg: -5 });
    expect(validatePlan(bad).join(' ')).toContain('Gewicht muss zwischen 0 und 999 kg liegen');
    const grid = updatePlanExercise(t, day.id, day.exercises[0].id, { weightKg: 80.1 });
    expect(validatePlan(grid)).not.toEqual([]);
    expect(validatePlan(t)).toEqual([]);
  });

  it('kopiert das Gewicht mit, wenn ein Tag aus einer Vorlage übernommen wird', () => {
    const plan = addDayFromTemplate(setPlanName(newPlan(), 'Split'), withWeight(80, 20));
    expect(visibleExercises(visibleDays(plan)[0])[0]).toMatchObject({ weightKg: 80, equipmentKg: 20 });
  });
});

describe('Training startet mit dem Plan-Gewicht', () => {
  const lastMap = { bench: last };

  it('nimmt das Plan-Gewicht vor dem Wert vom letzten Training', () => {
    const d = draftFromPlanDay(templateDay(withWeight(85))!, {}, lastMap, now);
    const work = d.exercises[0].sets.filter((s) => s.type === 'working');
    expect(work.every((s) => s.weightKg === 85)).toBe(true);
  });

  it('greift ohne Plan-Gewicht auf das letzte Training zurück', () => {
    const d = draftFromPlanDay(templateDay(withWeight(null))!, {}, lastMap, now);
    const work = d.exercises[0].sets.filter((s) => s.type === 'working');
    expect(work.every((s) => s.weightKg === 80)).toBe(true);
  });

  it('nimmt das Plan-Stangengewicht vor dem gemerkten', () => {
    const planned = draftFromPlanDay(templateDay(withWeight(80, 15))!, {}, lastMap, now, { bench: 20 });
    expect(planned.exercises[0].equipmentKg).toBe(15);
    const fallback = draftFromPlanDay(templateDay(withWeight(80, null))!, {}, lastMap, now, { bench: 20 });
    expect(fallback.exercises[0].equipmentKg).toBe(20);
  });

  it('plant Aufwärmsätze auch ohne Verlauf ein, wenn das Plan-Gewicht bekannt ist', () => {
    const d = draftFromPlanDay(templateDay(withWeight(100))!, {}, {}, now);
    const warm = d.exercises[0].sets.filter((s) => s.type === 'warmup');
    expect(warm.length).toBeGreaterThan(0);
    expect(warm.every((s) => s.weightKg < 100)).toBe(true);
  });
});
