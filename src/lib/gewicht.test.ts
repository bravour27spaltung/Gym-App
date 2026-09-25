import { describe, expect, it } from 'vitest';
import { createStore } from './storage';
import { kgText, parseKg, roundKg } from './weight';
import { addExercise, createDraft, toggleDone, updateSetWeight } from './workout';

const now = new Date('2026-09-25T10:00:00.000Z');

describe('Gewicht eintippen', () => {
  it('liest deutsche und englische Schreibweise', () => {
    expect(parseKg('62,5')).toBe(62.5);
    expect(parseKg('62.5')).toBe(62.5);
    expect(parseKg(' 80 ')).toBe(80);
    expect(parseKg('0')).toBe(0);
    expect(parseKg('62,75')).toBe(62.75);
  });

  it('übernimmt nur vollständige Werte auf dem 0,25-Raster', () => {
    expect(parseKg('')).toBeNull();
    expect(parseKg('62,')).toBeNull();
    expect(parseKg('62,3')).toBeNull();
    expect(parseKg('abc')).toBeNull();
    expect(parseKg('-5')).toBeNull();
    expect(parseKg('1000')).toBeNull();
  });

  it('rundet auf 0,25 kg und begrenzt auf 0 bis 999', () => {
    expect(roundKg(62.3)).toBe(62.25);
    expect(roundKg(62.4)).toBe(62.5);
    expect(roundKg(-3)).toBe(0);
    expect(roundKg(5000)).toBe(999);
    expect(roundKg(NaN)).toBe(0);
  });

  it('zeigt Gewichte mit Komma', () => {
    expect(kgText(62.5)).toBe('62,5');
    expect(kgText(80)).toBe('80');
  });
});

describe('Gewicht ändern zieht folgende Sätze mit', () => {
  function bench() {
    let d = createDraft('Push', null, now);
    d = addExercise(d, {
      exerciseId: 'bench',
      name: 'Bankdrücken',
      isNew: false,
      plannedSets: 4,
      lastSets: [
        { type: 'working', weightKg: 60, reps: 8, rir: null },
        { type: 'working', weightKg: 60, reps: 8, rir: null },
      ],
    });
    return d;
  }

  it('übernimmt das neue Gewicht in noch offene Sätze mit dem alten Gewicht', () => {
    const d0 = bench();
    const ex = d0.exercises[0];
    const d1 = updateSetWeight(d0, ex.id, ex.sets[0].id, 65);
    expect(d1.exercises[0].sets.map((s) => s.weightKg)).toEqual([65, 65, 65, 65]);
    expect(d0.exercises[0].sets.map((s) => s.weightKg)).toEqual([60, 60, 60, 60]);
  });

  it('lässt bereits erledigte und bewusst andere Sätze unverändert', () => {
    let d = bench();
    const ex = d.exercises[0];
    d = updateSetWeight(d, ex.id, ex.sets[2].id, 70); // Satz 3 bewusst schwerer (zieht Satz 4 mit)
    d = toggleDone(d, ex.id, d.exercises[0].sets[1].id); // Satz 2 erledigt
    d = updateSetWeight(d, ex.id, d.exercises[0].sets[0].id, 62.5);
    // Satz 2 ist erledigt (bleibt 60), Satz 3 und 4 hatten 70 (bleiben)
    expect(d.exercises[0].sets.map((s) => s.weightKg)).toEqual([62.5, 60, 70, 70]);
  });

  it('ändert Sätze davor nie', () => {
    const d0 = bench();
    const ex = d0.exercises[0];
    const d1 = updateSetWeight(d0, ex.id, ex.sets[2].id, 55);
    expect(d1.exercises[0].sets.map((s) => s.weightKg)).toEqual([60, 60, 55, 55]);
  });

  it('ändert bei einem unbekannten Satz nichts', () => {
    const d0 = bench();
    expect(updateSetWeight(d0, d0.exercises[0].id, 'gibt-es-nicht', 99)).toEqual(d0);
  });
});

describe('Stangengewicht merken', () => {
  function memory() {
    const data = new Map<string, string>();
    return createStore({
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => void data.set(k, v),
      removeItem: (k) => void data.delete(k),
    });
  }

  it('merkt sich das Stangengewicht je Übung', () => {
    const store = memory();
    expect(store.getLastEquipment('bench')).toBeNull();
    store.setLastEquipment('bench', 20);
    store.setLastEquipment('row', null);
    expect(store.getLastEquipment('bench')).toBe(20);
    expect(store.getLastEquipment('row')).toBeNull();
  });
});
