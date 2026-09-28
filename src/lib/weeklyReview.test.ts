import { describe, expect, it } from 'vitest';
import type { Plan } from './plan';
import type { HistWorkout, MuscleInfo } from './stats';
import { buildWeeklyReview, isLastPlanDay, type ReviewContext } from './weeklyReview';

const d = (day: number, h = 10) => new Date(2026, 8, day, h, 0, 0).toISOString();
const end = (day: number, h = 11) => new Date(2026, 8, day, h, 0, 0).toISOString();

function workout(
  id: string,
  day: number,
  exerciseId: string,
  sets: [number, number][],
  opts: { eq?: number | null } = {},
): HistWorkout {
  return {
    id,
    name: 'Training',
    startedAt: d(day),
    finishedAt: end(day),
    exercises: [
      {
        exerciseId,
        equipmentKg: opts.eq ?? null,
        sets: sets.map(([weightKg, reps]) => ({ type: 'working' as const, weightKg, reps })),
      },
    ],
  };
}

function plan(dayIds: string[]): Plan {
  return {
    id: 'plan-1',
    kind: 'plan',
    name: 'Push Pull Legs',
    archived: false,
    isNew: false,
    days: dayIds.map((id, i) => ({
      id,
      name: `Tag ${i + 1}`,
      exercises: [],
      archived: false,
      isNew: false,
    })),
  };
}

const muscleOf =
  (map: Record<string, MuscleInfo>) =>
  (id: string): MuscleInfo =>
    map[id] ?? { primary: [], secondary: [] };

const baseCtx: ReviewContext = {
  nameOf: (id) => id,
  muscleOf: muscleOf({ bench: { primary: ['chest'], secondary: ['triceps'] } }),
  rangeOf: () => ({ repMin: 8, repMax: 12 }),
};

describe('isLastPlanDay', () => {
  it('erkennt den letzten sichtbaren Tag der Rotation', () => {
    const p = plan(['push', 'pull', 'legs']);
    expect(isLastPlanDay(p, 'legs')).toBe(true);
    expect(isLastPlanDay(p, 'push')).toBe(false);
  });

  it('ignoriert archivierte Tage am Ende', () => {
    const p = plan(['push', 'pull', 'legs']);
    p.days[2].archived = true;
    expect(isLastPlanDay(p, 'pull')).toBe(true);
    expect(isLastPlanDay(p, 'legs')).toBe(false);
  });

  it('liefert false ohne sichtbare Tage', () => {
    const p = plan([]);
    expect(isLastPlanDay(p, 'x')).toBe(false);
  });
});

describe('buildWeeklyReview', () => {
  it('zählt Trainings, Sätze und Volumen nur innerhalb der letzten 7 Tage', () => {
    const p = plan(['push', 'pull', 'legs']);
    const workouts = [
      workout('w1', 10, 'bench', [[60, 10], [60, 9]]),
      workout('w2', 2, 'bench', [[60, 10]]), // außerhalb des 7-Tage-Fensters bis Tag 10
    ];
    const review = buildWeeklyReview(p, workouts, new Date(2026, 8, 10, 11, 0, 0), baseCtx);
    expect(review.totals.sessions).toBe(1);
    expect(review.totals.workingSets).toBe(2);
    expect(review.adherence.plannedDays).toBe(3);
    expect(review.adherence.doneSessions).toBe(1);
  });

  it('ordnet Sätze pro Muskel gegen den Richtwert ein', () => {
    const p = plan(['push']);
    const workouts = [
      workout('w1', 8, 'bench', [[60, 10], [60, 9], [60, 8]]),
      workout('w2', 9, 'bench', [[60, 10], [60, 9], [60, 8]]),
      workout('w3', 10, 'bench', [[60, 10], [60, 9], [60, 8]]),
    ];
    const review = buildWeeklyReview(p, workouts, new Date(2026, 8, 10, 11, 0, 0), baseCtx);
    const chest = review.muscles.find((m) => m.muscle === 'chest');
    expect(chest?.sets).toBe(9);
    expect(chest?.status).toBe('under');
    expect(chest?.sessions).toBe(3);
  });

  it('meldet neue Bestwerte innerhalb der Woche gegen alles Frühere', () => {
    const p = plan(['push']);
    const workouts = [
      workout('w0', 1, 'bench', [[60, 10]]),
      workout('w1', 8, 'bench', [[70, 10]]),
      workout('w2', 10, 'bench', [[80, 10]]),
    ];
    const review = buildWeeklyReview(p, workouts, new Date(2026, 8, 10, 11, 0, 0), baseCtx);
    expect(review.records.filter((r) => r.kind === 'load')).toHaveLength(2);
    expect(review.records.some((r) => r.value === 70)).toBe(true);
    expect(review.records.some((r) => r.value === 80)).toBe(true);
  });

  it('gibt Steigern/Halten aus der jüngsten Einheit dieser Woche', () => {
    const p = plan(['push']);
    const workouts = [
      workout('w1', 8, 'bench', [[60, 12], [60, 12], [60, 11]]), // Steigern
      workout('w2', 10, 'bench', [[60, 9], [60, 8]]), // Halten (jüngste Einheit)
    ];
    const review = buildWeeklyReview(p, workouts, new Date(2026, 8, 10, 11, 0, 0), baseCtx);
    expect(review.exercises[0].action).toBe('hold');
  });

  it('ohne Trainings in den letzten 7 Tagen bleiben Listen leer', () => {
    const p = plan(['push']);
    const review = buildWeeklyReview(p, [], new Date(2026, 8, 10, 11, 0, 0), baseCtx);
    expect(review.totals.sessions).toBe(0);
    expect(review.muscles).toHaveLength(0);
    expect(review.exercises).toHaveLength(0);
    expect(review.records).toHaveLength(0);
  });
});
