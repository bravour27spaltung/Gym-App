import { describe, expect, it } from 'vitest';
import {
  addDay,
  addPlanExercise,
  applyPlanPatches,
  describePlanChange,
  draftFromPlanDay,
  mergePlanPatches,
  newPlan,
  patchesFromChanges,
  planChangesFromDraft,
  setPlanName,
  type Plan,
} from './plan';
import { createStore, type KeyValueStorage } from './storage';
import {
  addExercise,
  addSet,
  addWarmups,
  createDraft,
  removeSet,
  setFocusExercise,
  toggleDone,
  updateSet,
  type Draft,
} from './workout';

const now = new Date('2026-10-02T08:00:00.000Z');

/** Bankdrücken (Aufwärmen, 60 kg), Schulterdrücken (ohne Aufwärmen, 40 kg), Rudern (Aufwärmen, aber ohne Gewicht). */
function plan(): Plan {
  let p = setPlanName(newPlan(), 'Split');
  p = addDay(p, 'Push');
  const day = p.days[0].id;
  p = addPlanExercise(p, day, { exerciseId: 'bench', name: 'Bankdrücken', isNew: false, sets: 3, warmup: true, weightKg: 60 });
  p = addPlanExercise(p, day, { exerciseId: 'ohp', name: 'Schulterdrücken', isNew: false, sets: 3, warmup: false, weightKg: 40 });
  p = addPlanExercise(p, day, { exerciseId: 'row', name: 'Rudern', isNew: false, sets: 4, warmup: true });
  return p;
}

function start(): { p: Plan; d: Draft } {
  const p = plan();
  return { p, d: draftFromPlanDay(p.days[0], {}, {}, now) };
}

const ex = (d: Draft, exerciseId: string) => d.exercises.find((e) => e.exerciseId === exerciseId)!;

describe('Änderungen aus dem Training erkennen', () => {
  it('unverändertes Training ändert den Plan nicht – auch wenn "Aufwärmen" im Plan an ist, aber keine Sätze entstanden', () => {
    const { d } = start();
    // Rudern hat kein Gewicht, deshalb keine Aufwärmsätze, obwohl der Plan sie vorsieht.
    expect(ex(d, 'row').sets.some((s) => s.type === 'warmup')).toBe(false);
    expect(planChangesFromDraft(d)).toEqual([]);
  });

  it('nicht abgehakte Sätze sind keine Änderung', () => {
    let { d } = start();
    const bench = ex(d, 'bench');
    d = toggleDone(d, bench.id, bench.sets.find((s) => s.type === 'working')!.id);
    expect(planChangesFromDraft(d)).toEqual([]);
  });

  it('hinzugefügter Arbeitssatz erhöht die Satzzahl im Plan', () => {
    let { p, d } = start();
    d = addSet(d, ex(d, 'ohp').id);
    const changes = planChangesFromDraft(d);
    expect(changes).toEqual([
      { planExerciseId: p.days[0].exercises[1].id, name: 'Schulterdrücken', sets: { from: 3, to: 4 } },
    ]);
    expect(patchesFromChanges(changes)).toEqual([{ planExerciseId: p.days[0].exercises[1].id, sets: 4 }]);
  });

  it('entfernter Arbeitssatz senkt die Satzzahl', () => {
    let { d } = start();
    const ohp = ex(d, 'ohp');
    d = removeSet(d, ohp.id, ohp.sets[0].id);
    expect(planChangesFromDraft(d)[0]).toMatchObject({ name: 'Schulterdrücken', sets: { from: 3, to: 2 } });
  });

  it('hinzufügen und wieder entfernen hebt sich auf', () => {
    let { d } = start();
    const ohp = ex(d, 'ohp');
    d = addSet(d, ohp.id);
    const added = ex(d, 'ohp').sets[3];
    d = removeSet(d, ohp.id, added.id);
    expect(planChangesFromDraft(d)).toEqual([]);
  });

  it('Satztyp umstellen (Arbeits- zu Aufwärmsatz) zählt für beide Arten', () => {
    let { d } = start();
    const ohp = ex(d, 'ohp');
    d = updateSet(d, ohp.id, ohp.sets[0].id, { type: 'warmup' });
    expect(planChangesFromDraft(d)[0]).toMatchObject({
      name: 'Schulterdrücken',
      sets: { from: 3, to: 2 },
      warmup: { from: false, to: true },
    });
  });

  it('hinzugefügte Aufwärmsätze schalten "Aufwärmen" im Plan ein', () => {
    let { d } = start();
    d = addWarmups(d, ex(d, 'ohp').id, 'short');
    expect(planChangesFromDraft(d)).toEqual([
      expect.objectContaining({ name: 'Schulterdrücken', warmup: { from: false, to: true } }),
    ]);
  });

  it('alle Aufwärmsätze entfernt schaltet "Aufwärmen" aus, ein einzelner entfernter nicht', () => {
    let { d } = start();
    const bench = ex(d, 'bench');
    const warm = bench.sets.filter((s) => s.type === 'warmup');
    expect(warm.length).toBeGreaterThan(1);
    d = removeSet(d, bench.id, warm[0].id);
    expect(planChangesFromDraft(d)).toEqual([]);
    for (const w of warm.slice(1)) d = removeSet(d, bench.id, w.id);
    expect(planChangesFromDraft(d)).toEqual([
      expect.objectContaining({ name: 'Bankdrücken', warmup: { from: true, to: false } }),
    ]);
  });

  it('ignoriert Übungen ohne Planbezug (freies Training, im Training ergänzt)', () => {
    let { d } = start();
    d = addExercise(d, { exerciseId: 'curl', name: 'Curls', isNew: false });
    d = addSet(d, ex(d, 'curl').id);
    expect(planChangesFromDraft(d)).toEqual([]);

    let free = createDraft('Frei', null, now);
    free = addExercise(free, { exerciseId: 'curl', name: 'Curls', isNew: false });
    free = addSet(free, free.exercises[0].id);
    expect(planChangesFromDraft(free)).toEqual([]);
  });

  it('lässt die Satzzahl, wenn alle Arbeitssätze entfernt wurden, und begrenzt auf 10', () => {
    let { d } = start();
    const ohp = ex(d, 'ohp');
    for (const s of ohp.sets) d = removeSet(d, ohp.id, s.id);
    expect(planChangesFromDraft(d)).toEqual([]);

    for (let i = 0; i < 12; i++) d = addSet(d, ohp.id);
    expect(planChangesFromDraft(d)[0].sets).toEqual({ from: 3, to: 10 });
  });

  it('ältere Entwürfe ohne Startwert für Aufwärmen leiten keine Aufwärm-Änderung ab', () => {
    let { d } = start();
    d = {
      ...d,
      exercises: d.exercises.map((e) => {
        const { warmupAtStart: _omit, ...rest } = e;
        return rest;
      }),
    };
    expect(planChangesFromDraft(d)).toEqual([]);
  });

  it('beschreibt Änderungen lesbar', () => {
    expect(
      describePlanChange({
        planExerciseId: 'x',
        name: 'Bankdrücken',
        sets: { from: 3, to: 4 },
        warmup: { from: true, to: false },
      }),
    ).toBe('Bankdrücken: 3 → 4 Sätze, Aufwärmen aus');
  });
});

describe('Änderungen in den Plan schreiben', () => {
  it('überschreibt nur Sätze und Aufwärmen der betroffenen Übung', () => {
    const p = plan();
    const [bench, ohp, row] = p.days[0].exercises;
    const next = applyPlanPatches([p], [{ planExerciseId: ohp.id, sets: 5, warmup: true }]);
    const [b2, o2, r2] = next[0].days[0].exercises;
    expect(o2).toMatchObject({ sets: 5, warmup: true, weightKg: 40, repMin: ohp.repMin });
    expect(b2).toEqual(bench);
    expect(r2).toEqual(row);
    // Original bleibt unverändert.
    expect(p.days[0].exercises[1].sets).toBe(3);
  });

  it('nur genannte Felder werden gesetzt', () => {
    const p = plan();
    const bench = p.days[0].exercises[0];
    const next = applyPlanPatches([p], [{ planExerciseId: bench.id, warmup: false }]);
    expect(next[0].days[0].exercises[0]).toMatchObject({ sets: 3, warmup: false });
  });

  it('ohne Änderungen kommt derselbe Plan zurück', () => {
    const plans = [plan()];
    expect(applyPlanPatches(plans, [])).toBe(plans);
  });

  it('mergePlanPatches: je Planübung gewinnt der neueste Wert, Felder bleiben erhalten', () => {
    expect(
      mergePlanPatches(
        [{ planExerciseId: 'a', sets: 4 }, { planExerciseId: 'b', warmup: true }],
        [{ planExerciseId: 'a', warmup: false }, { planExerciseId: 'b', warmup: false }],
      ),
    ).toEqual([
      { planExerciseId: 'a', sets: 4, warmup: false },
      { planExerciseId: 'b', warmup: false },
    ]);
  });

  it('der nächste Start aus dem überschriebenen Plan hat die neue Satzzahl', () => {
    const { p, d } = start();
    const d2 = addSet(d, ex(d, 'ohp').id);
    const next = applyPlanPatches([p], patchesFromChanges(planChangesFromDraft(d2)));
    const again = draftFromPlanDay(next[0].days[0], {}, {}, now);
    expect(ex(again, 'ohp').sets.filter((s) => s.type === 'working')).toHaveLength(4);
    expect(planChangesFromDraft(again)).toEqual([]);
  });
});

describe('Fokus-Übung im Entwurf', () => {
  it('merkt sich die Übung und lässt den Entwurf sonst unverändert', () => {
    const { d } = start();
    const id = d.exercises[1].id;
    const d2 = setFocusExercise(d, id);
    expect(d2.focusExerciseId).toBe(id);
    expect(d2.exercises).toBe(d.exercises);
    expect(setFocusExercise(d2, id)).toBe(d2);
  });
});

describe('Ausgangskorb für Plan-Änderungen', () => {
  const fake = (): KeyValueStorage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  it('speichert und lädt Änderungen', () => {
    const s = createStore(fake());
    expect(s.loadPlanPatches()).toEqual([]);
    expect(s.savePlanPatches([{ planExerciseId: 'a', sets: 4 }])).toBe(true);
    expect(s.loadPlanPatches()).toEqual([{ planExerciseId: 'a', sets: 4 }]);
  });

  it('läuft ohne Speicher weiter', () => {
    const s = createStore(null);
    expect(s.savePlanPatches([{ planExerciseId: 'a', sets: 4 }])).toBe(false);
    expect(s.loadPlanPatches()).toEqual([]);
  });
});
