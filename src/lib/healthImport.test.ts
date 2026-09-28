import { describe, expect, it } from 'vitest';
import { buildHealthImportCandidates, matchHealthImportCandidates, withData } from './healthImport';
import type { HealthRecord } from './appleHealthImport';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistStretchSession } from './storage';

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
