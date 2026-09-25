import { describe, expect, it } from 'vitest';
import { createStore, type KeyValueStorage } from './storage';
import { addExercise, buildPayload, createDraft, toggleDone } from './workout';

function fakeStorage(): KeyValueStorage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
  };
}

const brokenStorage: KeyValueStorage = {
  getItem() {
    throw new Error('gesperrt');
  },
  setItem() {
    throw new Error('gesperrt');
  },
  removeItem() {
    throw new Error('gesperrt');
  },
};

function payload(id?: string) {
  let d = createDraft('Push', null, new Date('2026-09-25T08:00:00Z'));
  d = addExercise(d, { exerciseId: 'ex-1', name: 'Bankdrücken', isNew: false });
  d = toggleDone(d, d.exercises[0].id, d.exercises[0].sets[0].id);
  const p = buildPayload(d, new Date('2026-09-25T09:00:00Z'))!;
  if (id) p.workout.id = id;
  return p;
}

describe('lokaler Speicher', () => {
  it('speichert und lädt den Entwurf und löscht ihn wieder', () => {
    const s = createStore(fakeStorage());
    expect(s.loadDraft()).toBeNull();
    const d = createDraft('Pull', null, new Date());
    expect(s.saveDraft(d)).toBe(true);
    expect(s.loadDraft()?.id).toBe(d.id);
    s.clearDraft();
    expect(s.loadDraft()).toBeNull();
  });

  it('legt Trainings in den Ausgangskorb, ohne dasselbe Training doppelt zu speichern', () => {
    const s = createStore(fakeStorage());
    s.enqueue(payload('a'));
    s.enqueue(payload('b'));
    s.enqueue(payload('a'));
    expect(s.loadOutbox().map((p) => p.workout.id)).toEqual(['b', 'a']);
  });

  it('merkt sich die letzten Sätze je Übung', () => {
    const s = createStore(fakeStorage());
    expect(s.getLastSets('ex-1')).toEqual([]);
    s.setLastSets('ex-1', [{ type: 'working', weightKg: 50, reps: 10, rir: 0 }]);
    s.setLastSets('ex-2', [{ type: 'working', weightKg: 20, reps: 12, rir: null }]);
    expect(s.getLastSets('ex-1')[0].weightKg).toBe(50);
    expect(s.getLastSets('ex-2')[0].weightKg).toBe(20);
  });

  it('bleibt bei defektem oder fehlendem Speicher benutzbar', () => {
    for (const s of [createStore(brokenStorage), createStore(null)]) {
      expect(s.loadDraft()).toBeNull();
      expect(s.loadOutbox()).toEqual([]);
      expect(s.saveDraft(createDraft('X', null, new Date()))).toBe(false);
      expect(s.enqueue(payload())).toBe(false);
      expect(() => s.clearDraft()).not.toThrow();
    }
  });

  it('ignoriert beschädigte Daten', () => {
    const raw = fakeStorage();
    raw.setItem('gym.draft.v1', '{kaputt');
    expect(createStore(raw).loadDraft()).toBeNull();
  });
});
