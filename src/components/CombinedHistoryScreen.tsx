import { fmtDay, fmtTime } from '../lib/format';
import { combineHistory } from '../lib/combinedHistory';
import { footballKindLabel, footballLoad } from '../lib/football';
import type { HistWorkout } from '../lib/stats';
import type { HistFootballSession, HistStretchSession } from '../lib/storage';
import { Icon } from './ui';

interface Props {
  workouts: HistWorkout[];
  stretches: HistStretchSession[];
  footballs: HistFootballSession[];
}

function workoutMinutes(w: HistWorkout): number {
  if (!w.finishedAt) return 0;
  return Math.max(0, Math.round((new Date(w.finishedAt).getTime() - new Date(w.startedAt).getTime()) / 60_000));
}

function stretchMinutes(s: HistStretchSession): number {
  if (!s.finishedAt) return 0;
  return Math.max(0, Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000));
}

function workoutSets(w: HistWorkout): number {
  return w.exercises.reduce((n, e) => n + e.sets.filter((s) => s.type === 'working').length, 0);
}

/**
 * Reine chronologische Übersicht über Training und Stretching gemeinsam. Zeigt bewusst
 * keine Muskel-Auswertung — die bleibt exklusiv im Gym-Verlauf (HistoryScreen), damit
 * Stretching-Einheiten die Sätze-pro-Muskel-Statistik nicht verfälschen.
 */
export function CombinedHistoryScreen({ workouts, stretches, footballs }: Props) {
  const entries = combineHistory(workouts, stretches, footballs);

  if (entries.length === 0) {
    return (
      <div className="screen">
        <header className="pagehead">
          <h1>Alles</h1>
        </header>
        <div className="empty-state">
          <Icon name="list" size={32} />
          <p>Noch nichts gespeichert.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Alles</h1>
      </header>
      <ul className="exlist">
        {entries.map((e) => (
          <li key={`${e.kind}-${e.kind === 'workout' ? e.workout.id : e.session.id}`}>
            <div className="exrow static">
              <Icon name={e.kind === 'workout' ? 'dumbbell' : e.kind === 'stretch' ? 'flame' : 'football'} size={18} />
              <span className="exrow-text">
                <strong>
                  {e.kind === 'football' ? fmtDay(e.at) : `${fmtDay(e.at)} · ${fmtTime(e.at)}`}
                </strong>
                <small>
                  {e.kind === 'workout' &&
                    `${e.workout.name} · ${workoutMinutes(e.workout)} min · ${workoutSets(e.workout)} Sätze`}
                  {e.kind === 'stretch' &&
                    `Stretching · ${stretchMinutes(e.session)} min · ${e.session.items.length} ${
                      e.session.items.length === 1 ? 'Übung' : 'Übungen'
                    }`}
                  {e.kind === 'football' &&
                    `${footballKindLabel(e.session.kind)} · ${e.session.minutes} min · Belastung ${footballLoad(
                      e.session.minutes,
                      e.session.rpe,
                    )}`}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
