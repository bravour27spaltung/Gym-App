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

export interface CombinedMonth {
  key: string;
  label: string;
  entries: CombinedHistoryEntry[];
}

/** Teilt eine (neueste-zuerst sortierte) Liste in Kalendermonate; Reihenfolge bleibt erhalten. */
export function groupEntriesByMonth(entries: CombinedHistoryEntry[]): CombinedMonth[] {
  const months: CombinedMonth[] = [];
  for (const e of entries) {
    const d = new Date(e.at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    let m = months[months.length - 1];
    if (!m || m.key !== key) {
      m = { key, label: d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }), entries: [] };
      months.push(m);
    }
    m.entries.push(e);
  }
  return months;
}
