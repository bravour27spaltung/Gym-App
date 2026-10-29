import { describe, expect, it } from 'vitest';
import { addDay, addPlanExercise, draftFromPlanDay, newPlan, setPlanName } from './plan';
import { createStore, type KeyValueStorage } from './storage';
import { mergeSeatNotes, resolveSeatNote } from './seatNote';

function memoryStorage(): KeyValueStorage {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

describe('mergeSeatNotes', () => {
  it('übernimmt den Server-Stand', () => {
    expect(mergeSeatNotes({ a: 'Sitz 4' }, {})).toEqual({ a: 'Sitz 4' });
  });

  it('lokale, noch nicht gesendete Änderungen gewinnen', () => {
    expect(mergeSeatNotes({ a: 'Sitz 4', b: 'Lehne 2' }, { a: 'Sitz 5', c: 'Griff weit' })).toEqual({
      a: 'Sitz 5',
      b: 'Lehne 2',
      c: 'Griff weit',
    });
  });

  it('eine leere Notiz im Ausgangskorb löscht den Eintrag', () => {
    expect(mergeSeatNotes({ a: 'Sitz 4', b: 'Lehne 2' }, { a: '  ' })).toEqual({ b: 'Lehne 2' });
  });

  it('verändert die Eingaben nicht', () => {
    const server = { a: 'x' };
    mergeSeatNotes(server, { a: '' });
    expect(server).toEqual({ a: 'x' });
  });
});

describe('resolveSeatNote', () => {
  it('bevorzugt die gespeicherte Sitzeinstellung', () => {
    expect(resolveSeatNote('Sitz 5', 'Sitz 4')).toBe('Sitz 5');
  });
  it('fällt auf die Plan-Notiz zurück', () => {
    expect(resolveSeatNote(undefined, 'Sitz 4')).toBe('Sitz 4');
    expect(resolveSeatNote('  ', ' Sitz 4 ')).toBe('Sitz 4');
  });
  it('liefert undefined, wenn beides leer ist', () => {
    expect(resolveSeatNote(undefined, '')).toBeUndefined();
    expect(resolveSeatNote('', '   ')).toBeUndefined();
  });
});

describe('Start aus dem Plan', () => {
  const now = new Date('2026-10-29T08:00:00.000Z');
  function planWithNotes() {
    let p = setPlanName(newPlan(), 'Split');
    p = addDay(p, 'Push');
    const day = p.days[0].id;
    p = addPlanExercise(p, day, { exerciseId: 'press', name: 'Beinpresse', isNew: false, sets: 3, note: 'Sitz 4' });
    p = addPlanExercise(p, day, { exerciseId: 'curl', name: 'Beincurl', isNew: false, sets: 3 });
    return p.days[0];
  }
  const note = (d: ReturnType<typeof draftFromPlanDay>, id: string) => d.exercises.find((e) => e.exerciseId === id)?.note;

  it('ohne gespeicherte Sitzeinstellung gilt die Plan-Notiz', () => {
    const d = draftFromPlanDay(planWithNotes(), {}, {}, now);
    expect(note(d, 'press')).toBe('Sitz 4');
    expect(note(d, 'curl')).toBeUndefined();
  });

  it('die gespeicherte Sitzeinstellung der Übung hat Vorrang und füllt auch Übungen ohne Plan-Notiz', () => {
    const d = draftFromPlanDay(planWithNotes(), {}, {}, now, {}, { press: 'Sitz 6', curl: 'Lehne 2' });
    expect(note(d, 'press')).toBe('Sitz 6');
    expect(note(d, 'curl')).toBe('Lehne 2');
  });
});

describe('Store: Sitzeinstellungen', () => {
  it('speichert eine Notiz lokal und im Ausgangskorb', () => {
    const store = createStore(memoryStorage());
    expect(store.setSeatNote('ex1', '  Sitz 4  ')).toBe(true);
    expect(store.getSeatNote('ex1')).toBe('Sitz 4');
    expect(store.loadSeatNotesOutbox()).toEqual({ ex1: 'Sitz 4' });
  });

  it('eine geleerte Notiz verschwindet lokal und steht als Löschauftrag im Ausgangskorb', () => {
    const store = createStore(memoryStorage());
    store.setSeatNote('ex1', 'Sitz 4');
    store.setSeatNote('ex1', '');
    expect(store.getSeatNote('ex1')).toBeUndefined();
    expect(store.loadSeatNotesOutbox()).toEqual({ ex1: '' });
  });

  it('übersteht ein neues Store-Objekt auf demselben Speicher (Neuladen der App)', () => {
    const storage = memoryStorage();
    createStore(storage).setSeatNote('ex1', 'Sitz 4');
    expect(createStore(storage).getSeatNote('ex1')).toBe('Sitz 4');
  });

  it('läuft ohne Speicher (privater Modus) ohne Fehler', () => {
    const store = createStore(null);
    expect(store.setSeatNote('ex1', 'Sitz 4')).toBe(false);
    expect(store.getSeatNote('ex1')).toBeUndefined();
  });
});
