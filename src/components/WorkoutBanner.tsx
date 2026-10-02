import { useEffect, useState } from 'react';
import { formatClock, remainingSeconds } from '../lib/timer';
import { workoutProgress, type Draft } from '../lib/workout';
import { Icon } from './ui';

interface Props {
  draft: Draft;
  /** Zurück ins laufende Training. */
  onResume: () => void;
  /** true, wenn keine untere Navigation sichtbar ist (z. B. im Plan-Editor). */
  low?: boolean;
}

/**
 * Hinweisleiste über der Navigation, solange ein Training läuft, aber das Home-Menü (oder
 * ein anderer Bereich) offen ist. Zeigt Dauer, Fortschritt und die laufende Pause und führt
 * mit einem Tipp zurück ins Training.
 */
export function WorkoutBanner({ draft, onResume, low }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const minutes = Math.max(0, Math.floor((now - new Date(draft.startedAt).getTime()) / 60_000));
  const { done, total } = workoutProgress(draft);
  const rest = draft.restEndsAt != null ? remainingSeconds(draft.restEndsAt, now) : 0;

  return (
    <button
      type="button"
      className={low ? 'workout-banner low' : 'workout-banner'}
      aria-label={`Training „${draft.name}" läuft. Zurück zum Training`}
      onClick={onResume}
    >
      <span className="wb-icon" aria-hidden="true">
        <Icon name="dumbbell" size={20} />
      </span>
      <span className="wb-text">
        <strong>{draft.name}</strong>
        <small>
          {minutes} min · {done}/{total} Sätze
          {rest > 0 ? ` · Pause ${formatClock(rest)}` : ''}
        </small>
      </span>
      <span className="wb-go">
        Fortsetzen <Icon name="forward" size={16} />
      </span>
    </button>
  );
}
