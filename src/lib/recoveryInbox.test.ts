import { describe, expect, it } from 'vitest';
import { inboxPatchFor, shouldPromptRecovery, type RecoveryInboxRow } from './recoveryInbox';
import type { HistRecoveryEntry } from './storage';

const inbox: RecoveryInboxRow = {
  date: '2026-10-04',
  hrvMs: 48,
  restingHr: 52,
  sleepHours: 6.27,
  sleepStart: '2026-10-03T21:10:00.000Z',
  sleepEnd: '2026-10-04T05:30:00.000Z',
};

function entry(over: Partial<HistRecoveryEntry>): HistRecoveryEntry {
  return {
    id: 'e1', date: '2026-10-04', perceivedRecovery: 6, soreness: null, stress: null, sleepQuality: null,
    note: null, hrvMs: null, restingHr: null, sleepHours: null, sleepStart: null, sleepEnd: null,
    source: 'manual', ...over,
  } as HistRecoveryEntry;
}

describe('inboxPatchFor', () => {
  it('übernimmt fehlende Werte samt Nachtfenster', () => {
    expect(inboxPatchFor(entry({}), inbox)).toEqual({
      hrvMs: 48, restingHr: 52, sleepHours: 6.27, sleepStart: inbox.sleepStart, sleepEnd: inbox.sleepEnd,
    });
  });
  it('überschreibt vorhandene Werte nicht', () => {
    const p = inboxPatchFor(entry({ hrvMs: 40, restingHr: 50, sleepHours: 7, sleepStart: 'x', source: 'apple_health' }), inbox);
    expect(p).toEqual({});
  });
  it('ersetzt einen Apple-Health-Schlafwert ohne Nachtfenster (Altwert, z. B. 0,4 h)', () => {
    const p = inboxPatchFor(entry({ sleepHours: 0.4, source: 'apple_health' }), inbox);
    expect(p.sleepHours).toBe(6.27);
  });
  it('ergänzt Tief-/REM-Minuten auch bei vorhandener Schlafdauer, überschreibt aber keine', () => {
    const withStages = { ...inbox, deepSleepMin: 70, remSleepMin: 95 };
    const base = { sleepHours: 7, sleepStart: 'x', source: 'apple_health' as const, hrvMs: 40, restingHr: 50 };
    expect(inboxPatchFor(entry(base), withStages)).toEqual({ deepSleepMin: 70, remSleepMin: 95 });
    expect(inboxPatchFor(entry({ ...base, deepSleepMin: 60, remSleepMin: 80 }), withStages)).toEqual({});
  });
  it('lässt einen manuellen Schlafwert unangetastet', () => {
    expect(inboxPatchFor(entry({ sleepHours: 5, source: 'manual' }), inbox).sleepHours).toBeUndefined();
  });
});

describe('shouldPromptRecovery', () => {
  const base = { today: '2026-10-04', history: [], outboxDates: [], lastPromptDate: null, workoutRunning: false };
  it('fragt beim ersten Öffnen ohne Eintrag', () => expect(shouldPromptRecovery(base)).toBe(true));
  it('nicht, wenn heute schon ein Eintrag existiert', () =>
    expect(shouldPromptRecovery({ ...base, history: [{ date: '2026-10-04' }] })).toBe(false));
  it('nicht, wenn der Eintrag noch im Ausgangskorb liegt', () =>
    expect(shouldPromptRecovery({ ...base, outboxDates: ['2026-10-04'] })).toBe(false));
  it('nur einmal pro Tag', () => expect(shouldPromptRecovery({ ...base, lastPromptDate: '2026-10-04' })).toBe(false));
  it('nicht während eines Trainings', () => expect(shouldPromptRecovery({ ...base, workoutRunning: true })).toBe(false));
  it('am nächsten Tag wieder', () => expect(shouldPromptRecovery({ ...base, lastPromptDate: '2026-10-03' })).toBe(true));
});
