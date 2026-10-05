import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ExerciseMeta, HistWorkout } from '../lib/stats';
import { HistoryScreen } from './HistoryScreen';

const workouts = [
  {
    id: 'w1',
    name: 'Push',
    startedAt: '2026-10-02T10:00:00',
    finishedAt: '2026-10-02T11:00:00',
    feedback: null,
    exercises: [{ exerciseId: 'bench', equipmentKg: 0, sets: [{ type: 'working', weightKg: 80, reps: 8 }] }],
  },
  {
    id: 'w2',
    name: 'Push',
    startedAt: '2026-09-25T10:00:00',
    finishedAt: '2026-09-25T11:00:00',
    feedback: null,
    exercises: [{ exerciseId: 'bench', equipmentKg: 0, sets: [{ type: 'working', weightKg: 77.5, reps: 8 }] }],
  },
] as unknown as HistWorkout[];

const meta: Record<string, ExerciseMeta> = { bench: { name: 'Bankdrücken', primary: ['chest'], secondary: [] } };

describe('HistoryScreen', () => {
  it('zeigt Unter-Reiter und keine eigene Überschrift', () => {
    const html = renderToString(<HistoryScreen workouts={workouts} meta={meta} />);
    expect(html).toContain('Übersicht');
    expect(html).toContain('Einheiten');
    expect(html).toContain('Übungen');
    expect(html).not.toContain('<h1>');
    expect(html).toContain('Letzte 7 Tage');
  });

  it('öffnet mit openWorkoutId direkt die Einheit', () => {
    const html = renderToString(<HistoryScreen workouts={workouts} meta={meta} openWorkoutId="w1" />);
    expect(html).toContain('Zurück zum Verlauf');
    expect(html).toContain('Bankdrücken');
  });

  it('leerer Verlauf zeigt den Leerzustand', () => {
    expect(renderToString(<HistoryScreen workouts={[]} meta={{}} />)).toContain('Noch kein abgeschlossenes Training');
  });
});
