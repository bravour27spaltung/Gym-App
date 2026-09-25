import { describe, expect, it } from 'vitest';
import {
  addDay,
  addPlanExercise,
  draftFromPlanDay,
  markSaved,
  moveDay,
  movePlanExercise,
  newPlan,
  planToRows,
  plansFromRows,
  removeDay,
  removePlanExercise,
  renameDay,
  setPlanName,
  updatePlanExercise,
  validatePlan,
  visibleDays,
  visibleExercises,
  type Plan,
} from './plan';

const now = new Date('2026-09-25T10:00:00.000Z');

function pushPullLower(): Plan {
  let p = setPlanName(newPlan(), 'Split');
  for (const n of ['Push', 'Pull', 'Lower']) p = addDay(p, n);
  const [push, pull] = p.days;
  p = addPlanExercise(p, push.id, { exerciseId: 'bench', name: 'Bankdrücken', isNew: false });
  p = addPlanExercise(p, push.id, { exerciseId: 'ohp', name: 'Schulterdrücken', isNew: false });
  p = addPlanExercise(p, pull.id, { exerciseId: 'row', name: 'Rudern', isNew: false });
  p = addPlanExercise(p, p.days[2].id, { exerciseId: 'squat', name: 'Kniebeuge', isNew: false });
  return p;
}

describe('Plan bearbeiten', () => {
  it('legt Tage und Übungen mit sinnvollen Vorgaben an', () => {
    const p = pushPullLower();
    expect(p.days.map((d) => d.name)).toEqual(['Push', 'Pull', 'Lower']);
    expect(p.days[0].exercises[0]).toMatchObject({
      sets: 3,
      repMin: 8,
      repMax: 12,
      targetRir: null,
      restSeconds: 120,
    });
  });

  it('ändert Namen und Übungswerte, ohne das Original zu verändern', () => {
    const p0 = pushPullLower();
    const day = p0.days[0];
    const ex = day.exercises[0];
    const p1 = updatePlanExercise(renameDay(p0, day.id, 'Oberkörper Push'), day.id, ex.id, {
      sets: 4,
      repMin: 6,
      repMax: 10,
      targetRir: 1,
    });
    expect(p1.days[0].name).toBe('Oberkörper Push');
    expect(p1.days[0].exercises[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 10, targetRir: 1 });
    expect(p0.days[0].name).toBe('Push');
    expect(p0.days[0].exercises[0].sets).toBe(3);
  });

  it('verschiebt Tage und Übungen und stoppt an den Rändern', () => {
    const p0 = pushPullLower();
    const [push, pull] = p0.days;
    const p1 = moveDay(p0, pull.id, -1);
    expect(p1.days.map((d) => d.name)).toEqual(['Pull', 'Push', 'Lower']);
    expect(moveDay(p1, p1.days[0].id, -1)).toBe(p1);
    expect(moveDay(p1, p1.days[2].id, 1)).toBe(p1);

    const ex = push.exercises;
    const p2 = movePlanExercise(p0, push.id, ex[0].id, 1);
    expect(p2.days[0].exercises.map((e) => e.name)).toEqual(['Schulterdrücken', 'Bankdrücken']);
    expect(movePlanExercise(p2, push.id, ex[0].id, 1)).toBe(p2); // schon ganz unten
    expect(movePlanExercise(p2, push.id, ex[1].id, -1)).toBe(p2); // schon ganz oben
  });

  it('verwirft nie gespeicherte Einträge und archiviert gespeicherte', () => {
    const fresh = pushPullLower();
    const dropped = removeDay(fresh, fresh.days[0].id);
    expect(dropped.days).toHaveLength(2);

    const saved = markSaved(fresh);
    const archived = removeDay(saved, saved.days[0].id);
    expect(archived.days).toHaveLength(3);
    expect(archived.days[0].archived).toBe(true);
    expect(visibleDays(archived)).toHaveLength(2);

    const exId = saved.days[1].exercises[0].id;
    const archivedEx = removePlanExercise(saved, saved.days[1].id, exId);
    expect(visibleExercises(archivedEx.days[1])).toHaveLength(0);
    expect(archivedEx.days[1].exercises[0].archived).toBe(true);
  });

  it('überspringt beim Verschieben archivierte Einträge', () => {
    const saved = markSaved(pushPullLower());
    const withArchived = removeDay(saved, saved.days[1].id); // Pull archiviert
    const moved = moveDay(withArchived, withArchived.days[2].id, -1); // Lower vor Push
    expect(visibleDays(moved).map((d) => d.name)).toEqual(['Lower', 'Push']);
  });
});

describe('Plan prüfen', () => {
  it('akzeptiert einen vollständigen Plan', () => {
    expect(validatePlan(pushPullLower())).toEqual([]);
  });

  it('meldet fehlende Namen, leere Tage und Plan ohne Tage', () => {
    expect(validatePlan(newPlan())).toEqual([
      'Der Plan braucht einen Namen.',
      'Der Plan braucht mindestens einen Trainingstag.',
    ]);
    const p = addDay(setPlanName(newPlan(), 'X'));
    expect(validatePlan(p)).toEqual(['Tag 1 braucht einen Namen.', 'Tag 1 hat noch keine Übung.']);
  });

  it('meldet ungültige Wiederholungsbereiche, Sätze, RIR und Pause', () => {
    const p0 = pushPullLower();
    const day = p0.days[0];
    const id = day.exercises[0].id;
    const bad = updatePlanExercise(p0, day.id, id, {
      repMin: 10,
      repMax: 8,
      sets: 0,
      targetRir: 9,
      restSeconds: 0,
    });
    const errors = validatePlan(bad);
    expect(errors).toHaveLength(4);
    expect(errors.join(' ')).toContain('Obergrenze');
    expect(errors.join(' ')).toContain('Sätze');
    expect(errors.join(' ')).toContain('Ziel-RIR');
    expect(errors.join(' ')).toContain('Pause');
  });

  it('ignoriert archivierte Einträge bei der Prüfung', () => {
    const saved = markSaved(pushPullLower());
    const emptied = removePlanExercise(saved, saved.days[1].id, saved.days[1].exercises[0].id);
    expect(validatePlan(emptied)).toContain('„Pull" hat noch keine Übung.');
    expect(validatePlan(removeDay(emptied, emptied.days[1].id))).toEqual([]);
  });
});

describe('Speichern', () => {
  it('erzeugt Zeilen mit fortlaufenden Positionen und ohne Archiv-Zeitstempel', () => {
    const rows = planToRows(pushPullLower(), now);
    expect(rows.plan).toMatchObject({ name: 'Split', archived_at: null });
    expect(rows.days.map((d) => [d.name, d.position])).toEqual([
      ['Push', 1],
      ['Pull', 2],
      ['Lower', 3],
    ]);
    expect(rows.exercises.filter((e) => e.plan_day_id === rows.days[0].id).map((e) => e.position)).toEqual([1, 2]);
    expect(rows.exercises.every((e) => e.archived_at === null)).toBe(true);
    expect(rows.newExercises).toEqual([]);
  });

  it('archiviert gespeicherte, entfernte Einträge statt sie zu löschen', () => {
    const saved = markSaved(pushPullLower());
    const removed = removeDay(saved, saved.days[0].id);
    const rows = planToRows(removed, now);
    expect(rows.days[0].archived_at).toBe(now.toISOString());
    expect(rows.days).toHaveLength(3);
  });

  it('lässt nie gespeicherte, entfernte Einträge weg', () => {
    const p0 = pushPullLower();
    const p = removeDay(p0, p0.days[0].id);
    expect(planToRows(p, now).days).toHaveLength(2);
    const q0 = pushPullLower();
    const q = removePlanExercise(q0, q0.days[0].id, q0.days[0].exercises[0].id);
    expect(planToRows(q, now).exercises.some((e) => e.exercise_id === 'bench')).toBe(false);
  });

  it('legt eigene Übungen genau einmal an und vergisst das nach dem Speichern', () => {
    let p = setPlanName(newPlan(), 'Neu');
    p = addDay(p, 'Tag');
    const dayId = p.days[0].id;
    for (let i = 0; i < 2; i++) {
      p = addPlanExercise(p, dayId, {
        exerciseId: 'mine',
        name: 'Meine Übung',
        isNew: true,
        equipment: 'barbell',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps'],
      });
    }
    const rows = planToRows(p, now);
    expect(rows.newExercises).toEqual([
      {
        id: 'mine',
        source: 'custom',
        name_de: 'Meine Übung',
        equipment: 'barbell',
        primary_muscles: ['chest'],
        secondary_muscles: ['triceps'],
      },
    ]);
    expect(rows.exercises).toHaveLength(2);

    const saved = markSaved(p);
    expect(planToRows(saved, now).newExercises).toEqual([]);
    expect(saved.days[0].exercises.every((e) => !e.isNew && e.newExercise === null)).toBe(true);
  });

  it('markSaved entfernt Archiviertes aus der Ansicht', () => {
    const saved = markSaved(pushPullLower());
    const after = markSaved(removeDay(saved, saved.days[0].id));
    expect(after.days.map((d) => d.name)).toEqual(['Pull', 'Lower']);
  });
});

describe('Laden', () => {
  it('sortiert nach Position, blendet Archiviertes aus und löst Übungsnamen auf', () => {
    const plans = plansFromRows(
      [
        {
          id: 'p1',
          name: 'Split',
          archived_at: null,
          fit_plan_days: [
            {
              id: 'd2',
              name: 'Pull',
              position: 2,
              archived_at: null,
              fit_plan_exercises: [],
            },
            {
              id: 'd1',
              name: 'Push',
              position: 1,
              archived_at: null,
              fit_plan_exercises: [
                { id: 'e2', exercise_id: 'ohp', position: 2, sets: 3, rep_min: 8, rep_max: 12, target_rir: null, rest_seconds: null, archived_at: null },
                { id: 'e1', exercise_id: 'bench', position: 1, sets: 4, rep_min: 6, rep_max: 10, target_rir: 1, rest_seconds: 180, archived_at: null },
                { id: 'e3', exercise_id: 'fly', position: 3, sets: 3, rep_min: 10, rep_max: 15, target_rir: null, rest_seconds: 60, archived_at: '2026-09-01T00:00:00Z' },
              ],
            },
            { id: 'd3', name: 'Alt', position: 3, archived_at: '2026-09-01T00:00:00Z', fit_plan_exercises: [] },
          ],
        },
        { id: 'p2', name: 'Altplan', archived_at: '2026-08-01T00:00:00Z', fit_plan_days: [] },
      ],
      { bench: 'Bankdrücken' },
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].days.map((d) => d.name)).toEqual(['Push', 'Pull']);
    const ex = plans[0].days[0].exercises;
    expect(ex.map((e) => e.name)).toEqual(['Bankdrücken', 'Unbekannte Übung']);
    expect(ex[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 10, targetRir: 1, restSeconds: 180, isNew: false });
    expect(ex[1].restSeconds).toBe(120);
    expect(validatePlan(plans[0])).toEqual(['„Pull" hat noch keine Übung.']);
  });
});

describe('Training aus Plantag', () => {
  const list = {
    bench: { id: 'bench', name: 'Bankdrücken (Langhantel)', equipment: 'barbell' },
  };

  it('übernimmt Planwerte, Übungsdaten und Vorschläge in den Entwurf', () => {
    let p = pushPullLower();
    const day = p.days[0];
    p = updatePlanExercise(p, day.id, day.exercises[0].id, {
      sets: 4,
      repMin: 8,
      repMax: 12,
      targetRir: 1,
      restSeconds: 180,
    });
    const d = draftFromPlanDay(
      p.days[0],
      list,
      {
        bench: [
          { type: 'working', weightKg: 50, reps: 12, rir: 0 },
          { type: 'working', weightKg: 50, reps: 12, rir: 0 },
          { type: 'working', weightKg: 50, reps: 11, rir: 0 },
        ],
      },
      now,
    );
    expect(d.name).toBe('Push');
    expect(d.planDayId).toBe(day.id);
    expect(d.exercises).toHaveLength(2);

    const bench = d.exercises[0];
    expect(bench.name).toBe('Bankdrücken (Langhantel)');
    expect(bench).toMatchObject({ plannedSets: 4, targetRir: 1, restSeconds: 180 });
    expect(bench.sets).toHaveLength(4);
    expect(bench.suggestion.action).toBe('increase');
    expect(bench.sets[0].weightKg).toBe(50);
    expect(bench.sets[0].reps).toBe(8);

    const ohp = d.exercises[1];
    expect(ohp.suggestion.action).toBe('no-data');
  });

  it('lässt archivierte Übungen weg', () => {
    const saved = markSaved(pushPullLower());
    const day = saved.days[0];
    const p = removePlanExercise(saved, day.id, day.exercises[0].id);
    const d = draftFromPlanDay(p.days[0], {}, {}, now);
    expect(d.exercises.map((e) => e.name)).toEqual(['Schulterdrücken']);
  });

  it('markiert noch nicht gespeicherte eigene Übungen als neu', () => {
    let p = addDay(setPlanName(newPlan(), 'X'), 'A');
    p = addPlanExercise(p, p.days[0].id, {
      exerciseId: 'mine',
      name: 'Eigene',
      isNew: true,
      equipment: 'machine',
    });
    const d = draftFromPlanDay(p.days[0], {}, {}, now);
    expect(d.exercises[0]).toMatchObject({ isNew: true, equipment: 'machine' });
  });
});
