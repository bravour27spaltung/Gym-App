import { describe, expect, it } from 'vitest';
import { exerciseRows, filterExerciseRows, groupExercisesByMuscle, groupWorkoutsByMonth } from './historyView';
import type { ExerciseMeta, HistWorkout } from './stats';

function workout(id: string, startedAt: string, exerciseId: string, sets: [number, number][]): HistWorkout {
  return {
    id,
    name: 'Push',
    startedAt,
    finishedAt: null,
    feedback: null,
    exercises: [
      {
        exerciseId,
        equipmentKg: 0,
        sets: sets.map(([weightKg, reps]) => ({ type: 'working' as const, weightKg, reps })),
      },
    ],
  } as unknown as HistWorkout;
}

const meta: Record<string, ExerciseMeta> = {
  bench: { name: 'Bankdrücken', primary: ['chest'], secondary: [] },
  row: { name: 'Rudern', primary: ['back'], secondary: [] },
  free: { name: 'Freie Übung', primary: [], secondary: [] },
};

describe('groupWorkoutsByMonth', () => {
  it('gruppiert nach Monat, neueste zuerst, mit Summen', () => {
    const list = [
      workout('a', '2026-09-30T10:00:00', 'bench', [[100, 5]]),
      workout('b', '2026-10-02T10:00:00', 'bench', [[100, 5], [100, 5]]),
      workout('c', '2026-10-04T10:00:00', 'bench', [[50, 10]]),
    ];
    const g = groupWorkoutsByMonth(list);
    expect(g.map((x) => x.key)).toEqual(['2026-10', '2026-09']);
    expect(g[0].sessions).toBe(2);
    expect(g[0].workingSets).toBe(3);
    expect(g[0].workouts.map((w) => w.id)).toEqual(['c', 'b']);
    expect(g[1].sessions).toBe(1);
  });

  it('liefert bei leerer Liste keine Gruppen', () => {
    expect(groupWorkoutsByMonth([])).toEqual([]);
  });
});

describe('exerciseRows', () => {
  const list = [
    workout('a', '2026-09-01T10:00:00', 'bench', [[80, 8]]),
    workout('b', '2026-09-08T10:00:00', 'bench', [[85, 8]]),
    workout('c', '2026-09-09T10:00:00', 'row', [[60, 10]]),
  ];

  it('berechnet Trend, letzten Wert und Differenz', () => {
    const rows = exerciseRows(list, meta);
    const bench = rows.find((r) => r.id === 'bench')!;
    expect(bench.sessions).toBe(2);
    expect(bench.trend).toHaveLength(2);
    expect(bench.delta).toBeGreaterThan(0);
    expect(bench.unit).toBe('kg');
    expect(bench.muscle).toBe('chest');
    expect(rows[0].id).toBe('row');
  });

  it('filtert nach Namen ohne Groß-/Kleinschreibung', () => {
    const rows = exerciseRows(list, meta);
    expect(filterExerciseRows(rows, ' BANK ').map((r) => r.id)).toEqual(['bench']);
    expect(filterExerciseRows(rows, '')).toHaveLength(2);
  });

  it('gruppiert nach Hauptmuskel, Übungen ohne Muskel zuletzt', () => {
    const rows = exerciseRows([...list, workout('d', '2026-09-10T10:00:00', 'free', [[10, 10]])], meta);
    const g = groupExercisesByMuscle(rows, (m) => (m === 'chest' ? 'Brust' : 'Rücken'));
    expect(g.map((x) => x.muscle)).toEqual(['chest', 'back', '']);
  });
});
