import { describe, expect, it } from 'vitest';
import {
  addDay,
  addPlanExercise,
  applyPlanPatches,
  describePlanChange,
  draftFromPlanDay,
  newPlan,
  patchesFromChanges,
  planChangesFromDraft,
  planToRows,
  plansFromRows,
  setPlanName,
  summarizePlanExercise,
  updatePlanExercise,
  validatePlan,
  warmupSetsFromRow,
  type Plan,
  type PlanDbRow,
} from './plan';
import { estimate1RM, exerciseStats, payloadToHist } from './stats';
import type { LoggedSet } from './progression';
import { buildPayload, removeSet, toggleDone, updateSet, type Draft } from './workout';

const now = new Date('2026-11-06T08:00:00.000Z');

const PLAN_WARM = [
  { weightKg: 20, reps: 10 },
  { weightKg: 40, reps: 5 },
];

function plan(warmupSets = PLAN_WARM): Plan {
  let p = setPlanName(newPlan(), 'Split');
  p = addDay(p, 'Lower');
  p = addPlanExercise(p, p.days[0].id, {
    exerciseId: 'squat',
    name: 'Kniebeuge',
    isNew: false,
    sets: 3,
    warmup: true,
    warmupSets,
    weightKg: 80,
  });
  return p;
}

const lastSets = (workingKg: number): Record<string, LoggedSet[]> => ({
  squat: [
    { type: 'warmup', weightKg: 30, reps: 6, rir: null },
    { type: 'working', weightKg: workingKg, reps: 10, rir: null },
    { type: 'working', weightKg: workingKg, reps: 10, rir: null },
  ],
});

const warmOf = (d: Draft) =>
  d.exercises[0].sets.filter((s) => s.type === 'warmup').map((s) => ({ weightKg: s.weightKg, reps: s.reps }));

describe('Aufwärmsätze im Plan: Training starten', () => {
  it('nimmt die Plansätze mit festen Kilo, auch wenn das Arbeitsgewicht gleich geblieben ist und das letzte Training andere hatte', () => {
    const p = plan();
    const d = draftFromPlanDay(p.days[0], {}, lastSets(80), now);
    expect(warmOf(d)).toEqual(PLAN_WARM);
  });

  it('bleibt bei den Plansätzen, auch wenn das Arbeitsgewicht gestiegen ist', () => {
    const p = plan();
    const d = draftFromPlanDay(p.days[0], {}, lastSets(85), now);
    expect(warmOf(d)).toEqual(PLAN_WARM);
  });

  it('setzt sie vor die Arbeitssätze', () => {
    const d = draftFromPlanDay(plan().days[0], {}, lastSets(80), now);
    expect(d.exercises[0].sets.map((s) => s.type)).toEqual(['warmup', 'warmup', 'working', 'working', 'working']);
  });

  it('ohne Plansätze gilt wie bisher das letzte Training, ohne dessen Aufwärmsätze der Vorschlag', () => {
    const p = plan([]);
    expect(warmOf(draftFromPlanDay(p.days[0], {}, lastSets(80), now))).toEqual([{ weightKg: 30, reps: 6 }]);
    // Waren die Aufwärmsätze beim letzten Mal nicht abgehakt, wurden sie nicht gespeichert.
    const noWarm: Record<string, LoggedSet[]> = { squat: lastSets(80).squat.filter((s) => s.type === 'working') };
    const suggested = warmOf(draftFromPlanDay(p.days[0], {}, noWarm, now));
    expect(suggested.length).toBeGreaterThan(1);
    expect(suggested[0].weightKg).not.toBe(30);
  });

  it('bei ausgeschaltetem Aufwärmen entstehen keine Aufwärmsätze, die Liste bleibt gespeichert', () => {
    let p = plan();
    p = updatePlanExercise(p, p.days[0].id, p.days[0].exercises[0].id, { warmup: false });
    expect(warmOf(draftFromPlanDay(p.days[0], {}, lastSets(80), now))).toEqual([]);
    expect(p.days[0].exercises[0].warmupSets).toEqual(PLAN_WARM);
  });

  it('funktioniert auch ohne bekanntes Arbeitsgewicht', () => {
    let p = setPlanName(newPlan(), 'Split');
    p = addDay(p, 'Lower');
    p = addPlanExercise(p, p.days[0].id, { exerciseId: 'row', name: 'Rudern', isNew: false, warmup: true, warmupSets: PLAN_WARM });
    expect(warmOf(draftFromPlanDay(p.days[0], {}, {}, now))).toEqual(PLAN_WARM);
  });
});

describe('Aufwärmsätze im Plan: Rückübernahme nach dem Training', () => {
  it('unverändert, auch nach Abhaken, ist keine Änderung', () => {
    let d = draftFromPlanDay(plan().days[0], {}, lastSets(80), now);
    const e = d.exercises[0];
    d = toggleDone(d, e.id, e.sets[0].id);
    expect(planChangesFromDraft(d)).toEqual([]);
  });

  it('geändertes Gewicht eines Aufwärmsatzes landet im Plan und beim nächsten Start wieder im Training', () => {
    const p = plan();
    let d = draftFromPlanDay(p.days[0], {}, lastSets(80), now);
    const e = d.exercises[0];
    d = updateSet(d, e.id, e.sets[1].id, { weightKg: 45 });
    const changes = planChangesFromDraft(d);
    expect(changes).toHaveLength(1);
    expect(describePlanChange(changes[0])).toBe('Kniebeuge: Aufwärmsätze angepasst');

    const patches = patchesFromChanges(changes);
    expect(patches[0].warmupSets).toEqual([
      { weightKg: 20, reps: 10 },
      { weightKg: 45, reps: 5 },
    ]);
    const next = applyPlanPatches([p], patches);
    const again = draftFromPlanDay(next[0].days[0], {}, lastSets(80), now);
    expect(warmOf(again)).toEqual(patches[0].warmupSets);
  });

  it('entfernter Einzelsatz bleibt entfernt; alle entfernt schaltet Aufwärmen aus', () => {
    const p = plan();
    let d = draftFromPlanDay(p.days[0], {}, lastSets(80), now);
    const e = d.exercises[0];
    d = removeSet(d, e.id, e.sets[0].id);
    expect(patchesFromChanges(planChangesFromDraft(d))[0]).toEqual({
      planExerciseId: e.planExerciseId,
      warmupSets: [{ weightKg: 40, reps: 5 }],
    });
    d = removeSet(d, e.id, e.sets[1].id);
    expect(patchesFromChanges(planChangesFromDraft(d))[0]).toEqual({
      planExerciseId: e.planExerciseId,
      warmup: false,
      warmupSets: [],
    });
  });

  it('ein aus dem Vorschlag entstandener, unveränderter Satz macht den Plan nicht fest', () => {
    const p = plan([]);
    const d = draftFromPlanDay(p.days[0], {}, lastSets(85), now);
    expect(planChangesFromDraft(d)).toEqual([]);
  });
});

describe('Aufwärmsätze im Plan: Speichern und Laden', () => {
  it('schreibt feste Kilo als Zeilen und liest sie wieder', () => {
    const p = plan();
    const rows = planToRows(p, now);
    expect(rows.exercises[0].warmup_sets).toEqual([
      { weight_kg: 20, reps: 10 },
      { weight_kg: 40, reps: 5 },
    ]);
    const db: PlanDbRow[] = [
      {
        id: rows.plan.id,
        name: 'Split',
        archived_at: null,
        fit_plan_days: [
          {
            id: rows.days[0].id,
            name: 'Lower',
            position: 1,
            archived_at: null,
            fit_plan_exercises: [
              {
                id: rows.exercises[0].id,
                exercise_id: 'squat',
                position: 1,
                sets: 3,
                rep_min: 8,
                rep_max: 12,
                target_rir: null,
                rest_seconds: 120,
                warmup: true,
                warmup_sets: rows.exercises[0].warmup_sets,
                archived_at: null,
              },
            ],
          },
        ],
      },
    ];
    expect(plansFromRows(db, { squat: 'Kniebeuge' })[0].days[0].exercises[0].warmupSets).toEqual(PLAN_WARM);
  });

  it('lädt Zeilen ohne Spalte warmup_sets (Migration 0023 fehlt) und liest Ungültiges nicht', () => {
    expect(warmupSetsFromRow(undefined)).toEqual([]);
    expect(warmupSetsFromRow('x')).toEqual([]);
    expect(
      warmupSetsFromRow([{ weight_kg: '25', reps: 8 }, { weight_kg: 0, reps: 5 }, { weight_kg: 30, reps: 2.5 }, null, 7]),
    ).toEqual([{ weightKg: 25, reps: 8 }]);
  });

  it('prüft Gewicht, Wiederholungen und Anzahl', () => {
    let p = plan([{ weightKg: 0, reps: 5 }]);
    expect(validatePlan(p).join(' ')).toMatch(/Aufwärmsatz 1 braucht ein Gewicht/);
    p = plan([{ weightKg: 20.1, reps: 5 }]);
    expect(validatePlan(p).join(' ')).toMatch(/0,25-kg-Schritten/);
    p = plan([{ weightKg: 20, reps: 0 }]);
    expect(validatePlan(p).join(' ')).toMatch(/1 bis 100 Wiederholungen/);
    p = plan(Array.from({ length: 11 }, () => ({ weightKg: 20, reps: 5 })));
    expect(validatePlan(p).join(' ')).toMatch(/höchstens 10 Aufwärmsätze/);
    expect(validatePlan(plan())).toEqual([]);
  });

  it('zeigt die Anzahl in der Kurzfassung', () => {
    expect(summarizePlanExercise(plan().days[0].exercises[0])).toContain('Aufwärmen (2)');
    expect(summarizePlanExercise(plan([]).days[0].exercises[0])).toMatch(/Aufwärmen$/);
  });
});

describe('Aufwärmsätze zählen nicht in die Auswertung', () => {
  it('abgehakte Plan-Aufwärmsätze ändern Sätze, Wiederholungen, Volumen, besten Satz und 1RM nicht', () => {
    // Bewusst schwere Aufwärmsätze (60 und 100 kg), damit jede Beimischung auffallen würde.
    const heavy = plan([
      { weightKg: 60, reps: 10 },
      { weightKg: 100, reps: 5 },
    ]);
    let d = draftFromPlanDay(heavy.days[0], {}, lastSets(80), now);
    const e = d.exercises[0];
    for (const s of e.sets) d = toggleDone(d, e.id, s.id);

    const payload = buildPayload(d, new Date('2026-11-06T09:00:00.000Z'));
    expect(payload).not.toBeNull();
    expect(payload!.sets.filter((s) => s.type === 'warmup')).toHaveLength(2);

    const st = exerciseStats(payloadToHist(payload!).exercises[0]);
    expect(st.workingSets).toBe(3);
    expect(st.reps).toBe(3 * 10);
    expect(st.volumeKg).toBe(3 * 80 * 10);
    expect(st.topSet).toMatchObject({ weightKg: 80, reps: 10 });
    expect(st.best1RM).toBe(estimate1RM(80, 10));
  });
});
