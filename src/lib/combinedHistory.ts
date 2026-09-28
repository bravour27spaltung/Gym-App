import type { HistWorkout } from './stats';
import type { HistStretchSession } from './storage';

export type CombinedHistoryEntry =
  | { kind: 'workout'; at: string; workout: HistWorkout }
  | { kind: 'stretch'; at: string; session: HistStretchSession };

/**
 * Trainings und Stretching-Sessions rein für eine gemeinsame chronologische Übersicht
 * zusammenführen (neueste zuerst). Nur fürs Anzeigen gedacht: Die Muskel-Auswertung
 * (Sätze pro Muskel usw.) bleibt exklusiv auf HistWorkout und rechnet nie mit
 * Stretching-Daten, damit sie durch diese Übersicht nicht verfälscht wird.
 */
export function combineHistory(
  workouts: HistWorkout[],
  stretches: HistStretchSession[],
): CombinedHistoryEntry[] {
  const entries: CombinedHistoryEntry[] = [
    ...workouts.map((w) => ({ kind: 'workout' as const, at: w.startedAt, workout: w })),
    ...stretches.map((s) => ({ kind: 'stretch' as const, at: s.startedAt, session: s })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
