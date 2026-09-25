import { useEffect, useState } from 'react';
import type { LoggedSet } from '../lib/progression';
import type { ExerciseListItem } from '../lib/storage';
import { startRest } from '../lib/timer';
import { unlockAudio } from '../lib/sound';
import {
  addExercise,
  addSet,
  addWarmups,
  copyWeightToLaterSets,
  removeExercise,
  removeSet,
  toggleDone,
  updateExercise,
  updateSet,
  type Draft,
  type ExerciseInput,
} from '../lib/workout';
import { AddExercise } from './AddExercise';
import { ExerciseCard } from './ExerciseCard';
import { RestTimer } from './RestTimer';

interface Props {
  draft: Draft;
  exercises: ExerciseListItem[];
  /** Ändert den Entwurf; die Funktion bekommt immer den aktuellen Stand. */
  onUpdate: (fn: (d: Draft) => Draft) => void;
  loadLastSets: (exerciseId: string, isNew: boolean) => Promise<LoggedSet[]>;
  onFinish: () => void;
  onDiscard: () => void;
  busy: boolean;
}

const REST_STALE_MS = 10 * 60 * 1000;

/** Hält den Bildschirm wach, solange das Training läuft (wo der Browser es erlaubt). */
function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;

    async function request() {
      try {
        if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
        const l = await navigator.wakeLock.request('screen');
        if (cancelled) void l.release();
        else lock = l;
      } catch {
        /* nicht unterstützt oder abgelehnt: ohne Wachhalten weiter */
      }
    }

    void request();
    const onVisible = () => void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, []);
}

function useElapsedMinutes(startedAt: string): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
}

export function WorkoutScreen({
  draft,
  exercises,
  onUpdate,
  loadLastSets,
  onFinish,
  onDiscard,
  busy,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const minutes = useElapsedMinutes(draft.startedAt);
  // Eine Pause, die vor über 10 Minuten endete, gilt als erledigt (z. B. nach langem Neuladen).
  const restEndsAt =
    draft.restEndsAt != null && draft.restEndsAt > Date.now() - REST_STALE_MS ? draft.restEndsAt : null;
  const setRest = (ms: number | null) => onUpdate((d) => ({ ...d, restEndsAt: ms }));
  useWakeLock();

  const doneCount = draft.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done).length,
    0,
  );

  async function handlePick(input: ExerciseInput) {
    setAdding(false);
    const lastSets = await loadLastSets(input.exerciseId, input.isNew);
    onUpdate((d) => addExercise(d, { ...input, lastSets }));
  }

  function handleToggle(exId: string, setId: string) {
    const ex = draft.exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (ex && set && !set.done && set.type === 'working') {
      unlockAudio();
      setRest(startRest(Date.now(), ex.restSeconds));
    }
    onUpdate((d) => toggleDone(d, exId, setId));
  }

  return (
    <div className="screen">
      <header className="top">
        <div>
          <h1>{draft.name}</h1>
          <p className="muted">
            {minutes} min · {doneCount} {doneCount === 1 ? 'Satz' : 'Sätze'} erledigt
          </p>
        </div>
      </header>

      {draft.exercises.length === 0 && (
        <p className="muted">Noch keine Übung. Füge unten die erste hinzu.</p>
      )}

      {draft.exercises.map((e) => (
        <ExerciseCard
          key={e.id}
          exercise={e}
          onUpdateSet={(setId, patch) => onUpdate((d) => updateSet(d, e.id, setId, patch))}
          onToggleSet={(setId) => handleToggle(e.id, setId)}
          onAddSet={() => onUpdate((d) => addSet(d, e.id))}
          onRemoveSet={(setId) => onUpdate((d) => removeSet(d, e.id, setId))}
          onCopyWeight={(setId) => onUpdate((d) => copyWeightToLaterSets(d, e.id, setId))}
          onWarmup={(level) => onUpdate((d) => addWarmups(d, e.id, level))}
          onRest={(seconds) => onUpdate((d) => updateExercise(d, e.id, { restSeconds: seconds }))}
          onEquipment={(kg) => onUpdate((d) => updateExercise(d, e.id, { equipmentKg: kg }))}
          onRemove={() => onUpdate((d) => removeExercise(d, e.id))}
        />
      ))}

      <button type="button" className="btn primary" onClick={() => setAdding(true)}>
        + Übung hinzufügen
      </button>

      <div className="finish">
        {!confirming ? (
          <button type="button" className="btn" disabled={busy} onClick={() => setConfirming(true)}>
            Training beenden
          </button>
        ) : doneCount > 0 ? (
          <>
            <p>Training mit {doneCount} erledigten Sätzen speichern?</p>
            <button type="button" className="btn primary" disabled={busy} onClick={onFinish}>
              {busy ? 'Speichere …' : 'Speichern'}
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Zurück
            </button>
          </>
        ) : (
          <>
            <p>Kein Satz ist erledigt. Training verwerfen?</p>
            <button type="button" className="btn danger" onClick={onDiscard}>
              Verwerfen
            </button>
            <button type="button" className="btn" onClick={() => setConfirming(false)}>
              Zurück
            </button>
          </>
        )}
      </div>

      <RestTimer
        endsAt={restEndsAt}
        onAdd={(sec) =>
          onUpdate((d) => (d.restEndsAt ? { ...d, restEndsAt: d.restEndsAt + sec * 1000 } : d))
        }
        onStop={() => setRest(null)}
      />

      {adding && (
        <AddExercise exercises={exercises} onPick={handlePick} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
