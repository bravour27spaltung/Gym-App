import { describe, expect, it } from 'vitest';
import { combineHistory } from './combinedHistory';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistStretchSession } from './storage';

function workout(id: string, startedAt: string): HistWorkout {
  return { id, name: 'Push', startedAt, finishedAt: startedAt, exercises: [] };
}

function stretch(id: string, startedAt: string): HistStretchSession {
  return { id, startedAt, finishedAt: startedAt, feelingBefore: null, feelingAfter: null, note: null, items: [] };
}

function football(id: string, playedOn: string): HistFootballSession {
  return {
    id,
    playedOn,
    startedAt: null,
    kind: 'training',
    minutes: 60,
    rpe: 6,
    note: null,
    distanceKm: null,
    calories: null,
    avgHeartRate: null,
    source: 'manual',
  };
}

describe('combineHistory', () => {
  it('führt Trainings und Stretching-Sessions zeitlich absteigend zusammen', () => {
    const workouts = [workout('w1', '2026-09-01T10:00:00.000Z'), workout('w2', '2026-09-03T10:00:00.000Z')];
    const stretches = [stretch('s1', '2026-09-02T10:00:00.000Z')];
    const combined = combineHistory(workouts, stretches);
    expect(combined.map((e) => (e.kind === 'workout' ? e.workout.id : e.session.id))).toEqual(['w2', 's1', 'w1']);
  });

  it('lässt Workout- und Stretch-Objekte unverändert (keine Vermischung der Felder)', () => {
    const w = workout('w1', '2026-09-01T10:00:00.000Z');
    const s = stretch('s1', '2026-09-02T10:00:00.000Z');
    const combined = combineHistory([w], [s]);
    const workoutEntry = combined.find((e) => e.kind === 'workout');
    const stretchEntry = combined.find((e) => e.kind === 'stretch');
    expect(workoutEntry).toMatchObject({ kind: 'workout', workout: w });
    expect(stretchEntry).toMatchObject({ kind: 'stretch', session: s });
  });

  it('leere Listen ergeben eine leere Übersicht', () => {
    expect(combineHistory([], [])).toEqual([]);
  });

  it('reiht Fußball-Einträge chronologisch mit ein', () => {
    const workouts = [workout('w1', '2026-09-01T10:00:00.000Z')];
    const stretches = [stretch('s1', '2026-09-02T10:00:00.000Z')];
    const footballs = [football('f1', '2026-09-03T00:00:00.000Z')];
    const combined = combineHistory(workouts, stretches, footballs);
    expect(combined.map((e) => e.kind)).toEqual(['football', 'stretch', 'workout']);
  });
});
