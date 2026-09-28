import type { HistWorkout } from './stats';
import type { HistFootballSession, HistStretchSession } from './storage';

export type CombinedHistoryEntry =
  | { kind: 'workout'; at: string; workout: HistWorkout }
  | { kind: 'stretch'; at: string; session: HistStretchSession }
  | { kind: 'football'; at: string; session: HistFootballSession };

/**
 * Trainings, Stretching-Sessions und Fußball-Einträge rein für eine gemeinsame
 * chronologische Übersicht zusammenführen (neueste zuerst). Nur fürs Anzeigen gedacht:
 * Die Muskel-Auswertung (Sätze pro Muskel usw.) bleibt exklusiv auf HistWorkout und
 * rechnet nie mit den anderen Bereichen, damit sie durch diese Übersicht nicht
 * verfälscht wird.
 */
export function combineHistory(
  workouts: HistWorkout[],
  stretches: HistStretchSession[],
  footballs: HistFootballSession[] = [],
): CombinedHistoryEntry[] {
  const entries: CombinedHistoryEntry[] = [
    ...workouts.map((w) => ({ kind: 'workout' as const, at: w.startedAt, workout: w })),
    ...stretches.map((s) => ({ kind: 'stretch' as const, at: s.startedAt, session: s })),
    ...footballs.map((f) => ({ kind: 'football' as const, at: f.playedOn, session: f })),
  ];
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
