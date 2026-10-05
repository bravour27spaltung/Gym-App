import { fmtDay, fmtTime } from '../lib/format';
import { combineHistory, groupEntriesByMonth } from '../lib/combinedHistory';
import { footballKindLabel, footballLoad } from '../lib/football';
import type { HistWorkout } from '../lib/stats';
import type { HistFootballSession, HistStretchSession } from '../lib/storage';
import { Icon } from './ui';

interface Props {
  workouts: HistWorkout[];
  stretches: HistStretchSession[];
  footballs: HistFootballSession[];
  /** Öffnet die Einheit im Gym-Verlauf. Stretching und Fußball haben keine Detailansicht. */
  onOpenWorkout?: (id: string) => void;
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
export function CombinedHistoryScreen({ workouts, stretches, footballs, onOpenWorkout }: Props) {
  const entries = combineHistory(workouts, stretches, footballs);
  const months = groupEntriesByMonth(entries);

  if (entries.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">
          <Icon name="list" size={32} />
          <p>Noch nichts gespeichert.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      {months.map((m) => (
        <section key={m.key} aria-label={m.label}>
          <h2 className="section-title monthhead">
            <span>{m.label}</span>
            <span className="monthsum">
              {m.entries.length} {m.entries.length === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          </h2>
          <ul className="exlist">
            {m.entries.map((e) => {
              const id = e.kind === 'workout' ? e.workout.id : e.session.id;
              const body = (
                <>
                  <Icon name={e.kind === 'workout' ? 'dumbbell' : e.kind === 'stretch' ? 'flame' : 'football'} size={18} />
                  <span className="exrow-text">
                    <strong>{e.kind === 'football' ? fmtDay(e.at) : `${fmtDay(e.at)} · ${fmtTime(e.at)}`}</strong>
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
                  {e.kind === 'workout' && onOpenWorkout && <Icon name="forward" size={20} />}
                </>
              );
              return (
                <li key={`${e.kind}-${id}`}>
                  {e.kind === 'workout' && onOpenWorkout ? (
                    <button type="button" className="exrow" onClick={() => onOpenWorkout(e.workout.id)}>
                      {body}
                    </button>
                  ) : (
                    <div className="exrow static">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
