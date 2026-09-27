import { describe, expect, it } from 'vitest';
import { createStore, type KeyValueStorage } from './storage';
import { CONFIRM_WORD, isConfirmed, resetSteps } from './reset';

function fakeStorage(): KeyValueStorage & { keys(): string[] } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}

describe('resetSteps', () => {
  it('löscht bei "training" nur Trainings und Fußball, nie Pläne oder Übungen', () => {
    const tables = resetSteps('training').map((s) => s.table);
    expect(tables).toEqual(['fit_workouts', 'fit_football_sessions']);
  });

  it('löscht bei "all" zusätzlich Pläne und nur eigene Übungen, in sicherer Reihenfolge', () => {
    const steps = resetSteps('all');
    const tables = steps.map((s) => s.table);
    expect(tables).toEqual(['fit_workouts', 'fit_football_sessions', 'fit_plans', 'fit_exercises']);
    // Eigene Übungen zuletzt, weil Trainings und Pläne auf sie verweisen.
    expect(tables.indexOf('fit_exercises')).toBe(tables.length - 1);
    expect(steps[steps.length - 1].only).toEqual({ column: 'source', value: 'custom' });
  });
});

describe('isConfirmed', () => {
  it('erwartet das Bestätigungswort, unabhängig von Groß-/Kleinschreibung', () => {
    expect(isConfirmed(CONFIRM_WORD)).toBe(true);
    expect(isConfirmed('  löschen ')).toBe(true);
    expect(isConfirmed('loeschen')).toBe(true);
    expect(isConfirmed('')).toBe(false);
    expect(isConfirmed('lösch')).toBe(false);
  });
});

describe('lokaler Speicher zurücksetzen', () => {
  function filled() {
    const raw = fakeStorage();
    const s = createStore(raw);
    s.saveDraft({ id: 'd', name: 'x', planDayId: null, startedAt: 'now', exercises: [] });
    s.saveOutbox([]);
    s.setLastSets('e1', [{ type: 'working', weightKg: 50, reps: 8, rir: null }]);
    s.setLastEquipment('e1', 10);
    s.saveHistory([]);
    s.setLastPlanDayId('day-1');
    s.saveExercises([{ id: 'e1', name: 'Bankdrücken' }]);
    s.savePlans([]);
    return { raw, s };
  }

  it('clearTrainingData entfernt Trainingsstand, behält Pläne und Übungsliste', () => {
    const { raw, s } = filled();
    s.clearTrainingData();
    expect(s.loadDraft()).toBeNull();
    expect(s.getLastSets('e1')).toEqual([]);
    expect(s.getLastEquipment('e1')).toBeNull();
    expect(s.getLastPlanDayId()).toBeNull();
    expect(s.loadHistory()).toEqual([]);
    expect(raw.keys().sort()).toEqual(['gym.exercises.v1', 'gym.plans.v1']);
  });

  it('clearAll entfernt alles', () => {
    const { raw, s } = filled();
    s.clearAll();
    expect(raw.keys()).toEqual([]);
  });

  it('läuft ohne Speicher oder mit gesperrtem Speicher ohne Fehler', () => {
    expect(() => createStore(null).clearAll()).not.toThrow();
    const broken: KeyValueStorage = {
      getItem() { throw new Error('gesperrt'); },
      setItem() { throw new Error('gesperrt'); },
      removeItem() { throw new Error('gesperrt'); },
    };
    expect(() => createStore(broken).clearTrainingData()).not.toThrow();
  });
});
