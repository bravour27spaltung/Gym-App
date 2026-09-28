import { describe, expect, it } from 'vitest';
import {
  buildHealthImportCandidates,
  matchHealthImportCandidates,
  recoveryWindowForDate,
  withData,
} from './healthImport';
import type { HealthRecord } from './appleHealthImport';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistRecoveryEntry, HistStretchSession } from './storage';

function workout(over: Partial<HistWorkout> = {}): HistWorkout {
  return {
    id: 'w1',
    name: 'Push',
    startedAt: '2026-09-23T17:00:00.000Z',
    finishedAt: '2026-09-23T18:00:00.000Z',
    exercises: [],
    ...over,
  };
}

function stretch(over: Partial<HistStretchSession> = {}): HistStretchSession {
  return {
    id: 's1',
    startedAt: '2026-09-23T17:00:00.000Z',
    finishedAt: '2026-09-23T17:15:00.000Z',
    feelingBefore: null,
    feelingAfter: null,
    note: null,
    items: [],
    ...over,
  };
}

function football(over: Partial<HistFootballSession> = {}): HistFootballSession {
  return {
    id: 'f1',
    playedOn: '2026-09-23',
    startedAt: null,
    kind: 'training',
    minutes: 90,
    rpe: 6,
    note: null,
    distanceKm: null,
    calories: null,
    avgHeartRate: null,
    source: 'manual',
    ...over,
  };
}

function recovery(over: Partial<HistRecoveryEntry> = {}): HistRecoveryEntry {
  return {
    id: 'r1',
    date: '2026-09-23',
    perceivedRecovery: 7,
    soreness: null,
    stress: null,
    sleepQuality: null,
    note: null,
    hrvMs: null,
    restingHr: null,
    sleepHours: null,
    source: 'manual',
    ...over,
  };
}

describe('buildHealthImportCandidates', () => {
  it('nimmt Trainings/Stretching ohne Kalorien oder Puls auf', () => {
    const candidates = buildHealthImportCandidates([workout()], [stretch()], []);
    expect(candidates.map((c) => c.kind)).toEqual(['workout', 'stretch']); // gleiche fromMs: stabile Sortierung nach Einfügereihenfolge
  });

  it('lässt Trainings/Stretching mit bereits vollständigen Werten weg', () => {
    const w = workout({ calories: 400, avgHeartRate: 130 });
    const s = stretch({ calories: 50, avgHeartRate: 90 });
    expect(buildHealthImportCandidates([w], [s], [])).toEqual([]);
  });

  it('lässt unbeendete Trainings/Stretching weg (kein Endzeitpunkt = kein Fenster)', () => {
    expect(buildHealthImportCandidates([workout({ finishedAt: null })], [], [])).toEqual([]);
    expect(buildHealthImportCandidates([], [stretch({ finishedAt: null })], [])).toEqual([]);
  });

  it('nimmt Fußball nur mit gesetzter Startzeit auf und prüft auch die Distanz', () => {
    const withoutTime = football({ id: 'f-no-time' });
    const withTime = football({ id: 'f-time', startedAt: '2026-09-23T17:00:00.000Z' });
    const complete = football({
      id: 'f-complete',
      startedAt: '2026-09-23T17:00:00.000Z',
      distanceKm: 5,
      calories: 400,
      avgHeartRate: 140,
    });
    const candidates = buildHealthImportCandidates([], [], [withoutTime, withTime, complete]);
    expect(candidates.map((c) => c.id)).toEqual(['f-time']);
  });

  it('nimmt Recovery-Einträge auf, denen noch HRV, Ruhepuls oder Schlaf fehlt', () => {
    const incomplete = recovery({ id: 'r-open', hrvMs: 45 }); // restingHr/sleepHours fehlen noch
    const complete = recovery({ id: 'r-complete', hrvMs: 45, restingHr: 52, sleepHours: 7.5 });
    const candidates = buildHealthImportCandidates([], [], [], [incomplete, complete]);
    expect(candidates.map((c) => c.id)).toEqual(['r-open']);
    expect(candidates[0].kind).toBe('recovery');
  });

  it('ohne recoveries-Argument bleibt das Verhalten wie zuvor (Rückwärtskompatibilität)', () => {
    expect(buildHealthImportCandidates([], [], [])).toEqual([]);
  });
});

describe('recoveryWindowForDate', () => {
  it('spannt vom Vorabend 18 Uhr bis zum Folgevormittag 12 Uhr lokal', () => {
    const { fromMs, toMs } = recoveryWindowForDate('2026-09-23');
    expect(new Date(fromMs).toISOString()).toBe(new Date('2026-09-22T18:00:00').toISOString());
    expect(new Date(toMs).toISOString()).toBe(new Date('2026-09-23T12:00:00').toISOString());
  });
});

describe('matchHealthImportCandidates / withData', () => {
  const records: HealthRecord[] = [
    { type: 'HKQuantityTypeIdentifierActiveEnergyBurned', value: 300, startMs: Date.parse('2026-09-23T17:10:00.000Z'), isWatch: true },
    { type: 'HKQuantityTypeIdentifierHeartRate', value: 140, startMs: Date.parse('2026-09-23T17:20:00.000Z'), isWatch: true },
  ];

  it('befüllt nur fehlende Felder, überschreibt nie vorhandene Werte', () => {
    const w = workout({ id: 'w-cal', calories: null, avgHeartRate: 99 }); // avgHeartRate schon gesetzt
    const candidates = buildHealthImportCandidates([w], [], []);
    const matches = matchHealthImportCandidates(records, candidates);
    expect(matches).toHaveLength(1);
    expect(matches[0].patch).toEqual({ calories: 300 });
  });

  it('befüllt HRV/Ruhepuls/Schlaf nur bei Recovery-Kandidaten, nie bei anderen Arten', () => {
    const recRecords: HealthRecord[] = [
      { type: 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN', value: 45, startMs: Date.parse('2026-09-23T05:00:00.000Z'), isWatch: true },
      { type: 'HKQuantityTypeIdentifierRestingHeartRate', value: 52, startMs: Date.parse('2026-09-23T05:00:00.000Z'), isWatch: true },
    ];
    const r = recovery({ id: 'r-open' });
    const w = workout({ id: 'w-same-window', startedAt: '2026-09-23T04:00:00.000Z', finishedAt: '2026-09-23T06:00:00.000Z' });
    const candidates = buildHealthImportCandidates([w], [], [], [r]);
    const matches = matchHealthImportCandidates(recRecords, candidates);
    const recMatch = matches.find((m) => m.candidate.kind === 'recovery')!;
    const workoutMatch = matches.find((m) => m.candidate.kind === 'workout')!;
    expect(recMatch.patch).toEqual({ hrvMs: 45, restingHr: 52 });
    expect(workoutMatch.patch).toEqual({}); // Training kennt keine HRV/Ruhepuls-Spalten
  });

  it('withData lässt Treffer ohne jeden neuen Wert weg', () => {
    const w = workout({
      id: 'w-far',
      startedAt: '2026-01-01T00:00:00.000Z',
      finishedAt: '2026-01-01T01:00:00.000Z',
    });
    const candidates = buildHealthImportCandidates([w], [], []);
    const matches = matchHealthImportCandidates(records, candidates);
    expect(withData(matches)).toEqual([]);
  });
});
