import { useEffect, useRef, useState } from 'react';
import type { ExerciseListItem, LastInfo } from '../lib/storage';
import { startRest } from '../lib/timer';
import { unlockAudio } from '../lib/sound';
import {
  addExercise,
  addSet,
  addWarmups,
  removeExercise,
  removeSet,
  toggleDone,
  updateExercise,
  updateSet,
  updateSetWeight,
  type Draft,
  type DraftExercise,
  type ExerciseInput,
} from '../lib/workout';
import { AddExercise } from './AddExercise';
import { ExerciseCard } from './ExerciseCard';
import { RestTimer } from './RestTimer';
import { Icon } from './ui';

interface Props {
  draft: Draft;
  exercises: ExerciseListItem[];
  /** Ändert den Entwurf; die Funktion bekommt immer den aktuellen Stand. */
  onUpdate: (fn: (d: Draft) => Draft) => void;
  loadLast: (exerciseId: string, isNew: boolean) => Promise<LastInfo>;
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

/** Alle Arbeitssätze erledigt (und mindestens einer vorhanden). */
function isComplete(e: DraftExercise): boolean {
  const working = e.sets.filter((s) => s.type === 'working');
  return working.length > 0 && working.every((s) => s.done);
}

/** Erste Übung, in der noch ein Arbeitssatz offen ist; sonst die erste Übung. */
function firstOpenExercise(draft: Draft): DraftExercise | undefined {
  return draft.exercises.find((e) => !isComplete(e)) ?? draft.exercises[0];
}

export function WorkoutScreen({
  draft,
  exercises,
  onUpdate,
  loadLast,
  onFinish,
  onDiscard,
  busy,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Die Übung im Fokus wird festgehalten, damit sie nicht wegspringt, wenn ihr letzter Satz fertig ist.
  const [currentId, setCurrentId] = useState<string | null>(() => firstOpenExercise(draft)?.id ?? null);
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const minutes = useElapsedMinutes(draft.startedAt);
  // Eine Pause, die vor über 10 Minuten endete, gilt als erledigt (z. B. nach langem Neuladen).
  const restEndsAt =
    draft.restEndsAt != null && draft.restEndsAt > Date.now() - REST_STALE_MS ? draft.restEndsAt : null;
  const setRest = (ms: number | null) => onUpdate((d) => ({ ...d, restEndsAt: ms }));
  useWakeLock();

  // Neu hinzugefügte Übung sofort in den Fokus nehmen.
  const prevCount = useRef(draft.exercises.length);
  useEffect(() => {
    if (draft.exercises.length > prevCount.current) {
      setCurrentId(draft.exercises[draft.exercises.length - 1].id);
      setSelectedSetId(null);
    }
    prevCount.current = draft.exercises.length;
  }, [draft.exercises]);

  const doneCount = draft.exercises.reduce(
    (n, e) => n + e.sets.filter((s) => s.done).length,
    0,
  );
  const totalCount = draft.exercises.reduce((n, e) => n + e.sets.filter((s) => s.type === 'working').length, 0);

  const current: DraftExercise | undefined =
    draft.exercises.find((e) => e.id === currentId) ?? firstOpenExercise(draft);
  const currentIndex = current ? draft.exercises.findIndex((e) => e.id === current.id) : -1;
  const nextExercise = currentIndex >= 0 ? draft.exercises[currentIndex + 1] : undefined;

  // Aktiver Satz: der gewählte, sonst der erste noch offene Satz der Übung (Aufwärmsätze zuerst).
  const activeSet = current
    ? (current.sets.find((s) => s.id === selectedSetId) ?? current.sets.find((s) => !s.done))
    : undefined;

  function focusExercise(id: string) {
    setCurrentId(id);
    setSelectedSetId(null);
  }

  async function handlePick(input: ExerciseInput) {
    setAdding(false);
    const last = await loadLast(input.exerciseId, input.isNew);
    onUpdate((d) => addExercise(d, { ...input, lastSets: last.sets, equipmentKg: last.equipmentKg }));
  }

  function handleToggle(exId: string, setId: string) {
    const ex = draft.exercises.find((e) => e.id === exId);
    const set = ex?.sets.find((s) => s.id === setId);
    if (ex && set && !set.done && set.type === 'working') {
      unlockAudio();
      setRest(startRest(Date.now(), ex.restSeconds));
    }
    onUpdate((d) => toggleDone(d, exId, setId));
    // Danach springt der Editor zum nächsten offenen Satz.
    setSelectedSetId(null);
  }

  function closeConfirm() {
    setConfirming(false);
    setConfirmDiscard(false);
  }

  return (
    <div className="workout">
      <header className="appbar workout-bar">
        <div className="workout-title">
          <h1>{draft.name}</h1>
          <p>
            {minutes} min · {doneCount} {doneCount === 1 ? 'Satz' : 'Sätze'} erledigt
            {totalCount > 0 ? ` von ${totalCount}` : ''}
          </p>
        </div>
        <button
          type="button"
          className="btn primary compact"
          disabled={busy}
          onClick={() => setConfirming(true)}
        >
          Beenden
        </button>
      </header>

      <div className="screen">
        {draft.exercises.length > 0 && (
          <nav className="chips scroll fx-strip" aria-label="Übungen dieses Trainings">
            {draft.exercises.map((e, i) => {
              const on = e.id === current?.id;
              const done = isComplete(e);
              return (
                <button
                  key={e.id}
                  type="button"
                  className={`chip fx-ex ${on ? 'on' : ''} ${done ? 'done' : ''}`}
                  aria-current={on ? 'step' : undefined}
                  aria-label={`Übung ${i + 1}: ${e.name}${done ? ', erledigt' : ''}`}
                  onClick={() => focusExercise(e.id)}
                >
                  <span className="fx-ex-no">{done ? <Icon name="check" size={14} /> : i + 1}</span>
                  <span className="fx-ex-name">{e.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              className="chip fx-ex fx-ex-add"
              aria-label="Übung hinzufügen"
              onClick={() => setAdding(true)}
            >
              <Icon name="plus" size={18} />
            </button>
          </nav>
        )}

        {draft.exercises.length === 0 && (
          <div className="empty-state">
            <Icon name="dumbbell" size={32} />
            <p>Noch keine Übung.</p>
            <p className="muted">Füge die erste Übung hinzu.</p>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={20} /> Übung hinzufügen
            </button>
          </div>
        )}

        {current && (
          <ExerciseCard
            key={current.id}
            exercise={current}
            activeSetId={activeSet?.id ?? null}
            onSelect={setSelectedSetId}
            onSetWeight={(setId, kg) => onUpdate((d) => updateSetWeight(d, current.id, setId, kg))}
            onUpdateSet={(setId, patch) => onUpdate((d) => updateSet(d, current.id, setId, patch))}
            onToggleSet={(setId) => handleToggle(current.id, setId)}
            onAddSet={() => {
              onUpdate((d) => addSet(d, current.id));
              setSelectedSetId(null);
            }}
            onRemoveSet={(setId) => onUpdate((d) => removeSet(d, current.id, setId))}
            onWarmup={(level) => {
              onUpdate((d) => addWarmups(d, current.id, level));
              setSelectedSetId(null);
            }}
            onRest={(seconds) => onUpdate((d) => updateExercise(d, current.id, { restSeconds: seconds }))}
            onEquipment={(kg) => onUpdate((d) => updateExercise(d, current.id, { equipmentKg: kg }))}
            onRemove={() => {
              onUpdate((d) => removeExercise(d, current.id));
              setCurrentId(null);
              setSelectedSetId(null);
            }}
            next={
              isComplete(current) && !activeSet
                ? nextExercise
                  ? { label: `Weiter: ${nextExercise.name}`, onClick: () => focusExercise(nextExercise.id) }
                  : { label: 'Training beenden', onClick: () => setConfirming(true) }
                : null
            }
          />
        )}
      </div>

      <RestTimer
        endsAt={restEndsAt}
        onAdd={(sec) =>
          onUpdate((d) => (d.restEndsAt ? { ...d, restEndsAt: d.restEndsAt + sec * 1000 } : d))
        }
        onStop={() => setRest(null)}
      />

      {confirming && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Training beenden">
          <div className="modal-card">
            {doneCount > 0 ? (
              <>
                <h2>Training speichern?</h2>
                <p className="muted">
                  {doneCount} {doneCount === 1 ? 'Satz' : 'Sätze'} in {minutes} min.
                  {totalCount > doneCount && ' Nicht abgehakte Sätze werden nicht gespeichert.'}
                </p>
                <button type="button" className="btn primary block" disabled={busy} onClick={onFinish}>
                  {busy ? 'Speichere …' : 'Speichern'}
                </button>
              </>
            ) : (
              <>
                <h2>Kein Satz erledigt</h2>
                <p className="muted">Ohne abgehakte Sätze wird nichts gespeichert.</p>
              </>
            )}
            <button type="button" className="btn block" onClick={closeConfirm}>
              Weiter trainieren
            </button>
            {!confirmDiscard ? (
              <button type="button" className="textbtn danger" onClick={() => setConfirmDiscard(true)}>
                Training verwerfen
              </button>
            ) : (
              <button type="button" className="btn danger block" onClick={onDiscard}>
                {doneCount > 0
                  ? `Wirklich verwerfen (${doneCount} ${doneCount === 1 ? 'Satz geht' : 'Sätze gehen'} verloren)`
                  : 'Wirklich verwerfen'}
              </button>
            )}
          </div>
        </div>
      )}

      {adding && (
        <AddExercise exercises={exercises} onPick={handlePick} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}
