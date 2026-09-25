import { describe, expect, it } from 'vitest';
import {
  addExercise,
  addSet,
  addWarmups,
  buildPayload,
  copyWeightToLaterSets,
  createDraft,
  describeLastSets,
  doneSetsAsLogged,
  removeSet,
  toggleDone,
  updateExercise,
  updateSet,
} from './workout';
import type { LoggedSet } from './progression';

const now = new Date('2026-09-25T08:00:00.000Z');
const later = new Date('2026-09-25T09:00:00.000Z');

const lastTime: LoggedSet[] = [
  { type: 'working', weightKg: 50, reps: 12, rir: 0 },
  { type: 'working', weightKg: 50, reps: 12, rir: 1 },
  { type: 'working', weightKg: 50, reps: 11, rir: 0 },
];

function draftWithBench(lastSets: LoggedSet[] = lastTime) {
  const d = createDraft('Push', null, now);
  return addExercise(d, {
    exerciseId: 'ex-bench',
    name: 'Bankdrücken',
    isNew: false,
    repMin: 8,
    repMax: 12,
    incrementKg: 2.5,
    plannedSets: 3,
    lastSets,
  });
}

describe('Vorbelegung', () => {
  it('belegt nach erreichter Obergrenze mit erhöhtem Gewicht und unterer Grenze vor', () => {
    const e = draftWithBench().exercises[0];
    expect(e.suggestion.action).toBe('increase');
    expect(e.sets).toHaveLength(3);
    for (const s of e.sets) {
      expect(s.weightKg).toBe(52.5);
      expect(s.reps).toBe(8);
      expect(s.done).toBe(false);
    }
  });

  it('belegt ohne Vorgeschichte mit 0 kg und unterer Grenze vor', () => {
    const e = draftWithBench([]).exercises[0];
    expect(e.suggestion.action).toBe('no-data');
    expect(e.sets[0].weightKg).toBe(0);
    expect(e.sets[0].reps).toBe(8);
  });

  it('hält das Gewicht und strebt eine Wiederholung mehr an, wenn die Grenze nicht erreicht war', () => {
    const e = draftWithBench([
      { type: 'working', weightKg: 50, reps: 10, rir: 0 },
      { type: 'working', weightKg: 50, reps: 9, rir: 0 },
    ]).exercises[0];
    expect(e.sets[0].weightKg).toBe(50);
    expect(e.sets[0].reps).toBe(11);
  });
});

describe('Sätze bearbeiten', () => {
  it('ändert, hakt ab, fügt hinzu und entfernt Sätze, ohne den Entwurf zu verändern', () => {
    const d0 = draftWithBench();
    const exId = d0.exercises[0].id;
    const setId = d0.exercises[0].sets[0].id;

    const d1 = updateSet(d0, exId, setId, { weightKg: 55.25, reps: 9, rir: 0 });
    expect(d1.exercises[0].sets[0]).toMatchObject({ weightKg: 55.25, reps: 9, rir: 0 });
    expect(d0.exercises[0].sets[0].weightKg).toBe(52.5);

    const d2 = toggleDone(d1, exId, setId);
    expect(d2.exercises[0].sets[0].done).toBe(true);
    expect(toggleDone(d2, exId, setId).exercises[0].sets[0].done).toBe(false);

    const d3 = addSet(d2, exId);
    expect(d3.exercises[0].sets).toHaveLength(4);
    expect(d3.exercises[0].sets[3].weightKg).toBe(52.5);

    const d4 = removeSet(d3, exId, d3.exercises[0].sets[3].id);
    expect(d4.exercises[0].sets).toHaveLength(3);
  });
});

describe('Gewicht übernehmen', () => {
  it('kopiert das Gewicht auf folgende offene Sätze derselben Art, nicht auf erledigte oder frühere', () => {
    let d = draftWithBench([]);
    const exId = d.exercises[0].id;
    const [s1, s2, s3] = d.exercises[0].sets;
    d = updateSet(d, exId, s1.id, { weightKg: 60 });
    d = updateSet(d, exId, s2.id, { weightKg: 55, reps: 9 });
    d = toggleDone(d, exId, s2.id); // erledigt: bleibt unverändert
    d = copyWeightToLaterSets(d, exId, s1.id);
    const w = d.exercises[0].sets.map((s) => s.weightKg);
    expect(w).toEqual([60, 55, 60]);
    // frühere Sätze bleiben unberührt
    d = updateSet(d, exId, s3.id, { weightKg: 70 });
    d = copyWeightToLaterSets(d, exId, s3.id);
    expect(d.exercises[0].sets.map((s) => s.weightKg)).toEqual([60, 55, 70]);
    expect(d.exercises[0].sets[1].reps).toBe(9);
  });

  it('lässt Aufwärmsätze bei Arbeitssätzen in Ruhe', () => {
    let d = draftWithBench();
    const exId = d.exercises[0].id;
    d = addWarmups(d, exId, 'full');
    const firstWork = d.exercises[0].sets.find((s) => s.type === 'working')!;
    const warmBefore = d.exercises[0].sets.filter((s) => s.type === 'warmup').map((s) => s.weightKg);
    d = updateSet(d, exId, firstWork.id, { weightKg: 99 });
    d = copyWeightToLaterSets(d, exId, firstWork.id);
    expect(d.exercises[0].sets.filter((s) => s.type === 'warmup').map((s) => s.weightKg)).toEqual(warmBefore);
    expect(d.exercises[0].sets.filter((s) => s.type === 'working').map((s) => s.weightKg)).toEqual([99, 99, 99]);
  });
});

describe('Aufwärmsätze', () => {
  it('fügt die Rampe vor den Arbeitssätzen ein und verdoppelt bei erneutem Klick nichts', () => {
    const d0 = draftWithBench();
    const exId = d0.exercises[0].id;
    const d1 = addWarmups(d0, exId, 'full');
    const types1 = d1.exercises[0].sets.map((s) => s.type);
    expect(types1).toEqual(['warmup', 'warmup', 'warmup', 'working', 'working', 'working']);

    const d2 = addWarmups(d1, exId, 'full');
    expect(d2.exercises[0].sets.filter((s) => s.type === 'warmup')).toHaveLength(3);
  });

  it('lässt bereits abgehakte Aufwärmsätze stehen', () => {
    const d0 = draftWithBench();
    const exId = d0.exercises[0].id;
    const d1 = addWarmups(d0, exId, 'full');
    const firstWarm = d1.exercises[0].sets[0];
    const d2 = toggleDone(d1, exId, firstWarm.id);
    const d3 = addWarmups(d2, exId, 'short');
    expect(d3.exercises[0].sets[0].id).toBe(firstWarm.id);
    expect(d3.exercises[0].sets[0].done).toBe(true);
  });

  it('macht ohne Arbeitsgewicht nichts', () => {
    const d0 = draftWithBench([]);
    const d1 = addWarmups(d0, d0.exercises[0].id, 'full');
    expect(d1.exercises[0].sets.filter((s) => s.type === 'warmup')).toHaveLength(0);
  });
});

describe('Anzeige und Übungsdaten', () => {
  it('fasst das letzte Training kurz zusammen', () => {
    expect(describeLastSets(lastTime)).toBe('50 kg × 12, 12, 11');
    expect(
      describeLastSets([
        { type: 'warmup', weightKg: 20, reps: 10, rir: null },
        { type: 'working', weightKg: 52.5, reps: 8, rir: 0 },
        { type: 'working', weightKg: 50, reps: 9, rir: 0 },
      ]),
    ).toBe('52,5 kg × 8 · 50 kg × 9');
    expect(describeLastSets([])).toBe('');
  });

  it('ändert Pausendauer und Stangengewicht einer Übung', () => {
    const d0 = draftWithBench();
    const d1 = updateExercise(d0, d0.exercises[0].id, { restSeconds: 180, equipmentKg: 20 });
    expect(d1.exercises[0]).toMatchObject({ restSeconds: 180, equipmentKg: 20 });
    expect(d0.exercises[0].restSeconds).toBe(120);
  });
});

describe('Abschluss', () => {
  it('speichert nur abgehakte Sätze und nummeriert sie fortlaufend', () => {
    let d = draftWithBench();
    const e = d.exercises[0];
    d = toggleDone(d, e.id, e.sets[0].id);
    d = toggleDone(d, e.id, e.sets[2].id);

    const p = buildPayload(d, later)!;
    expect(p.workout.finished_at).toBe(later.toISOString());
    expect(p.workoutExercises).toHaveLength(1);
    expect(p.sets.map((s) => s.set_number)).toEqual([1, 2]);
    expect(p.sets.every((s) => s.workout_exercise_id === e.id)).toBe(true);
  });

  it('liefert null, wenn nichts abgehakt wurde', () => {
    expect(buildPayload(draftWithBench(), later)).toBeNull();
  });

  it('lässt Übungen ohne abgehakten Satz weg', () => {
    let d = draftWithBench();
    d = addExercise(d, { exerciseId: 'ex-fly', name: 'Fliegende', isNew: false });
    const e = d.exercises[0];
    d = toggleDone(d, e.id, e.sets[0].id);
    const p = buildPayload(d, later)!;
    expect(p.workoutExercises.map((w) => w.exercise_id)).toEqual(['ex-bench']);
  });

  it('legt neue eigene Übungen genau einmal an', () => {
    let d = createDraft('Freies Training', null, now);
    d = addExercise(d, { exerciseId: 'new-1', name: 'Meine Übung', isNew: true, incrementKg: 1.25 });
    d = addExercise(d, { exerciseId: 'new-1', name: 'Meine Übung', isNew: true, incrementKg: 1.25 });
    for (const e of d.exercises) d = toggleDone(d, e.id, e.sets[0].id);
    const p = buildPayload(d, later)!;
    expect(p.newExercises).toHaveLength(1);
    expect(p.newExercises[0]).toMatchObject({ id: 'new-1', name_de: 'Meine Übung', increment_kg: 1.25 });
  });

  it('gibt abgehakte Sätze als Grundlage der nächsten Vorbelegung zurück', () => {
    let d = draftWithBench();
    const e = d.exercises[0];
    d = updateSet(d, e.id, e.sets[0].id, { weightKg: 52.5, reps: 10, rir: 0 });
    d = toggleDone(d, e.id, e.sets[0].id);
    expect(doneSetsAsLogged(d.exercises[0])).toEqual([
      { type: 'working', weightKg: 52.5, reps: 10, rir: 0 },
    ]);
  });
});
